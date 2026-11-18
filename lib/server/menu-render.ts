import path from "node:path";
import { Resvg } from "@resvg/resvg-js";
import type { MenuContent, MenuTemplate } from "@/lib/menu-templates";
import { ALL_FONT_FILES } from "@/lib/board-fonts";
import { menuSvg, type MenuArt } from "@/lib/menu-classic-svg";

// The drawing is shared with the browser (lib/menu-classic-svg.ts); this file only rasterises it.
export * from "@/lib/menu-classic-svg";

const FONT_DIR = path.join(process.cwd(), "assets", "fonts");
// Every bundled face (E6-F1); Inter stays the default family, so boards without fonts render as before.
const FONTS = ALL_FONT_FILES.map((f) => path.join(FONT_DIR, f));

/** Render a menu to a 1920×1080 PNG with bundled open-source fonts (no paid service). */
export function renderMenuPng(template: MenuTemplate, content: MenuContent, art: MenuArt = {}): Uint8Array {
  const resvg = new Resvg(menuSvg(template, content, art), {
    font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: "Inter" },
    fitTo: { mode: "original" },
  });
  return new Uint8Array(resvg.render().asPng());
}
