import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  applyCustomReset, customizationSpec, customPaths, fontWeightChoices, focusPlacement, normalizeCustomFor, parseCustom,
  READABLE_FLOORS, ROLE_KEYS, snapWeight, TEXT_SIZE_PRESETS, withoutCustom,
} from "@/lib/board-custom";
import { boardFit, customOverflow, customPublishError, safeResetPaths } from "@/lib/board-fit";
import { imageDims } from "@/lib/image-dims";
import { applyLayoutSave, type LibraryFile } from "@/lib/layout-publish";
import { boardSvgWithReport, layoutSvg, mediaVideoBox, parseLayout, playerComposition, sampleLayout, type LayoutDocument, type LayoutTemplate } from "@/lib/layout-studio";
import { buildCatalog } from "@/lib/menu-catalog";
import { designSvgWithReport, designVideoBox } from "@/lib/menu-design-svg";
import { designById, designDocument, MENU_DESIGNS, switchDesign } from "@/lib/menu-designs";
import { switchToLayout } from "@/lib/menu-designer";
import { en } from "@/lib/i18n/en";
import { es } from "@/lib/i18n/es";

const LAYOUTS: LayoutTemplate[] = ["menu-promo-67", "triple-column", "split-50", "menu-banner", "signature", "two-menu-promo", "two-column"];
const design = (id: string) => designDocument(designById(id)!);
const parsed = (doc: unknown): LayoutDocument => {
  const r = parseLayout(doc);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};
const withC = (doc: LayoutDocument, custom: Record<string, unknown>) => parsed({ ...doc, custom });
const fontSizes = (svg: string) => [...svg.matchAll(/font-size="([\d.]+)"/g)].map((m) => Number(m[1]));

/** A full menu (24 items, the editor maximum) with long names, for overflow and floor checks. */
function dense(doc: LayoutDocument, longNames = false): LayoutDocument {
  const sections = Array.from({ length: 4 }, (_, s) => ({
    name: `Section ${s + 1}`,
    items: Array.from({ length: 6 }, (_, i) => ({
      name: longNames ? `Slow roasted heirloom tomato ${s}${i} basil` : `Dish ${s}${i}`,
      price: "$12.50",
      description: "House made with seasonal ingredients and a little extra care",
    })),
  }));
  return parsed({ ...doc, sections });
}

