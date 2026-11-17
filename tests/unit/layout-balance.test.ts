import { en } from "@/lib/i18n/en";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { zoneEditorPlacement } from "@/lib/layout-studio-editor";

const studioStyle = () => readFileSync("components/studio-chrome.tsx", "utf8").match(/<style>\{`([\s\S]*?)`\}<\/style>/)?.[1] ?? "";

async function launch() {
  try {
    const { chromium } = await import("@playwright/test");
    return await chromium.launch({ timeout: 20000 });
  } catch {
    return null;
  }
}

describe("t244u fix 1: centred dashboard container", () => {
  it("centres standard pages in a 1360px column next to the sidebar, from the shared shell", () => {
    const shell = readFileSync("components/shell.tsx", "utf8");
    expect(shell).toContain("w-full max-w-[1360px] mx-auto px-4 pt-5 pb-28 md:px-8 md:pt-8 md:pb-12");
    expect(shell).not.toContain('"max-w-6xl px-4');
    // The sidebar stays a fixed-width left column (15rem, an icon rail on tablets), sticky beside the page.
    expect(shell).toContain('className="ps-side hidden md:flex"');
    const css = readFileSync("app/globals.css", "utf8");
    expect(css).toMatch(/\.ps-side \{[^}]*width: 15rem; flex-shrink: 0; position: sticky; top: 0; height: 100dvh;/);
  });

  it("gives the menu-board workspace its own wider, centred cap", () => {
    const style = studioStyle();
    expect(style).toMatch(/body:has\(\.studio-app\) main\.shell-main \{[^}]*max-width: 1880px !important;[^}]*margin-inline: auto;/);
  });

  it("keeps equal left and right gutters around the content at 2560px", async (ctx) => {
    const browser = await launch();
    if (!browser) return ctx.skip("Chromium is not available");
    const page = await browser.newPage({ viewport: { width: 2560, height: 1440 } });
    // Same structure as DashboardShell, with the Tailwind classes resolved.
    await page.setContent(`<!doctype html><style>*{box-sizing:border-box}body{margin:0}</style>
      <div style="display:flex;min-height:100vh">
        <nav style="width:240px;flex-shrink:0">nav</nav>
        <div style="flex:1;min-width:0">
          <main id="m" style="width:100%;max-width:1360px;margin-left:auto;margin-right:auto;padding:32px">content</main>
        </div>
      </div>`);
    const r = await page.evaluate(() => {
      const box = document.getElementById("m")!.getBoundingClientRect();
      return { left: box.left - 240, right: window.innerWidth - box.right, width: box.width };
    });
    expect(r.width).toBe(1360);
    expect(Math.abs(r.left - r.right)).toBeLessThanOrEqual(1);
    await browser.close();
  });
});

describe("t244u fix 2: wider editing column, smaller 16:9 board", () => {
  it("uses a 400–560px editing column at desktop widths instead of a fixed 320px", () => {
    const style = studioStyle();
    expect(style).toContain("grid-template-columns: clamp(400px, 40%, 560px) minmax(0, 1fr)");
    expect(style).not.toContain("grid-template-columns: 360px minmax(0, 1fr)");
  });

  it("at 1440 next to the sidebar, the editor widens and the board shrinks moderately, without overflow", async (ctx) => {
    const browser = await launch();
    if (!browser) return ctx.skip("Chromium is not available");
    const style = studioStyle();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.setContent(`<!doctype html><style>*{box-sizing:border-box}body{margin:0}${style}</style>
      <div style="display:flex"><nav style="width:240px;flex-shrink:0">nav</nav>
      <div style="flex:1;min-width:0"><main class="shell-main">
      <div class="studio-app">
        <div class="studio-grid">
          <div class="studio-left"><section class="studio-controls"><div class="item-card"><input class="item-name"><input class="item-price" value="$13.99"><button class="item-remove">x</button><input class="item-desc"></div><div style="height:2400px"></div></section></div>
          <section class="studio-canvas" id="c">
            <div class="studio-canvas-stage"><div class="preview-frame" id="f" style="aspect-ratio:16/9"></div></div>
            <div class="studio-canvas-tools" id="t"><div style="height:1200px">media controls</div></div>
          </section>
        </div>
      </div></main></div></div>`);
    const m = await page.evaluate(() => {
      const f = document.getElementById("f")!.getBoundingClientRect();
      const t = document.getElementById("t")!.getBoundingClientRect();
      const c = document.getElementById("c")!.getBoundingClientRect();
      return {
        left: document.querySelector(".studio-left")!.getBoundingClientRect().width,
        frameW: f.width, frameH: f.height, frameBottom: f.bottom, toolsTop: t.top, canvasBottom: c.bottom,
        name: document.querySelector(".item-name")!.getBoundingClientRect().width,
        scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth,
      };
    });
    expect(m.left).toBeGreaterThanOrEqual(420);
    expect(m.frameW).toBeLessThan(780); // was ~804px inside the 828px canvas column
    expect(m.frameW).toBeGreaterThanOrEqual(600);
    expect(Math.abs(m.frameH - (m.frameW * 9) / 16)).toBeLessThanOrEqual(1);
    expect(m.name).toBeGreaterThanOrEqual(250);
    // Controls sit directly under the board and the sticky column fits in the viewport.
    expect(m.toolsTop).toBeGreaterThanOrEqual(m.frameBottom);
    expect(m.toolsTop - m.frameBottom).toBeLessThanOrEqual(24);
    expect(m.canvasBottom).toBeLessThanOrEqual(900);
    expect(m.scroll).toBeLessThanOrEqual(m.client + 1);
    await browser.close();
  });
});

