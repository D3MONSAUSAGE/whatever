import { describe, expect, it } from "vitest";
import { layoutSvg, sampleLayout, type LayoutDocument, type LayoutTemplate } from "@/lib/layout-studio";
import { MENU_DESIGNS, designDocument, switchDesign } from "@/lib/menu-designs";
import { boardFit } from "@/lib/board-fit";
import { menuSvg } from "@/lib/menu-classic-svg";
import { sampleMenu } from "@/lib/menu-templates";
import { accountSaveBody } from "@/lib/layout-account";
import { classicSaveContent, fromClassic, switchToLayout, toClassic } from "@/lib/menu-designer";
import { setRegionCanvas } from "@/lib/board-custom";
import { LANDSCAPE_CANVAS } from "@/lib/board-orientation";
import { renderLayoutPng } from "@/lib/server/layout-render";
import { renderMenuPng } from "@/lib/server/menu-render";
import { viewportMismatch } from "@/components/screen-orientation";

/**
 * PR B (vertical 9:16 boards, t413u): every existing template draws on the 1080×1920 canvas with minimal portrait
 * adaptations, never drops more than the same board does horizontally, and switching shape keeps all content.
 * Landscape pixels are covered separately by the corpus comparison against main (docs/vertical/PR_B_NOTES.md).
 */
const TEMPLATES: LayoutTemplate[] = ["menu-promo-67", "triple-column", "split-50", "menu-banner", "signature", "two-menu-promo", "two-column"];
const portrait = <T extends object>(doc: T) => ({ ...doc, orientation: "portrait" as const });
const all: [string, LayoutDocument][] = [
  ...TEMPLATES.map((t) => [`layout:${t}`, { ...sampleLayout(t), featureTitle: "Happy hour", featureDetail: "Two tacos $9.99" }] as [string, LayoutDocument]),
  ...MENU_DESIGNS.map((d) => [`design:${d.id}`, designDocument(d)] as [string, LayoutDocument]),
];
const pngSize = (png: Uint8Array) => {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return [view.getUint32(16), view.getUint32(20)];
};
function dense(doc: LayoutDocument, n: number): LayoutDocument {
  return {
    ...doc,
    sections: [1, 2, 3, 4].map((s) => ({
      name: `Section ${s}`,
      items: Array.from({ length: n }, (_, i) => ({ name: `Item ${s}-${i + 1} with a longer name`, price: `$${i + 4}.50`, description: i % 2 ? `Description line ${i}` : "" })),
    })),
  };
}

describe("vertical boards draw on 1080×1920", () => {
  it("every layout and template has a vertical SVG canvas and keeps the sample menu whole", () => {
    for (const [id, doc] of all) {
      const svg = layoutSvg(portrait(doc));
      expect(svg, id).toContain('viewBox="0 0 1080 1920"');
      const fit = boardFit(portrait(doc));
      expect(fit.droppedItems, id).toBe(0);
      expect(fit.hiddenItems, id).toBe(0);
      expect(fit.canPublish, id).toBe(true);
    }
  });

  it("renders 1080×1920 PNGs for layouts, templates and classic boards", () => {
    expect(pngSize(renderLayoutPng(portrait(designDocument(MENU_DESIGNS[0]))))).toEqual([1080, 1920]);
    expect(pngSize(renderLayoutPng(portrait(sampleLayout("two-menu-promo"))))).toEqual([1080, 1920]);
    expect(pngSize(renderMenuPng("classic", portrait(sampleMenu())))).toEqual([1080, 1920]);
    expect(pngSize(renderLayoutPng(designDocument(MENU_DESIGNS[0])))).toEqual([1920, 1080]);
    expect(pngSize(renderLayoutPng(portrait(designDocument(MENU_DESIGNS[0])), null, { width: 960 }))).toEqual([960, 1707]);
  }, 60000);

  it("never hides more on a vertical board than on the same horizontal board", () => {
    for (const n of [4, 6, 9]) for (const [id, doc] of all) {
      const land = boardFit(dense(doc, n));
      const tall = boardFit(portrait(dense(doc, n)));
      expect(tall.droppedItems + tall.hiddenItems, `${id} n=${n}`).toBeLessThanOrEqual(land.droppedItems + land.hiddenItems);
      // Content that can't fit is still reported (never silently removed).
      if (tall.droppedItems > 0) expect(tall.canPublish, `${id} n=${n}`).toBe(false);
    }
  }, 120000);

  it("drawing a vertical board leaves the horizontal drawing untouched", () => {
    for (const [id, doc] of all) {
      const before = layoutSvg(doc);
      layoutSvg(portrait(doc));
      expect(layoutSvg(doc), id).toBe(before);
      expect(layoutSvg({ ...doc, orientation: "landscape" } as unknown as LayoutDocument), id).toBe(before);
    }
    expect(setRegionCanvas(LANDSCAPE_CANVAS)).toEqual(LANDSCAPE_CANVAS);
    const menu = sampleMenu();
    const before = menuSvg("fresh", menu);
    menuSvg("fresh", portrait(menu));
    expect(menuSvg("fresh", menu)).toBe(before);
  });
});

