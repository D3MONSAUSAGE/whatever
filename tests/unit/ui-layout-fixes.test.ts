import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleProvider } from "@/lib/i18n/client";
import { DesignGallery } from "@/components/menu-templates";
import { menuOpensUp } from "@/components/menu";
import { en } from "@/lib/i18n/en";
import { es } from "@/lib/i18n/es";

describe("My Screens: no nested scroll box, menus not clipped", () => {
  const src = readFileSync("components/my-screens.tsx", "utf8");

  it("page sections clip sideways overflow without becoming vertical scroll containers", () => {
    // overflow-x: hidden forces overflow-y: auto, which clipped the ⋯ menus and showed an inner scrollbar.
    expect(src).not.toMatch(/className="[^"]*overflow-x-hidden/);
    expect((src.match(/<section className="min-w-0 overflow-x-clip">/g) ?? []).length).toBe(4);
  });

  it("the screen workspace gives the management column the wider share and keeps the preview compact and in view", () => {
    expect(src).toContain('lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start');
    expect(src).toContain('className="card p-4 min-w-0 lg:sticky lg:top-20" data-testid="screen-preview-card"');
  });

  it("⋯ menus open upward only when they don't fit below but do fit above", () => {
    expect(menuOpensUp({ bottom: 700, height: 140 }, { top: 540 }, 900)).toBe(false); // fits below
    expect(menuOpensUp({ bottom: 960, height: 140 }, { top: 800 }, 900)).toBe(true); // runs off the bottom, room above
    expect(menuOpensUp({ bottom: 960, height: 140 }, { top: 120 }, 900)).toBe(false); // no room above either
    expect(readFileSync("app/globals.css", "utf8")).toContain(".ps-menu.is-up { top: auto; bottom: calc(100% + 8px); }");
    // Focusing the first item must not scroll the page before the menu has been placed.
    expect(readFileSync("components/menu.tsx", "utf8")).toContain("focus({ preventScroll: true })");
  });
});

describe("Menu Boards gallery: consistent cards", () => {
  for (const locale of ["en", "es"] as const) {
    it(`every card ends with its button, anchored to the bottom; Start from scratch is a normal grid card (${locale})`, () => {
      const html = renderToStaticMarkup(createElement(LocaleProvider, { initial: locale, children: createElement(DesignGallery, { onPick: () => {}, onCancel: () => {}, brand: null }) }));
      const cards = html.match(/<li class="min-w-0 flex"><button type="button" class="tpl-card[^"]*"[\s\S]*?<\/button><\/li>/g) ?? [];
      expect(cards.length).toBeGreaterThan(20);
      for (const card of cards) {
        // Exactly one button-style CTA, and it is the last thing in the card.
        expect(card.match(/tpl-card-cta/g)?.length, card.slice(0, 120)).toBe(1);
        expect(card).toMatch(/<span class="btn btn-(primary|quiet) min-h-10 tpl-card-cta" aria-hidden="true">[^<]+<\/span><\/button><\/li>$/);
        expect(card).toContain("tpl-card-desc");
        expect(card).not.toContain("mt-auto");
      }
      const scratch = cards.find((c) => c.includes('data-testid="template-scratch"'))!;
      expect(scratch).toContain("tpl-card is-scratch");
      expect(scratch).toContain(locale === "es" ? es["tpl.scratchCta"] : en["tpl.scratchCta"]);
      expect(html).not.toContain("col-span-3");
      expect((html.match(/btn btn-primary min-h-10 tpl-card-cta/g) ?? []).length).toBe(cards.length - 1);
    });
  }

  it("cards share one CSS structure with a visible keyboard focus ring", () => {
    const src = readFileSync("components/menu-templates.tsx", "utf8");
    expect(src).toContain(".tpl-card-cta { margin-top: auto; align-self: flex-start; }");
    expect(src).toContain(".tpl-card-desc { min-height: 2.5rem; }");
    expect(src).toContain(".tpl-card:focus-visible { outline: 3px solid var(--color-primary); outline-offset: 2px; }");
    expect(en["tpl.scratchCta"]).toBe("Start with a blank board");
    expect(es["tpl.scratchCta"]).toBe("Empezar con un menú en blanco");
  });
});

describe("Menu Boards gallery: filter rows", () => {
  for (const locale of ["en", "es"] as const) {
    it(`labels share one column and every row uses Pekko's segmented control (${locale})`, () => {
      const html = renderToStaticMarkup(createElement(LocaleProvider, { initial: locale, children: createElement(DesignGallery, { onPick: () => {}, onCancel: () => {}, brand: null }) }));
      const start = html.indexOf('data-testid="gallery-filters"');
      const filters = html.slice(start, html.indexOf("<ul", start));
      const d = locale === "es" ? es : en;
      // Label, then its controls, three times, all direct children of one grid.
      for (const [id, key] of [["tpl-f-business", "tpl.filterBusiness"], ["tpl-f-style", "tpl.filterStyle"], ["tpl-f-structure", "tpl.filterStructure"]] as const) {
        expect(filters).toContain(`<span class="tpl-filter-label" id="${id}">${d[key]}</span><div class="tpl-filter-controls"><div class="seg" role="group" aria-labelledby="${id}">`);
      }
      expect(html).not.toContain("tpl-chip");
      expect(html).not.toContain("📷");
      expect(html).toMatch(/data-testid="filter-photos"><svg/);
      expect(filters.match(/aria-pressed="true"/g)?.length).toBe(3); // "All" in each row; photos off
    });
  }

  it("rows align by a shared label column and wrap cleanly on phones", () => {
    const src = readFileSync("components/menu-templates.tsx", "utf8");
    expect(src).toContain(".tpl-filters { display: grid; grid-template-columns: max-content minmax(0, 1fr);");
    expect(src).toContain(".tpl-filter-label { display: flex; align-items: center; min-height: 40px;");
    expect(src).toContain("@media (max-width: 639px) { .tpl-filters { grid-template-columns: minmax(0, 1fr);");
    expect(readFileSync("app/globals.css", "utf8")).toContain(".seg { display: inline-flex; flex-wrap: wrap;");
  });
});
