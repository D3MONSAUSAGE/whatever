import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ColorField } from "@/components/color-field";
import { studioTemplateThumbnailSrc } from "@/lib/layout-thumbnails";

const TEMPLATES = ["menu-promo-67", "triple-column", "split-50", "menu-banner", "signature", "two-menu-promo", "two-column"] as const;

describe("premium editor chrome", () => {
  it("keeps a sticky single canvas on desktop and shows it on the phone Preview tab", async () => {
    let chromium: typeof import("@playwright/test").chromium;
    try {
      chromium = (await import("@playwright/test")).chromium;
    } catch {
      return;
    }
    let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
    try {
      browser = await chromium.launch({ timeout: 20000 });
    } catch {
      return;
    }
    const source = readFileSync("components/layout-studio.tsx", "utf8") + readFileSync("components/studio-chrome.tsx", "utf8") + readFileSync("components/classic-editor.tsx", "utf8") + readFileSync("components/studio-leave.tsx", "utf8") + readFileSync("components/shell.tsx", "utf8");
    const style = source.match(/<style>\{`([\s\S]*?)`\}<\/style>/)?.[1] ?? "";
    expect(style).toContain("position: sticky");
    expect(source).toContain('id="studio-tv-preview"');
    expect(source).not.toContain("Preview, not a live TV feed");
    expect(source).not.toContain("No published preview yet");
    expect(style).toContain(".studio-canvas.on");
    expect(style).not.toContain("grid-template-columns: 320px minmax(0, 1fr) 280px");
    expect(source).toContain("TemplatePicker");
    expect(source).toContain("template-thumb-check");
    expect(source).toContain("Content &amp; text");
    expect(source).toContain("Colors &amp; style");
    expect(source).toContain("studio-canvas-stage");
    expect(source).toContain("board-switch");
    expect(source).toContain("item-card");
    expect(source).toContain("ColorField");
    expect(source).not.toContain("background: #fffdf8");
    expect(source).toContain("useStudioBreakpoint");
    expect(source).toContain('studioBp === "phone"');
    expect(source).toContain('step === "preview" ? "studio-canvas on"');
    expect([...style.matchAll(/padding-bottom: calc\(168px/g)]).toHaveLength(1);
    expect(style).toContain("studio-controls-end");
    expect(style).toContain("body:has(.studio-app) .content-nav { display: none; }");
    expect(style).toContain(".studio-preview { display: none !important; }");
    expect(source).toContain("ClassicEditor");
    expect(source).toContain("Back to menu boards");
    expect(source).toContain("Loading preview…");
    expect(source).toContain("firstFetch");
    expect(source).toContain("/api/menus/");
    expect(source).toContain("requestLeave");
    expect(source).toContain("publishSavedCopy");
    expect(source).toContain("ISOLATED_STUDIO_PHOTO_MAX_BYTES");
    expect(style).toContain('.studio-tabs button[aria-selected="true"]{color:#0066ff;font-weight:700}');
    // Pill chrome is restored without an inline color/weight so the CSS rule still wins.
    expect(source).toContain("...chip(step === id)");
    expect(source).toMatch(/function chip\(active: boolean\): CSSProperties \{\s*return \{\s*border:/);
    const chip = source.match(/function chip\(active: boolean\): CSSProperties \{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(chip).toContain("borderRadius: 999");
    expect(chip).toContain("background: \"#fff\"");
    expect(chip).not.toContain("color:");
    expect(chip).not.toContain("fontWeight");
    expect(source).toContain("disabled={busy}");
    expect(source).toContain("disabled={saving !== null}");
    expect(source).toContain('region && (step === "content" || step === "photo")');
    expect(source).toContain("useRegisterStudioLeave");
    expect(source).toContain("StudioGuardedLink");
    expect(source).toContain("StudioLeaveProvider");
    expect(source).not.toMatch(/<input type="color"/);

    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.setContent(`<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><style>*{box-sizing:border-box}body{margin:0}${style}</style>
      <main class="studio-app">
        <header class="studio-toolbar"><h1 class="studio-title">Edit menu board</h1><div class="studio-toolbar-actions"><button class="btn">Save draft</button><button class="btn">Preview</button><button class="btn btn-primary">Publish</button></div></header>
        <div class="studio-grid">
          <div class="studio-left">
            <section class="studio-controls" data-testid="studio-tools" id="tools"><div style="height:2400px">tall tools</div></section>
          </div>
          <section class="studio-canvas" id="studio-tv-preview" data-testid="studio-tv-preview" aria-label="Editing canvas"><div class="preview-frame" style="aspect-ratio:16/9;background:#000;width:100%"></div></section>
        </div>
      </main>`);
    const before = await page.evaluate(() => {
      const canvas = document.getElementById("studio-tv-preview");
      const tools = document.getElementById("tools");
      const frame = document.querySelector("#studio-tv-preview .preview-frame") as HTMLElement | null;
      const previewPane = document.querySelector(".studio-preview") as HTMLElement | null;
      return {
        position: canvas ? getComputedStyle(canvas).position : "",
        inView: canvas ? canvas.getBoundingClientRect().top < window.innerHeight && canvas.getBoundingClientRect().bottom > 0 : false,
        toolsScroll: tools ? tools.scrollHeight : 0,
        canvasWidth: frame ? frame.getBoundingClientRect().width : 0,
        toolsWidth: document.querySelector(".studio-left")?.getBoundingClientRect().width ?? 0,
        previewDisplay: previewPane ? getComputedStyle(previewPane).display : "none",
      };
    });
    expect(before.position).toBe("sticky");
    expect(before.inView).toBe(true);
    expect(before.canvasWidth).toBeGreaterThanOrEqual(700);
    expect(before.toolsWidth).toBeGreaterThanOrEqual(300);
    expect(before.toolsWidth).toBeLessThanOrEqual(380);
    expect(before.previewDisplay).toBe("none");
    await page.evaluate(() => {
      const left = document.querySelector(".studio-left") as HTMLElement | null;
      if (left) left.scrollTop = 800;
    });
    const after = await page.evaluate(() => {
      const preview = document.getElementById("studio-tv-preview");
      const r = preview?.getBoundingClientRect();
      return {
        inView: r ? r.top < window.innerHeight && r.bottom > 0 : false,
        top: r?.top ?? -1,
      };
    });
    expect(after.inView).toBe(true);
    expect(after.top).toBeGreaterThanOrEqual(0);
    await page.close();

    const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await phone.setContent(`<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><style>*{box-sizing:border-box}body{margin:0}${style}</style>
      <main class="studio-app">
        <div class="studio-grid">
          <section class="studio-canvas on" id="studio-tv-preview" aria-label="Editing canvas"><div class="preview-frame" style="aspect-ratio:16/9;background:#000;width:100%"></div></section>
          <section class="studio-controls"><div class="studio-pane on" style="width:900px">wide controls</div></section>
        </div>
        <nav class="studio-tabs"><button>Template</button><button>Section</button><button>Content</button><button>Style</button><button>Publish</button></nav>
      </main>`);
    const metrics = await phone.evaluate(() => {
      const tab = document.querySelector(".studio-tabs button");
      const canvas = document.getElementById("studio-tv-preview");
      return {
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
        display: canvas ? getComputedStyle(canvas).display : "",
        sticky: canvas ? getComputedStyle(canvas).position : "",
        tab: tab ? tab.getBoundingClientRect().height : 0,
        canvasBottom: canvas ? canvas.getBoundingClientRect().bottom : 0,
        controlsTop: document.querySelector(".studio-controls")?.getBoundingClientRect().top ?? 0,
      };
    });
    expect(metrics.scroll).toBeLessThanOrEqual(metrics.client + 1);
    expect(metrics.display).toBe("flex");
    expect(metrics.sticky).toBe("static");
    expect(metrics.controlsTop).toBeGreaterThanOrEqual(metrics.canvasBottom - 1);
    expect(metrics.tab).toBeGreaterThanOrEqual(44);
    await browser.close();
  });

  it("gives item rows a flexing name, an 84px price that shows $13.99, a 44px delete, and a full-width description", async () => {
    const style = (readFileSync("components/studio-chrome.tsx", "utf8").match(/<style>\{`([\s\S]*?)`\}<\/style>/)?.[1] ?? "");
    const classic = readFileSync("components/classic-editor.tsx", "utf8");
    expect(style).toContain("minmax(0, 1fr) 84px 44px");
    expect(style).toContain(".item-card .item-desc { grid-column: 1 / -1; }");
    expect(style).toContain(".section-remove");
    expect(classic).toContain("section-card-head");
    expect(classic).toContain("section-remove");
    expect(classic).not.toContain(">Remove section<");

    let chromium: typeof import("@playwright/test").chromium;
    try {
      chromium = (await import("@playwright/test")).chromium;
    } catch {
      return;
    }
    let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
    try {
      browser = await chromium.launch({ timeout: 20000 });
    } catch {
      return;
    }
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.setContent(`<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><style>*{box-sizing:border-box}body{margin:0}${style}</style>
      <div class="studio-left" style="width:320px;position:static;max-height:none;overflow:visible">
        <section class="section-card">
          <div class="section-card-head">
            <h3 class="section-card-legend">Section 1</h3>
            <button type="button" class="section-remove">Remove</button>
          </div>
          <input class="field" value="Tacos" style="width:100%" />
          <div class="item-card">
            <input class="item-name" value="Al pastor" />
            <input class="item-price" value="$13.99" />
            <button type="button" class="item-remove"><span aria-hidden="true">×</span></button>
            <input class="item-desc" value="Pork, pineapple, onion, cilantro" />
          </div>
        </section>
      </div>`);
    const metrics = await page.evaluate(() => {
      const price = document.querySelector(".item-price") as HTMLInputElement;
      const name = document.querySelector(".item-name") as HTMLInputElement;
      const desc = document.querySelector(".item-desc") as HTMLInputElement;
      const del = document.querySelector(".item-remove") as HTMLElement;
      const card = document.querySelector(".item-card") as HTMLElement;
      const headBtn = document.querySelector(".section-remove") as HTMLElement;
      const nameInput = document.querySelector(".section-card > input") as HTMLInputElement;
      return {
        priceW: price.getBoundingClientRect().width,
        priceScroll: price.scrollWidth,
        priceClient: price.clientWidth,
        nameW: name.getBoundingClientRect().width,
        descW: desc.getBoundingClientRect().width,
        cardW: card.getBoundingClientRect().width,
        delW: del.getBoundingClientRect().width,
        delH: del.getBoundingClientRect().height,
        headBtnH: headBtn.getBoundingClientRect().height,
        nameInputW: nameInput.getBoundingClientRect().width,
        headBtnLeft: headBtn.getBoundingClientRect().left,
        nameInputRight: nameInput.getBoundingClientRect().right,
      };
    });
    expect(metrics.priceW).toBeGreaterThanOrEqual(83);
    expect(metrics.priceW).toBeLessThanOrEqual(85);
    expect(metrics.priceScroll).toBeLessThanOrEqual(metrics.priceClient + 1);
    expect(metrics.delW).toBe(44);
    expect(metrics.delH).toBe(44);
    expect(metrics.descW).toBeGreaterThan(metrics.nameW + 50);
    expect(metrics.descW).toBeGreaterThanOrEqual(metrics.cardW - 2);
    expect(metrics.headBtnH).toBeGreaterThanOrEqual(44);
    expect(metrics.nameInputW).toBeGreaterThan(200);
    await browser.close();
  });

  it("renders visual thumbnails from existing templates, and a color swatch with a hex popover", () => {
    for (const id of TEMPLATES) {
      const src = studioTemplateThumbnailSrc(id);
      expect(src).toContain("data:image/svg+xml");
      expect(src).toContain("svg");
    }
    const html = renderToStaticMarkup(createElement(ColorField, {
      label: "Text color",
      value: "#112233",
      fallback: "#0b1220",
      onChange: () => undefined,
    }));
    expect(html).toContain("color-swatch");
    expect(html).toContain("#112233");
    expect(html).toContain('aria-label="Text color"');
    expect(html).toContain('aria-expanded="false"');
  });
});