describe("custom: parsing and clamping", () => {
  const doc = design("modern-restaurant"); // showcase

  it("clamps every number to the shared bounds", () => {
    const r = parseCustom({ v: 1, mediaSize: 0.9, textScale: 3, roles: { price: { scale: 0.1, weight: "bold" } }, spacing: { itemGap: 9, sectionGap: 0 }, imageFocus: { x: -5, y: 140 } }, doc);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual({ v: 1, mediaSize: 0.5, textScale: 1.3, roles: { price: { scale: 0.75, weight: "bold" } }, spacing: { itemGap: 1.4, sectionGap: 0.75 }, imageFocus: { x: 0, y: 100 } });
  });

  it("rejects malformed known keys with a 400 message and nothing else", () => {
    for (const bad of [
      "big", [], { v: "1" }, { v: 0 }, { v: 1.5 }, { v: 1, textScale: "large" }, { v: 1, mediaSize: null as unknown as number, roles: [] },
      { v: 1, roles: { price: { weight: "heavy" } } }, { v: 1, roles: { itemName: { scale: "2" } } }, { v: 1, roles: { price: 7 } },
      { v: 1, spacing: { itemGap: "x" } }, { v: 1, imageFocus: { x: "a", y: 1 } }, { v: 1, imageFocus: [1, 2] },
      { v: 1, pad: "x".repeat(5000) },
    ]) {
      const r = parseCustom(bad, doc);
      expect(r.ok, JSON.stringify(bad).slice(0, 80)).toBe(false);
    }
    const viaParse = parseLayout({ ...doc, custom: { v: 1, textScale: "huge" } });
    expect(viaParse).toEqual({ ok: false, error: "Check the look settings." });
    expect(parseLayout({ ...doc, sections: [{ ...doc.sections[0], headingOverride: { weight: "black" } }] }).ok).toBe(false);
  });

  it("drops an invalid section or item id and keeps the rest of the board", () => {
    const raw = {
      ...doc,
      sections: [{
        ...doc.sections[0],
        id: "bad id!",
        items: [
          { ...doc.sections[0].items[0], id: "ok-id" },
          { ...doc.sections[0].items[1], id: "also bad" },
          ...doc.sections[0].items.slice(2),
        ],
      }, { ...doc.sections[1], id: "starters" }, ...doc.sections.slice(2)],
    };
    const r = parseLayout(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.sections[0].id).toBeUndefined();
    expect(r.value.sections[0].items[0].id).toBe("ok-id");
    expect(r.value.sections[0].items[1].id).toBeUndefined();
    expect(r.value.sections[1].id).toBe("starters");
    expect(r.value.sections[0].items[0].name).toBe(doc.sections[0].items[0].name);
  });

  it("keeps unknown keys at every level and round-trips through save and reopen", () => {
    const custom = { v: 1, textScale: 1.12, future: { a: 1 }, roles: { itemName: { scale: 1.1, tracking: 2 }, futureRole: { scale: 9 } }, spacing: { itemGap: 1.1, rowGap: 3 }, imageFocus: { x: 10, y: 20, zoom: 2 } };
    const once = withC(doc, custom);
    expect(once.custom).toEqual(custom);
    const again = parsed(JSON.parse(JSON.stringify(once)));
    expect(again).toEqual(once);
    const ids = parsed({ ...doc, sections: doc.sections.map((s, i) => ({ ...s, id: `sec_${i}`, items: s.items.map((it, j) => ({ ...it, id: `it-${i}-${j}` })) })) });
    expect(ids.sections[0].id).toBe("sec_0");
    expect(ids.sections[0].items[0].id).toBe("it-0-0");
  });

  it("preserves v>1 untouched and draws it exactly like no customization", () => {
    const future = { v: 2, textScale: 99, roles: "anything" };
    const doc2 = withC(doc, future);
    expect(doc2.custom).toEqual(future);
    expect(layoutSvg(doc2)).toBe(layoutSvg(doc));
    expect(boardFit(doc2).custom.applied).toBe(false);
    expect(boardFit(doc2).overflowReasons).toEqual([]);
  });

  it("drops mediaSize on templates without a resizable photo", () => {
    for (const id of ["photo-menu-grid", "featured-dishes", "taqueria"]) {
      const d = design(id);
      if (customizationSpec(d).media) continue;
      expect(withC(d, { v: 1, mediaSize: 0.4 }).custom).toBeUndefined();
    }
    expect(customizationSpec(design("featured-dishes")).media).toBeNull();
  });
});

describe("custom: reset is key deletion, and only what is named", () => {
  it("removes single paths, keeps the rest, and drops an empty custom", () => {
    const doc = withC(sampleLayout("split-50"), { v: 1, mediaSize: 0.55, textScale: 1.12, roles: { price: { scale: 1.2 }, itemName: { weight: "bold" } }, spacing: { itemGap: 1.2 }, imageFocus: { x: 20, y: 30 } });
    const keep = { ...doc, palette: doc.palette, font: doc.font };
    const a = applyCustomReset(doc, ["custom.roles.price"]);
    expect(a.custom).toEqual({ v: 1, mediaSize: 0.55, textScale: 1.12, roles: { itemName: { weight: "bold" } }, spacing: { itemGap: 1.2 }, imageFocus: { x: 20, y: 30 } });
    expect(a.palette).toBe(keep.palette);
    expect(a.font).toBe(keep.font);
    const b = applyCustomReset(a, ["custom.roles.itemName.weight", "custom.spacing.itemGap", "custom.imageFocus", "custom.textScale"]);
    expect(b.custom).toEqual({ v: 1, mediaSize: 0.55 });
    expect(b.split).toBeCloseTo(0.45, 5);
    const c = applyCustomReset(b, ["custom.mediaSize"]);
    expect(c.custom).toBeUndefined();
    expect(c.split).toBe(0.5); // layout split returns to the template default with the media size
    expect(customPaths(doc).length).toBeGreaterThan(4);
  });

  it("resets one section's heading override without touching the others", () => {
    const base = design("trattoria");
    const doc = parsed({ ...base, sections: base.sections.map((s, i) => (i < 2 ? { ...s, headingOverride: { scale: 1.3 } } : s)) });
    const next = applyCustomReset(doc, ["sections.0.headingOverride"]);
    expect(next.sections[0].headingOverride).toBeUndefined();
    expect(next.sections[1].headingOverride).toEqual({ scale: 1.3 });
  });
});

