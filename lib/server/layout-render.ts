import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { Resvg } from "@resvg/resvg-js";
import { fontFamily, layoutSvg, type LayoutDocument } from "@/lib/layout-studio";
import { boardFont } from "@/lib/board-fonts";
import { dataUriDims, imageDims } from "@/lib/image-dims";

const BOARD_EDGE = 1920;

/**
 * Shrink a library photo to the board before Resvg sees it.
 * A full camera file inside the SVG is decoded on the request thread and holds the player polls.
 */
export async function prepareBoardPhoto(bytes: Uint8Array, mime: string, maxEdge = BOARD_EDGE): Promise<{ bytes: Buffer; mime: "image/png" | "image/jpeg" | "image/webp" }> {
  const labeled = mime === "image/png" || mime === "image/webp" ? mime : "image/jpeg";
  try {
    const image = await loadImage(Buffer.from(bytes));
    const edge = Math.max(image.width, image.height);
    if (edge <= maxEdge && bytes.byteLength <= 700_000 && labeled !== "image/webp") {
      return { bytes: Buffer.from(bytes), mime: labeled };
    }
    const scale = Math.min(1, maxEdge / Math.max(edge, 1));
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

export function renderLayoutPng(doc: LayoutDocument, image?: BoardImage | null, extras?: { logo?: BoardImage | null; itemImages?: Record<string, BoardImage>; width?: number }): Buffer {
  const href = dataUri(image);
  // Template boards (doc.design) may show a bundled stock photo, a logo and item photos. Original layouts may show
  // item photos (thumbnails). Boards without them render exactly as before.
  let art: Parameters<typeof layoutSvg>[1] = { imageHref: href };
  if (!doc.design && extras?.itemImages) {
    const itemImages: Record<string, string> = {};
    for (const section of doc.sections) for (const item of section.items) {
      const own = item.imageMediaId ? extras.itemImages[item.imageMediaId] : null;
      if (item.imageMediaId && own) itemImages[item.imageMediaId] = dataUri(own) ?? "";
    }
    if (Object.keys(itemImages).length) art = { imageHref: href, itemImages };
  }
  if (doc.design) {
    const stockHrefs: Record<string, string> = {};
    const itemImages: Record<string, string> = {};
    for (const section of doc.sections) {
      for (const item of section.items) {
        if (item.stockPhoto && !stockHrefs[item.stockPhoto]) stockHrefs[item.stockPhoto] = stockPhotoDataUri(item.stockPhoto) ?? "";
        const own = item.imageMediaId ? extras?.itemImages?.[item.imageMediaId] : null;
        if (item.imageMediaId && own) itemImages[item.imageMediaId] = dataUri(own) ?? "";
      }
    }
    art = { imageHref: href, stockHref: href ? null : stockPhotoDataUri(doc.stockPhoto), logoHref: dataUri(extras?.logo), stockHrefs, itemImages };
  }
  // Guided customization: a focal point needs the featured photo's own size to place it exactly (as the editor does).
  // t421u: zoom places the photo with the same exact math, so it needs the size too.
  if (doc.custom?.imageFocus || typeof doc.custom?.imageZoom === "number") {
    const source = image && image.bytes.length ? imageDims(image.bytes) : dataUriDims(art?.stockHref ?? (doc.design ? stockPhotoDataUri(doc.stockPhoto) : null));
    art = { ...art, imageSize: source };
  }
  const resvg = new Resvg(layoutSvg(doc, art), {
    font: { fontFiles: fontsFor(doc.font, doc.bodyFont), loadSystemFonts: false, defaultFontFamily: fontFamily(doc.font) },
    // width only for scaled previews (catalog thumbnails); published boards keep the original 1920×1080.
    fitTo: extras?.width ? { mode: "width", value: extras.width } : { mode: "original" },
  });
  return Buffer.from(resvg.render().asPng());
}
