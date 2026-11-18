import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { BOARD_FONTS } from "@/lib/board-fonts";
import { layoutSvg } from "@/lib/layout-studio";
import { MENU_DESIGNS, designDocument } from "@/lib/menu-designs";
import { renderLayoutPng, stockPhotoDataUri } from "@/lib/server/layout-render";

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
      `@font-face{font-family:"${font.family}";src:url(data:font/ttf;base64,${readFileSync(resolve("assets/fonts", face.file)).toString("base64")});font-weight:${font.files.length === 1 ? "100 900" : face.weight}}`)).join("");
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const results: Record<string, { mean: number; changed: number }> = {};
    for (const design of MENU_DESIGNS) {
      const doc = designDocument(design);
      const server = renderLayoutPng(doc);
      const svg = layoutSvg(doc, { stockHref: stockPhotoDataUri(doc.stockPhoto) });
      await page.setContent(`<!doctype html><style>${faces}body{margin:0}</style>${svg}`);
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
