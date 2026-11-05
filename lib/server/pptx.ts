import { readFile } from "node:fs/promises";
import path from "node:path";
import { convertPptxToPng } from "pptx-glimpse";
import { db } from "./supabase";
import { isMissingSchema } from "./schema";
import { stripControls } from "./validate";

/** Open XML PowerPoint only. Legacy .ppt and macro .pptm are rejected. */
export const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
export const PPTX_EXT = "pptx";
export const PPTX_MAX_BYTES = 50 * 1024 * 1024;
export const PPTX_MAX_SLIDES = 40;
/** Long edge for rasterized slides. Matches prepare-image TV-friendly size. */
export const PPTX_RENDER_WIDTH = 1280;

export const PRESENTATION_UNAVAILABLE =
  "PowerPoint uploads aren't available yet. Apply migration 0018_pptx_presentations.sql, then reload.";

export type PptxFailure =
  | "type"
  | "size"
  | "empty"
  | "macros"
  | "corrupt"
  | "too_many_slides"
  | "no_slides"
  | "convert";

export type PptxSlide = { png: Uint8Array; width: number; height: number; index: number };

export type PptxConvertResult =
  | { ok: true; slides: PptxSlide[]; warnings: string[] }
  | { ok: false; reason: PptxFailure; detail?: string };

const ZIP_LOCAL = [0x50, 0x4b, 0x03, 0x04]; // PK\x03\x04
const ZIP_EMPTY = [0x50, 0x4b, 0x05, 0x06]; // empty archive

function asciiLower(bytes: Uint8Array, start: number, end: number) {
  let out = "";
  for (let i = start; i < end && i < bytes.length; i++) {
    const c = bytes[i];
    out += String.fromCharCode(c >= 65 && c <= 90 ? c + 32 : c);
  }
  return out;
}

/** True when the buffer looks like a ZIP (OOXML container). */
export function looksLikeZip(bytes: Uint8Array) {
  if (bytes.length < 4) return false;
  if (ZIP_LOCAL.every((v, i) => bytes[i] === v)) return true;
  return ZIP_EMPTY.every((v, i) => bytes[i] === v);
}

/**
 * Lightweight safety checks before we spend CPU on conversion.
 * Rejects macro-enabled packages and obvious non-ZIP uploads. Full OOXML
 * validation happens inside pptx-glimpse during convert.
 */
export function inspectPptx(bytes: Uint8Array): { ok: true } | { ok: false; reason: PptxFailure } {
  if (!bytes.length) return { ok: false, reason: "empty" };
  if (bytes.length > PPTX_MAX_BYTES) return { ok: false, reason: "size" };
  if (!looksLikeZip(bytes)) return { ok: false, reason: "type" };

  // Scan central-directory / local filenames for VBA / macro markers without
  // a full unzip. OOXML stores part names as plain ASCII in local headers.
  const hay = asciiLower(bytes, 0, Math.min(bytes.length, 8 * 1024 * 1024));
  if (
    hay.includes("vbaproject.bin") ||
    hay.includes("vbadata.xml") ||
    hay.includes("macroenabled") ||
    hay.includes("presentationml.presentation.macroenabled")
  ) {
    return { ok: false, reason: "macros" };
  }
  // Prefer a clear reject for non-presentation Office docs (docx/xlsx).
  if (hay.includes("wordprocessingml.document") || hay.includes("spreadsheetml.sheet")) {
    return { ok: false, reason: "type" };
  }
  return { ok: true };
}

export function pptxErrorMessage(reason: PptxFailure, detail?: string): string {
  switch (reason) {
    case "size":
      return "PowerPoint files must be 50 MB or smaller.";
    case "empty":
      return "That PowerPoint file is empty.";
    case "macros":
      return "Macro-enabled PowerPoint files (.pptm) aren't supported. Save as .pptx without macros.";
    case "type":
      return "Upload a .pptx PowerPoint file. Older .ppt files aren't supported yet.";
    case "too_many_slides":
      return `That presentation has too many slides. Use ${PPTX_MAX_SLIDES} or fewer.`;
    case "no_slides":
      return "That PowerPoint file has no slides we could read.";
    case "corrupt":
      return "That PowerPoint file looks damaged. Re-export it as .pptx and try again.";
    case "convert":
      return detail
        ? `Couldn't convert that presentation. ${detail}`
        : "Couldn't convert that presentation. Animations, SmartArt and embedded video become static images when possible; try simplifying the deck.";
    default:
      return "Couldn't upload that PowerPoint file.";
  }
}