describe("custom: template switch", () => {
  it("keeps custom and overrides, clamps media into the new range, drops it where there is no slider", () => {
    const start = parsed({ ...design("modern-restaurant"), sections: design("modern-restaurant").sections.map((s, i) => (i === 0 ? { ...s, headingOverride: { weight: "bold" } } : s)), custom: { v: 1, mediaSize: 0.5, textScale: 1.12 } });
    const columns = MENU_DESIGNS.find((d) => d.composition === "columns")!;
    const toColumns = switchDesign(start, columns);
    expect(toColumns.custom).toEqual({ v: 1, mediaSize: 0.4, textScale: 1.12 });
    expect(toColumns.sections[0].headingOverride).toEqual({ weight: "bold" });
    const list = MENU_DESIGNS.find((d) => d.composition === "list")!;
    expect(switchDesign(start, list).custom).toEqual({ v: 1, textScale: 1.12 });
    const toLayout = switchToLayout(start, "menu-promo-67");
    expect(toLayout.custom).toEqual({ v: 1, mediaSize: 0.45, textScale: 1.12 });
    expect(toLayout.split).toBeCloseTo(0.55, 5);
    expect(switchToLayout(start, "two-column").custom).toEqual({ v: 1, textScale: 1.12 });
    expect(normalizeCustomFor(start)).toEqual(start);
  });
});

describe("custom: weights snap to shipped faces", () => {
  it("snaps at render time; ties go heavier", () => {
    expect(snapWeight("Inter", "normal")).toBe(400);
    expect(snapWeight("Inter", "medium")).toBe(400);
    expect(snapWeight("Inter", "semibold")).toBe(700);
    expect(snapWeight("Inter", "bold")).toBe(700);
    expect(snapWeight("Bebas Neue", "bold")).toBe(400);
    expect(fontWeightChoices("inter")).toEqual(["normal", "bold"]);
    expect(fontWeightChoices("bebas-neue")).toEqual(["normal"]);
    const doc = withC(design("modern-restaurant"), { v: 1, roles: { itemName: { weight: "semibold" } } });
    const echo = boardFit(doc).custom;
    expect(Object.values(echo.effectiveWeights).every((w) => [400, 700, 800].includes(w as number))).toBe(true);
    expect(layoutSvg(doc)).not.toMatch(/font-weight="(500|600)"/);
  });
});

describe("custom: readable floors", () => {
  it("documents floors for every role", () => {
    expect(Object.keys(READABLE_FLOORS).sort()).toEqual([...ROLE_KEYS].sort());
    expect(READABLE_FLOORS).toEqual({ businessName: 36, sectionHeading: 20, itemName: 20, description: 15, price: 20, featuredText: 18 });
  });

  const smallest = { v: 1, textScale: 0.8, roles: Object.fromEntries(ROLE_KEYS.map((k) => [k, { scale: 0.75 }])), spacing: { itemGap: 0.75, sectionGap: 0.75 } };
  const largest = { v: 1, textScale: 1.3, roles: Object.fromEntries(ROLE_KEYS.map((k) => [k, { scale: 1.5 }])), spacing: { itemGap: 1.4, sectionGap: 1.4 } };

  it("never draws customized text below min(floor, the template's own size) on any template", () => {
    const docs = [...MENU_DESIGNS.map((d) => designDocument(d)), ...LAYOUTS.map((t) => sampleLayout(t))];
    for (const base of docs) {
      for (const b of [base, dense(base, true)]) {
        const floor = Math.min(15, ...fontSizes(layoutSvg(b)));
        for (const custom of [smallest, largest]) {
          const sizes = fontSizes(layoutSvg(withC(b, custom)));
          expect(Math.min(...sizes), `${b.design ?? b.template} ${custom.textScale}`).toBeGreaterThanOrEqual(floor - 0.51);
        }
      }
    }
  });

  it("reports what does not fit instead of shrinking past the floors", () => {
    const base = dense(design("modern-restaurant"), true);
    const doc = withC(base, largest);
    const fit = boardFit(doc);
    expect(fit.overflowReasons.length).toBeGreaterThan(0);
    expect(fit.canPublish).toBe(false);
    const r = designSvgWithReport(doc).report;
    const r0 = designSvgWithReport(base).report;
    // Item names on showcase are drawn at 38 × scale; customized ≥ min(floor, default).
    expect(38 * 1.3 * 1.5 * r.scale).toBeGreaterThanOrEqual(Math.min(READABLE_FLOORS.itemName, 38 * r0.scale) - 0.01);
  });
});

