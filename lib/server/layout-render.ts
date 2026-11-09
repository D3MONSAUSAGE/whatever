import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { fontFamily, layoutSvg, type LayoutDocument } from "@/lib/layout-studio";

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
