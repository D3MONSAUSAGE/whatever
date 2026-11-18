import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { Resvg } from "@resvg/resvg-js";
import { fontFamily, layoutSvg, type LayoutDocument } from "@/lib/layout-studio";
import { boardFont } from "@/lib/board-fonts";

const BOARD_EDGE = 1920;

/**
 * Shrink a library photo to the board before Resvg sees it.
 * A full camera file inside the SVG is decoded on the request thread and holds the player polls.
 */
export async function prepareBoardPhoto(bytes: Uint8Array, mime: string): Promise<{ bytes: Buffer; mime: "image/png" | "image/jpeg" | "image/webp" }> {
  const labeled = mime === "image/png" || mime === "image/webp" ? mime : "image/jpeg";
  try {
    const image = await loadImage(Buffer.from(bytes));
    const edge = Math.max(image.width, image.height);
    if (edge <= BOARD_EDGE && bytes.byteLength <= 700_000 && labeled !== "image/webp") {
      return { bytes: Buffer.from(bytes), mime: labeled };
    }
    const scale = Math.min(1, BOARD_EDGE / Math.max(edge, 1));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = createCanvas(width, height);
    canvas.getContext("2d").drawImage(image, 0, 0, width, height);
    return { bytes: canvas.toBuffer("image/jpeg", 82), mime: "image/jpeg" };
  } catch {
    return { bytes: Buffer.from(bytes), mime: labeled };
  }
}

// Inter and Noto Serif are always loaded (as before, so existing boards render identically);
// an E6 face is added only for boards that use it.
const BASE_FONTS = ["inter", "noto-serif"].flatMap((id) => boardFont(id as "inter").files.map((face) => face.file));
const fontPath = (file: string) => join(process.cwd(), "assets", "fonts", file);
/** Heading face plus, when set, the separate body face (E6-F2). Docs without bodyFont load exactly as before. */
export function fontsFor(font: LayoutDocument["font"], bodyFont?: LayoutDocument["bodyFont"]): string[] {
  const files = [...BASE_FONTS];
  for (const id of bodyFont && bodyFont !== font ? [font, bodyFont] : [font]) {
    for (const face of boardFont(id).files) if (!files.includes(face.file)) files.push(face.file);
  }
  return files.map(fontPath);
}

/** Whole-board PNG. The selected bundled face and the assigned photo are drawn into this file. */
type BoardImage = { bytes: Uint8Array; mime: "image/png" | "image/jpeg" | "image/webp" };
const dataUri = (image: BoardImage | null | undefined) => (image && image.bytes.length ? `data:${image.mime};base64,${Buffer.from(image.bytes).toString("base64")}` : null);

/** A template's bundled stock photo (assets/menu-templates), as a data URI for resvg. */
export function stockPhotoDataUri(id: string | undefined): string | null {
  if (!id || !/^[a-z]+$/.test(id)) return null;
  try {
    return `data:image/jpeg;base64,${readFileSync(join(process.cwd(), "assets", "menu-templates", `${id}.jpg`)).toString("base64")}`;
  } catch {
    return null;
  }
}

export function renderLayoutPng(doc: LayoutDocument, image?: BoardImage | null, extras?: { logo?: BoardImage | null }): Buffer {
  const href = dataUri(image);
  // Template boards (doc.design) may show a bundled stock photo and a logo. Older boards never set these fields.
  const art = doc.design
    ? { imageHref: href, stockHref: href ? null : stockPhotoDataUri(doc.stockPhoto), logoHref: dataUri(extras?.logo) }
    : { imageHref: href };
  const resvg = new Resvg(layoutSvg(doc, art), {
    font: { fontFiles: fontsFor(doc.font, doc.bodyFont), loadSystemFonts: false, defaultFontFamily: fontFamily(doc.font) },
    fitTo: { mode: "original" },
  });
  return Buffer.from(resvg.render().asPng());
}