describe("custom: overflow, safe size and publish", () => {
  it("blocks only overflow that customization introduced, and safeAction targets the culprit", () => {
    // A board saved before t421u (no itemPhotoSize, i.e. Small photos): the safe action is the single culprit role.
    const { itemPhotoSize: _seeded, ...base } = design("photo-menu-grid");
    void _seeded;
    const doc = withC(base, { v: 1, imageFocus: { x: 10, y: 10 }, roles: { itemName: { scale: 1.5 }, price: { scale: 1.1 } }, spacing: { itemGap: 1.1 } });
    const fit = boardFit(doc);
    expect(fit.overflowReasons).toContain("text_clipped");
    expect(fit.safeAction).toEqual({ kind: "reset_custom", paths: ["custom.roles.itemName"] });
    const fixed = applyCustomReset(doc, fit.safeAction!.paths);
    expect(customOverflow(fixed)).toEqual([]);
    expect(fixed.custom).toEqual({ v: 1, imageFocus: { x: 10, y: 10 }, roles: { price: { scale: 1.1 } }, spacing: { itemGap: 1.1 } });
    expect(customPublishError(doc)).toBeTruthy();
    expect(customPublishError(fixed)).toBeNull();
  });

  it("does not block boards whose fit issue predates customization", () => {
    for (const base of [dense(sampleLayout("menu-banner"), true), dense(sampleLayout("two-column"), true), dense(design("photo-menu-grid"), true)]) {
      expect(customOverflow(base)).toEqual([]);
      expect(customPublishError(base)).toBeNull();
      const unrelated = withC(base, { v: 1, imageFocus: { x: 70, y: 30 } });
      expect(customOverflow(unrelated)).toEqual([]);
      expect(customPublishError(unrelated)).toBeNull();
    }
    // Layout boards that already clip stay publishable without custom.
    const preexisting = dense(sampleLayout("menu-banner"), true);
    expect(boardFit(preexisting).canPublish).toBe(true);
  });

  it("finds a cumulative safe reset when no single key is enough", () => {
    const doc = withC(dense(sampleLayout("menu-banner"), true), { v: 1, textScale: 1.3, roles: { itemName: { scale: 1.5 }, description: { scale: 1.5 } } });
    const paths = safeResetPaths(doc);
    expect(paths).not.toBeNull();
    expect(customOverflow(applyCustomReset(doc, paths!))).toEqual([]);
  });

  it("the publish gate refuses custom overflow and allows the safe-size result", async () => {
    const account = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const files: LibraryFile[] = [];
    const deps = { writeContent: async () => undefined, render: async () => "png", swap: async () => undefined };
    const bad = withC(dense(sampleLayout("menu-banner")), { v: 1, roles: { itemName: { scale: 1.5 } }, textScale: 1.3 });
    expect(boardFit(bad).overflowReasons.length).toBeGreaterThan(0);
    const refused = await applyLayoutSave({ enabled: true, accountId: account, mode: "publish", document: bad, files, previousMediaId: null }, deps);
    expect(refused.ok).toBe(false);
    const draft = await applyLayoutSave({ enabled: true, accountId: account, mode: "draft", document: bad, files, previousMediaId: null }, deps);
    expect(draft.ok).toBe(true);
    const safe = applyCustomReset(bad, safeResetPaths(bad)!);
    const ok = await applyLayoutSave({ enabled: true, accountId: account, mode: "publish", document: safe, files, previousMediaId: null }, deps);
    expect(ok.ok).toBe(true);
  });
});

