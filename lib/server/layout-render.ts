import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { layoutSvg, type LayoutDocument } from "@/lib/layout-studio";

const FONTS = ["Inter-Regular.ttf", "Inter-Bold.ttf", "Inter-ExtraBold.ttf"].map((file) => join(process.cwd(), "assets", "fonts", file));

/** Whole-board PNG. The video slot is painted, so a player that ignores composition still shows a complete frame. */
export function renderLayoutPng(doc: LayoutDocument): Buffer {
  const resvg = new Resvg(layoutSvg(doc), {
    font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: "Inter" },
    fitTo: { mode: "original" },
  });
  return Buffer.from(resvg.render().asPng());
}