let fontCache: { name: string; data: Uint8Array }[] | null = null;

async function presentationFonts() {
  if (fontCache) return fontCache;
  const dir = path.join(process.cwd(), "assets", "fonts");
  const files = [
    ["Inter", "Inter-Regular.ttf"],
    ["Inter", "Inter-Bold.ttf"],
    ["Inter", "Inter-ExtraBold.ttf"],
  ] as const;
  const loaded: { name: string; data: Uint8Array }[] = [];
  for (const [name, file] of files) {
    try {
      loaded.push({ name, data: new Uint8Array(await readFile(path.join(dir, file))) });
    } catch {
      // Fonts are optional; conversion still works with skipSystemFonts fallbacks.
    }
  }
  fontCache = loaded;
  return loaded;
}

/**
 * Rasterize a .pptx into ordered PNG slides. Static only: animations,
 * transitions and embedded video do not play. Uses the free MIT pptx-glimpse
 * engine (no LibreOffice, no paid API).
 */
export async function convertPptx(bytes: Uint8Array): Promise<PptxConvertResult> {
  const inspected = inspectPptx(bytes);
  if (!inspected.ok) return inspected;

  const fonts = await presentationFonts();
  try {
    const report = await convertPptxToPng(bytes, {
      width: PPTX_RENDER_WIDTH,
      skipSystemFonts: true,
      fonts: fonts.length ? fonts : undefined,
      fontMapping: {
        Calibri: "Inter",
        Arial: "Inter",
        "Arial MT": "Inter",
        Helvetica: "Inter",
        "Segoe UI": "Inter",
        "Comic Sans MS": "Inter",
        Georgia: "Inter",
        "Times New Roman": "Inter",
      },
    });
    const slides = (report.slides ?? [])
      .filter((slide) => slide?.png && slide.width > 0 && slide.height > 0)
      .map((slide, index) => ({
        png: slide.png instanceof Uint8Array ? slide.png : new Uint8Array(slide.png),
        width: slide.width,
        height: slide.height,
        index,
      }));
    if (!slides.length) return { ok: false, reason: "no_slides" };
    if (slides.length > PPTX_MAX_SLIDES) return { ok: false, reason: "too_many_slides" };

    const warnings = (report.diagnostics ?? [])
      .filter((d) => d.severity === "warning" || d.severity === "error")
      .map((d) => d.message || d.code)
      .filter(Boolean)
      .slice(0, 12);

    return { ok: true, slides, warnings };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/zip|central directory|end of central|corrupt|invalid/i.test(message)) {
      return { ok: false, reason: "corrupt", detail: message.slice(0, 180) };
    }
    return { ok: false, reason: "convert", detail: message.slice(0, 180) };
  }
}

export async function presentationSchemaReady() {
  const probe = await db().from("media").select("source_media_id").limit(1);
  if (!probe.error) return true;
  return !isMissingSchema(probe.error);
}

export { readStoredObject, removeStored } from "./video";

export function presentationStoragePath(accountId: string, mediaId: string) {
  return `${accountId}/${mediaId}.${PPTX_EXT}`;
}

export function slideStoragePath(accountId: string, slideMediaId: string) {
  return `${accountId}/${slideMediaId}.png`;
}

export function normalizePptxFileName(input: unknown): string {
  const cleaned = (stripControls(String(input ?? "presentation.pptx")).trim() || "presentation.pptx").slice(0, 200);
  if (/\.pptx$/i.test(cleaned)) return cleaned;
  return `${cleaned.replace(/\.[^.]+$/, "") || "presentation"}.pptx`;
}