describe("t244u fix 3: selected media controls under the board", () => {
  it("places photo, video and background areas under the board on tablet and desktop only", () => {
    expect(zoneEditorPlacement("feature", "desktop")).toBe("canvas");
    expect(zoneEditorPlacement("photo", "desktop")).toBe("canvas");
    expect(zoneEditorPlacement("background", "tablet")).toBe("canvas");
    expect(zoneEditorPlacement("menu", "desktop")).toBe("left");
    expect(zoneEditorPlacement("column-1", "desktop")).toBe("left");
    expect(zoneEditorPlacement("", "desktop")).toBe("left");
    expect(zoneEditorPlacement("feature", "phone")).toBe("left");
  });

  it("Layout Studio renders the selected-area editor once: under the board, or in the left slot", () => {
    const src = readFileSync("components/layout-studio.tsx", "utf8");
    // Classic layout: under the board or in the left slot. Opt-in layout (redesign phase 3): the properties
    // column only. The three places are mutually exclusive, so the editor still renders once.
    expect(src).toContain('{editorPlacement === "left" && !v2 ? <div className="studio-editor-slot">{zoneEditor}</div> : null}');
    expect(src).toContain('{studioBp !== "phone" && !v2 ? (');
    expect(src).toMatch(/className="studio-canvas-tools"[\s\S]{0,200}editorPlacement === "canvas"\s*\?\s*zoneEditor/);
    expect(src).toMatch(/\{v2 \? \(\s*<aside className="studio-props"[\s\S]{0,200}\{zone \? zoneEditor :/);
    expect([...src.matchAll(/\{zoneEditor\}|\? zoneEditor/g)]).toHaveLength(3);
    // Switching areas remounts the under-board editor so it always matches the selected area.
    expect(src).toContain('key={v2 ? "props" : editorPlacement === "canvas" ? `canvas-${zone}` : "left"}');
    // The under-board region is a named, keyboard-focusable scroll area.
    expect(src).toContain('role="region" aria-label={t("ls.areaControls")} tabIndex={0}');
    expect(en["ls.areaControls"]).toBe("Selected area controls");
  });

  it("does not repeat photo fit and position in the left Style panel (one place, under the board)", () => {
    const src = readFileSync("components/layout-studio.tsx", "utf8");
    expect(src).not.toContain('aria-label="Photo fit"');
    expect([...src.matchAll(/aria-label=\{t\("ls\.photoPosition"\)\}/g)]).toHaveLength(1);
    expect([...src.matchAll(/aria-label=\{t\("ls\.howFits"\)\}/g)]).toHaveLength(1);
    expect(src).not.toContain('aria-label={t("ls.photoFit")}');
  });

  it("the classic editor shows its Photo controls under the board, and in the stacked column only on phones", () => {
    const src = readFileSync("components/classic-editor.tsx", "utf8");
    expect([...src.matchAll(/\{photoPanel\}/g)]).toHaveLength(2);
    expect(src).toMatch(/studioBp === "phone" \? \([\s\S]{0,160}\{photoPanel\}/);
    expect(src).toMatch(/studioBp !== "phone" \? \([\s\S]{0,160}studio-canvas-tools[\s\S]{0,220}\{photoPanel\}/);
    expect(src).toContain('role="region" aria-label={t("ce.photoControls")} tabIndex={0}');
    expect(en["ce.photoControls"]).toBe("Photo controls");
  });
});