describe("custom: regions, video box and preview/player parity", () => {
  it("exposes stable region ids with targets inside the canvas", () => {
    const base = design("trattoria");
    const doc = parsed({ ...base, sections: base.sections.map((s, i) => (i === 0 ? { ...s, id: "starters", items: s.items.map((it, j) => (j === 0 ? { ...it, id: "bruschetta" } : it)) } : s)) });
    const fit = boardFit(doc);
    expect(fit.canvasWidth).toBe(1920);
    expect(fit.canvasHeight).toBe(1080);
    const ids = fit.regions.map((r) => r.id);
    expect(ids).toEqual(expect.arrayContaining(["businessName", "featuredMedia", "section:starters", "item:bruschetta", "section:s1"]));
    for (const r of fit.regions) {
      expect(r.box.x + r.box.w).toBeLessThanOrEqual(1920);
      expect(r.box.y + r.box.h).toBeLessThanOrEqual(1080);
    }
    expect(fit.regions.find((r) => r.id === "section:s1")!.target).toMatchObject({ path: "sections.1.headingOverride" });
    for (const t of LAYOUTS) expect(boardFit(sampleLayout(t)).regions.length).toBeGreaterThan(3);
  });

  it("video box follows the photo size and matches the player composition", () => {
    const show = withC(design("modern-restaurant"), { v: 1, mediaSize: 0.5 });
    expect(designVideoBox(show)!.x).toBe(960);
    expect(designVideoBox(design("modern-restaurant"))).toEqual(mediaVideoBox(withoutCustom(show)));
    const video = { ...show, videoMediaId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" };
    expect(playerComposition(video, "f", "v")!.video!.box).toEqual(boardFit(video).videoBox);
    const promo = withC(sampleLayout("menu-promo-67"), { v: 1, mediaSize: 0.4 });
    expect(promo.split).toBeCloseTo(0.6, 5);
    expect(boardFit(promo).videoBox).toEqual(mediaVideoBox(promo));
    expect(mediaVideoBox(promo)!.x).toBeLessThan(mediaVideoBox(sampleLayout("menu-promo-67"))!.x);
  });

  it("preview SVG and the still renderer use the same drawing, and fit agrees", () => {
    for (const doc of [withC(design("trattoria"), { v: 1, textScale: 1.12 }), withC(sampleLayout("split-50"), { v: 1, roles: { price: { scale: 1.2 } } })]) {
      const a = layoutSvg(doc);
      const report = doc.design ? designSvgWithReport(doc) : boardSvgWithReport(doc);
      expect(report.svg).toBe(a);
      expect(boardFit(parsed(JSON.parse(JSON.stringify(doc))))).toEqual(boardFit(doc));
    }
  });

  it("places the photo by focus exactly when the size is known, else by the nearest anchor", () => {
    const box = { x: 0, y: 0, w: 800, h: 800 };
    expect(focusPlacement(box, { x: 0, y: 50 }, { w: 1600, h: 800 })).toEqual({ kind: "exact", x: 0, y: 0, w: 1600, h: 800 });
    expect(focusPlacement(box, { x: 100, y: 50 }, { w: 1600, h: 800 })).toMatchObject({ x: -800 });
    expect(focusPlacement(box, { x: 90, y: 10 })).toEqual({ kind: "anchor", aspect: "xMaxYMin slice" });
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAYAAAC56t6BAAAAEklEQVR42mP8z8DwnwEJMOIUAAAk9AT9lD6vSgAAAABJRU5ErkJggg==", "base64");
    expect(imageDims(png)).toEqual({ w: 2, h: 3 });
  });
});

describe("custom: catalog and copy", () => {
  it("publishes bounds, floors and weights for clients", () => {
    const cat = buildCatalog(null);
    expect(cat.customization.textScale.presets).toEqual(TEXT_SIZE_PRESETS);
    expect(cat.customization.readableFloors).toEqual(READABLE_FLOORS);
    expect(cat.customization.fontWeights.inter.choices).toEqual(["normal", "bold"]);
    const classic = cat.entries.find((e) => e.kind === "classic");
    expect(classic?.customization ?? null).toBeNull();
    for (const e of cat.entries.filter((x) => x.kind !== "classic")) expect(e.customization).not.toBeNull();
    const featured = cat.entries.find((e) => e.id === "featured-dishes");
    expect(featured?.customization?.media).toBeNull();
  });

  it("has every cz.* string in English and formal Spanish", () => {
    const keys = Object.keys(en).filter((k) => k.startsWith("cz."));
    expect(keys.length).toBeGreaterThan(40);
    for (const k of keys) expect((es as Record<string, string>)[k], k).toBeTruthy();
    const spanish = keys.map((k) => (es as Record<string, string>)[k]).join(" ");
    expect(spanish).not.toMatch(/\b(tú|tu|tus|puedes|quieres|agrega|usa|vuelve|ajusta)\b/i);
  });

  it("the UI only offers the media slider where the spec has one", () => {
    const src = readFileSync("components/menu-customize.tsx", "utf8");
    expect(src).toContain("spec.media");
    expect(src).toContain("tpl-cz-media");
  });
});

