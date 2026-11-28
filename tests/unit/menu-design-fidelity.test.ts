import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { BOARD_FONTS } from "@/lib/board-fonts";
import { layoutSvg } from "@/lib/layout-studio";
import { MENU_DESIGNS, designDocument } from "@/lib/menu-designs";
import { withItemPhoto } from "@/lib/menu-item-photos";
import { prepareBoardPhoto, renderLayoutPng, stockPhotoDataUri } from "@/lib/server/layout-render";
import { sampleLayout, type LayoutDocument, type LayoutTemplate } from "@/lib/layout-studio";
import { menuSvg } from "@/lib/menu-classic-svg";
import { renderMenuPng } from "@/lib/server/menu-render";
import { sampleMenu, type MenuTemplate } from "@/lib/menu-templates";

/**
 * The critical requirement: the editor preview and the TV image must be the same picture. The preview is this SVG
 * drawn by the browser; the TV image is the same SVG drawn by resvg on the server. Both are rendered here at
 * 1920×1080 and compared pixel by pixel. Remaining differences are anti-aliasing on glyph and photo edges.
 */
async function launch() {
  try {
    const { chromium } = await import("@playwright/test");
    try {
      return await chromium.launch({ timeout: 20000 });
    } catch {
      return await chromium.launch({ timeout: 20000, executablePath: "/opt/pw-browsers/chromium-1243/chrome-linux64/chrome" });
    }
  } catch {
    return null;
  }
}

export const FIDELITY_OUT = process.env.FIDELITY_OUT || join(tmpdir(), "pekko-menu-fidelity");

describe("template boards: browser preview vs server PNG", () => {
  it("every template matches pixel for pixel within anti-aliasing", async (ctx) => {
    const browser = await launch();
    if (!browser) return ctx.skip("Chromium is not available");
    mkdirSync(FIDELITY_OUT, { recursive: true });
    const faces = BOARD_FONTS.flatMap((font) => font.files.map((face) =>
      `@font-face{font-family:"${font.family}";src:url(data:font/ttf;base64,${readFileSync(resolve("assets/fonts", face.file)).toString("base64")});font-weight:${font.files.filter((x) => !x.italic).length === 1 && !face.italic ? "100 900" : face.weight};font-style:${face.italic ? "italic" : "normal"}}`)).join("");
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const results: Record<string, { mean: number; changed: number }> = {};
    // Every template as shipped, plus text templates carrying an owner's item photo (the Burrata regression).
    const OWNER = "00000000-0000-4000-8000-000000000101";
    const photo = await prepareBoardPhoto(readFileSync(resolve("assets/menu-templates/salad.jpg")), "image/jpeg", 900);
    type Case = { id: string; doc: LayoutDocument; owner: boolean; classic?: MenuTemplate };
    const cases: Case[] = MENU_DESIGNS.map((design) => ({ id: design.id, doc: designDocument(design), owner: false }));
    // Original layouts and classic boards with an item photo (unified menu designer).
    for (const t of ["two-column", "triple-column", "menu-promo-67", "split-50", "menu-banner", "signature", "two-menu-promo"] as LayoutTemplate[]) {
      const doc = sampleLayout(t);
      cases.push({ id: `layout-${t}+item-photo`, doc: { ...doc, sections: withItemPhoto(doc.sections, 0, 0, OWNER) }, owner: true });
    }
    for (const theme of ["classic", "fresh", "bold"] as MenuTemplate[]) cases.push({ id: `classic-${theme}+item-photo`, doc: sampleLayout("menu-promo-67"), owner: true, classic: theme });
    for (const id of ["modern-restaurant", "chalkboard-bistro"]) {
      const doc = designDocument(MENU_DESIGNS.find((d) => d.id === id)!);
      cases.push({ id: `${id}+item-photo`, doc: { ...doc, sections: withItemPhoto(doc.sections, 0, 0, OWNER) }, owner: true });
    }
    for (const { id, doc, owner, classic } of cases) {
      const design = { id };
      const itemImages = owner ? { [OWNER]: `data:${photo.mime};base64,${photo.bytes.toString("base64")}` } : undefined;
      let server: Buffer;
      let svg: string;
      if (classic) {
        const menu = sampleMenu();
        const content = { ...menu, sections: menu.sections.map((sec, i) => (i === 0 ? { ...sec, items: sec.items.map((it, j) => (j === 0 ? { ...it, imageMediaId: OWNER } : it)) } : sec)) };
        server = Buffer.from(renderMenuPng(classic, content, { itemImages }));
        svg = menuSvg(classic, content, { itemImages });
      } else {
        server = renderLayoutPng(doc, null, owner ? { itemImages: { [OWNER]: photo } } : {});
        const stockHrefs = Object.fromEntries(doc.sections.flatMap((sec) => sec.items).filter((item) => item.stockPhoto).map((item) => [item.stockPhoto!, stockPhotoDataUri(item.stockPhoto) ?? ""]));
        svg = layoutSvg(doc, { stockHref: stockPhotoDataUri(doc.stockPhoto), stockHrefs, itemImages });
      }
      await page.setContent(`<!doctype html><style>${faces}body{margin:0}svg{font-family:Inter,sans-serif}</style>${svg}`);
      await page.evaluate(async () => {
        await Promise.all(["Inter", "Noto Serif", "Montserrat", "Oswald", "Bebas Neue", "Lobster"].map((f) => document.fonts.load(`40px "${f}"`)));
        await document.fonts.ready;
      });
      await page.waitForTimeout(100);
      const browserPng = await page.screenshot();
      writeFileSync(join(FIDELITY_OUT, `${design.id}-server.png`), server);
      writeFileSync(join(FIDELITY_OUT, `${design.id}-browser.png`), browserPng);
      // Compare in the page: decode both PNGs on a canvas.
      const stats = await page.evaluate(async ([a, b]) => {
        const load = (src: string) => new Promise<HTMLImageElement>((ok, bad) => { const im = new Image(); im.onload = () => ok(im); im.onerror = bad; im.src = src; });
        const [x, y] = await Promise.all([load(a), load(b)]);
        const c = document.createElement("canvas"); c.width = 1920; c.height = 1080;
        const g = c.getContext("2d")!;
        g.drawImage(x, 0, 0); const da = g.getImageData(0, 0, 1920, 1080).data;
        g.drawImage(y, 0, 0); const db = g.getImageData(0, 0, 1920, 1080).data;
        let sum = 0; let changed = 0;
        for (let i = 0; i < da.length; i += 4) {
          const d = (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2])) / 3;
          sum += d; if (d > 40) changed += 1;
        }
        return { mean: sum / (1920 * 1080), changed: (changed / (1920 * 1080)) * 100 };
      }, [`data:image/png;base64,${server.toString("base64")}`, `data:image/png;base64,${browserPng.toString("base64")}`]);
      results[design.id] = { mean: Math.round(stats.mean * 100) / 100, changed: Math.round(stats.changed * 100) / 100 };
    }
    await browser.close();
    writeFileSync(join(FIDELITY_OUT, "results.json"), JSON.stringify(results, null, 1));
    for (const [id, r] of Object.entries(results)) {
      // Same layout, same fonts, same photo crop: only edge anti-aliasing differs.
      expect(r.changed, `${id}: ${JSON.stringify(r)}`).toBeLessThan(1.5);
      expect(r.mean, `${id}: ${JSON.stringify(r)}`).toBeLessThan(2);
    }
  }, 180_000);
});
