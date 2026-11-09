import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { layoutSvg, type LayoutDocument } from "@/lib/layout-studio";

const FONTS = ["Inter-Regular.ttf", "Inter-Bold.ttf", "Inter-ExtraBold.ttf"].map((file) => join(process.cwd(), "assets", "fonts", file));

/** Whole-board PNG. The video slot is painted. Pass the assigned photo so it is actually drawn. */
export function renderLayoutPng(doc: LayoutDocument, image?: { bytes: Uint8Array; mime: "image/png" | "image/jpeg" } | null): Buffer {
  const href = image && image.bytes.length
    ? `data:${image.mime};base64,${Buffer.from(image.bytes).toString("base64")}`
    : null;
  const resvg = new Resvg(layoutSvg(doc, { imageHref: href }), {
    font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: "Inter" },
    fitTo: { mode: "original" },
  });
  return Buffer.from(resvg.render().asPng());
}
