import path from "node:path";
import { pathToFileURL } from "node:url";
import { createCanvas } from "@napi-rs/canvas";
import { PPTX_MAX_SLIDES, PPTX_RENDER_WIDTH, type PptxConvertResult, type PptxFailure, type PptxSlide } from "./pptx";

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46]; // %PDF

export function looksLikePdf(bytes: Uint8Array) {
  if (bytes.length < 5) return false;
  return PDF_MAGIC.every((value, index) => bytes[index] === value);
}

export function inspectPdf(bytes: Uint8Array): { ok: true } | { ok: false; reason: PptxFailure } {
  if (!bytes.length) return { ok: false, reason: "empty" };
  if (!looksLikePdf(bytes)) return { ok: false, reason: "type" };
  return { ok: true };
}

function assetDir(name: "standard_fonts" | "cmaps") {
  return path.join(process.cwd(), "node_modules", "pdfjs-dist", name) + path.sep;
}

type PdfDoc = {
  numPages: number;
  getPage: (n: number) => Promise<{
    getViewport: (opts: { scale: number }) => { width: number; height: number };
    render: (opts: { canvasContext: ReturnType<ReturnType<typeof createCanvas>["getContext"]>; viewport: { width: number; height: number } }) => { promise: Promise<void> };
    cleanup: () => void;
  }>;
  destroy: () => Promise<void>;
};

/**
 * Rasterize a PDF into ordered PNGs with pdfjs-dist (Apache-2.0) and
 * @napi-rs/canvas (MIT). No LibreOffice and no paid API. One page at a time
 * so a long deck does not keep every bitmap decoded.
 */
export async function convertPdf(
  bytes: Uint8Array,
  onPage?: (done: number, total: number) => Promise<void> | void,
): Promise<PptxConvertResult> {
  const inspected = inspectPdf(bytes);
  if (!inspected.ok) return inspected;

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // On Node, pdfjs still import()s the worker module for its in-process fake worker.
  // A relative "./pdf.worker.mjs" is what failed on Vercel when the file was not traced.
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(path.join(
    process.cwd(),
    "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
  )).href;
  // pdfjs' public types disagree with the Node canvas context we pass through.
  let doc: PdfDoc | null = null;
  try {
    const loading = pdfjs.getDocument({
      data: bytes,
      disableWorker: true,
      isEvalSupported: false,
      useWorkerFetch: false,
      standardFontDataUrl: assetDir("standard_fonts"),
      cMapUrl: assetDir("cmaps"),
      cMapPacked: true,
    } as Parameters<typeof pdfjs.getDocument>[0]);
    doc = await loading.promise as unknown as PdfDoc;
    const total = doc.numPages;
    if (!total) return { ok: false, reason: "no_slides" };
    if (total > PPTX_MAX_SLIDES) return { ok: false, reason: "too_many_slides" };

    const slides: PptxSlide[] = [];
    for (let number = 1; number <= total; number++) {
      const page = await doc.getPage(number);
      try {
        const base = page.getViewport({ scale: 1 });
        const longEdge = Math.max(base.width, base.height) || 1;
        const viewport = page.getViewport({ scale: PPTX_RENDER_WIDTH / longEdge });
        const width = Math.max(1, Math.round(viewport.width));
        const height = Math.max(1, Math.round(viewport.height));
        const canvas = createCanvas(width, height);
        const context = canvas.getContext("2d");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, width, height);
        await page.render({ canvasContext: context, viewport }).promise;
        const png = canvas.toBuffer("image/png");
        slides.push({
          png: png instanceof Uint8Array ? png : new Uint8Array(png),
          width,
          height,
          index: number - 1,
        });
      } finally {
        page.cleanup();
      }
      if (onPage) await onPage(number, total);
    }
    if (!slides.length) return { ok: false, reason: "no_slides" };
    return { ok: true, slides, warnings: [] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/password|encrypted/i.test(message)) {
      return { ok: false, reason: "corrupt", detail: "That PDF is password-protected. Export it without a password." };
    }
    if (/invalid|corrupt|format|xref|startxref/i.test(message)) {
      return { ok: false, reason: "corrupt", detail: message.slice(0, 180) };
    }
    return { ok: false, reason: "convert", detail: message.slice(0, 180) };
  } finally {
    if (doc) await doc.destroy().catch(() => undefined);
  }
}
