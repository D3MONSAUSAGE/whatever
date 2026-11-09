import { join } from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { Resvg } from "@resvg/resvg-js";
import { fontFamily, layoutSvg, type LayoutDocument } from "@/lib/layout-studio";

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

const FONTS = [
  "Inter-Regular.ttf", "Inter-Bold.ttf", "Inter-ExtraBold.ttf",
  "NotoSerif-Regular.ttf", "NotoSerif-Bold.ttf",
].map((file) => join(process.cwd(), "assets", "fonts", file));

/** Whole-board PNG. The selected bundled face and the assigned photo are drawn into this file. */
export function renderLayoutPng(doc: LayoutDocument, image?: { bytes: Uint8Array; mime: "image/png" | "image/jpeg" | "image/webp" } | null): Buffer {
  const href = image && image.bytes.length
    ? `data:${image.mime};base64,${Buffer.from(image.bytes).toString("base64")}`
    : null;
  const resvg = new Resvg(layoutSvg(doc, { imageHref: href }), {
    font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: fontFamily(doc.font) },
    fitTo: { mode: "original" },
  });
  return Buffer.from(resvg.render().asPng());
}