describe("switching shape keeps every item", () => {
  it("toggling, switching template or layout keeps the content and the shape", () => {
    const doc = portrait(designDocument(MENU_DESIGNS[0]));
    for (const design of MENU_DESIGNS) {
      const next = switchDesign(doc, design);
      expect(next.orientation, design.id).toBe("portrait");
      expect(next.sections, design.id).toEqual(doc.sections);
    }
    const layout = switchToLayout(doc, "two-column");
    expect(layout.orientation).toBe("portrait");
    expect(layout.sections.map((s) => s.items.map((i) => [i.name, i.price]))).toEqual(doc.sections.map((s) => s.items.map((i) => [i.name, i.price])));
    const { orientation: _o, ...back } = doc;
    void _o;
    expect(boardFit(back as LayoutDocument).droppedItems).toBe(0);
  });

  it("save bodies always say the shape, so switching back to horizontal sticks", () => {
    const doc = designDocument(MENU_DESIGNS[0]);
    expect(accountSaveBody({ mode: "draft", menuId: null, name: "x", document: portrait(doc) }).document.orientation).toBe("portrait");
    expect(accountSaveBody({ mode: "draft", menuId: null, name: "x", document: doc }).document.orientation).toBe("landscape");
    // Reopen: the saved body parses back to the same board.
    const saved = accountSaveBody({ mode: "publish", menuId: "m", name: "Tall", document: portrait(doc) }).document;
    expect(saved.sections).toEqual(doc.sections);
  });

  it("classic boards keep the shape through the unified editor", () => {
    const content = portrait(sampleMenu());
    const { doc, classic } = fromClassic("fresh", content);
    expect(doc.orientation).toBe("portrait");
    const back = toClassic(doc, classic);
    expect(back.content.orientation).toBe("portrait");
    expect(back.content.sections.map((s) => s.items.length)).toEqual(content.sections.map((s) => s.items.length));
    expect(classicSaveContent(back.content).orientation).toBe("portrait");
    expect(classicSaveContent(sampleMenu()).orientation).toBe("landscape");
    expect(fromClassic("fresh", sampleMenu()).doc.orientation).toBeUndefined();
  });
});

describe("screen orientation hints", () => {
  it("warns only when the TV's picture doesn't match the screen setting", () => {
    expect(viewportMismatch({ orientation: "portrait", reportedViewport: { width: 1920, height: 1080, at: null } })).toBe("stillHorizontal");
    expect(viewportMismatch({ orientation: "landscape", reportedViewport: { width: 1080, height: 1920, at: null } })).toBe("stillVertical");
    expect(viewportMismatch({ orientation: "portrait", reportedViewport: { width: 1080, height: 1920, at: null } })).toBeNull();
    expect(viewportMismatch({ orientation: "landscape", reportedViewport: null })).toBeNull();
    expect(viewportMismatch({ orientation: undefined, reportedViewport: { width: 0, height: 0, at: null } })).toBeNull();
  });
});
