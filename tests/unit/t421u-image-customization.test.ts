import { describe, expect, it } from "vitest";
import {
  applyCustomReset, customizationSpec, focusPlacement, framePlacement, IMAGE_ZOOM, ITEM_PHOTO_SIZES, parseCustom, resetFeaturedPhoto,
  type ItemPhotoSize,
} from "@/lib/board-custom";
import { boardFit } from "@/lib/board-fit";
import { layoutSvg, parseLayout, sampleLayout, type LayoutDocument, type LayoutTemplate } from "@/lib/layout-studio";
import { CUSTOMIZATION_META, buildCatalog } from "@/lib/menu-catalog";
import { designSvgWithReport, designVideoBox } from "@/lib/menu-design-svg";
import { DESIGN_ITEM_PHOTO_DEFAULT, MENU_DESIGNS, designById, designDocument, switchDesign } from "@/lib/menu-designs";
import { renderLayoutPng } from "@/lib/server/layout-render";

/**
 * t421u: item photo size (Small/Medium/Large) and featured photo framing (Fit/Fill, zoom, focus, reset).
 * Contract: top-level `itemPhotoSize` (absent = legacy = "small"), `custom.imageZoom` next to `custom.imageFocus`.
 */
const PHOTO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=";
const OWNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const FOOD = MENU_DESIGNS.filter((d) => !d.terms);
// Premium service templates draw their own compositions (tests/unit/service-templates.test.ts); same photo-size rules.
const PREMIUM = MENU_DESIGNS.filter((d) => ["showcaseLeft", "editorial", "spotlight", "timetable"].includes(d.composition));
const NON_FOOD = MENU_DESIGNS.filter((d) => d.terms && !PREMIUM.includes(d));
const ORIENTATIONS = ["landscape", "portrait"] as const;
const LAYOUTS: LayoutTemplate[] = ["menu-promo-67", "triple-column", "split-50", "menu-banner", "signature", "two-menu-promo", "two-column"];

function existing(doc: LayoutDocument): LayoutDocument { const { itemPhotoSize: _s, ...rest } = doc; void _s; return rest; }
function withPhotos(doc: LayoutDocument, every = true): LayoutDocument {
  return { ...doc, sections: doc.sections.map((s, si) => ({ ...s, items: s.items.map((i, ii) => (every || (si === 0 && ii < 2) ? { ...i, imageMediaId: OWNER } : i)) })) };
}
function dense(doc: LayoutDocument): LayoutDocument {
  const names = ["Carne asada", "Al pastor", "Pollo asado", "Carnitas", "Barbacoa", "Lengua"];
  return { ...doc, sections: [0, 1, 2, 3].map((s) => ({ name: `Section ${s + 1}`, items: Array.from({ length: 6 }, (_, i) => ({ name: `${names[i]} ${s + 1}`, price: "$12.50", description: "Onion, cilantro, salsa verde", imageMediaId: OWNER })) })) };
}
function longText(doc: LayoutDocument): LayoutDocument {
  return { ...doc, sections: doc.sections.map((s) => ({ ...s, items: s.items.map((i) => ({ ...i, name: "Quesabirria with consomé and extra cheese".slice(0, 40), price: "$1,299.99 MXN".slice(0, 12), imageMediaId: OWNER })) })) };
}
const art = { itemImages: { [OWNER]: PHOTO } };
const render = (doc: LayoutDocument) => designSvgWithReport(doc, art);
const drawnText = (svg: string) => [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]).join(" ");
const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/'/g, "&#39;");
const orient = <T extends LayoutDocument>(doc: T, o: (typeof ORIENTATIONS)[number]): T => {
  const { orientation: _o, ...rest } = doc; void _o;
  return (o === "portrait" ? { ...rest, orientation: "portrait" } : rest) as T;
};
const sized = (doc: LayoutDocument, size: ItemPhotoSize) => ({ ...doc, itemPhotoSize: size });

describe("t421u contract: parsing, clamping and preservation", () => {
  const base = designDocument(designById("modern-restaurant")!);

  it("keeps a valid itemPhotoSize, omits null, refuses anything else (400)", () => {
    for (const size of ITEM_PHOTO_SIZES) {
      const r = parseLayout({ ...base, itemPhotoSize: size });
      expect(r.ok && r.value.itemPhotoSize).toBe(size);
    }
    const none = parseLayout({ ...base, itemPhotoSize: null });
    expect(none.ok && "itemPhotoSize" in none.value).toBe(false);
    for (const bad of ["xl", 3, true, {}]) expect(parseLayout({ ...base, itemPhotoSize: bad }).ok, String(bad)).toBe(false);
  });

  it("clamps imageZoom to 1–3 (2 dp), refuses non-numbers, keeps unknown custom keys and v > 1 untouched", () => {
    const parse = (custom: unknown) => parseCustom(custom, base);
    expect(parse({ v: 1, imageZoom: 0.2 })).toEqual({ ok: true, value: { v: 1, imageZoom: IMAGE_ZOOM.min } });
    expect(parse({ v: 1, imageZoom: 9 })).toEqual({ ok: true, value: { v: 1, imageZoom: IMAGE_ZOOM.max } });
    expect(parse({ v: 1, imageZoom: 1.23456 })).toEqual({ ok: true, value: { v: 1, imageZoom: 1.23 } });
    expect(parse({ v: 1, imageZoom: "2" }).ok).toBe(false);
    expect(parse({ v: 1, imageZoom: 1.5, futureKey: { a: 1 } })).toEqual({ ok: true, value: { v: 1, imageZoom: 1.5, futureKey: { a: 1 } } });
    expect(parse({ v: 2, imageZoom: "anything" })).toEqual({ ok: true, value: { v: 2, imageZoom: "anything" } });
  });

  it("an older client sending back the stored key bag keeps every new field (parse is a fixed point)", () => {
    const stored = { ...base, itemPhotoSize: "large", imageFit: "contain", custom: { v: 1, imageZoom: 1.4, imageFocus: { x: 30, y: 70 }, fromNewerApp: true } };
    const once = parseLayout(stored);
    expect(once.ok).toBe(true);
    const twice = parseLayout(JSON.parse(JSON.stringify((once as { value: LayoutDocument }).value)));
    expect((twice as { value: LayoutDocument }).value).toEqual((once as { value: LayoutDocument }).value);
    const v = (twice as { value: LayoutDocument }).value;
    expect([v.itemPhotoSize, v.imageFit, v.custom?.imageZoom, v.custom?.imageFocus, v.custom?.fromNewerApp]).toEqual(["large", "contain", 1.4, { x: 30, y: 70 }, true]);
  });

  it("does not bump custom.v and exposes the new bounds to clients", () => {
    expect(CUSTOMIZATION_META.version).toBe(1);
    expect(CUSTOMIZATION_META.imageZoom).toEqual({ min: 1, max: 3, step: 0.05 });
    expect(CUSTOMIZATION_META.itemPhotoSizes).toEqual(["small", "medium", "large"]);
  });
});

describe("t421u defaults: new boards get the template default, existing boards stay absent", () => {
  it("seeds every template (food and non-food) with its composition default; layouts hide the control", () => {
    for (const d of MENU_DESIGNS) {
      expect(designDocument(d).itemPhotoSize, d.id).toBe(DESIGN_ITEM_PHOTO_DEFAULT[d.composition]);
      expect(customizationSpec(designDocument(d)).itemPhotoSize, d.id).toEqual({ def: DESIGN_ITEM_PHOTO_DEFAULT[d.composition] });
    }
    expect(DESIGN_ITEM_PHOTO_DEFAULT.list).toBe("large");
    for (const t of LAYOUTS) expect(customizationSpec(sampleLayout(t)).itemPhotoSize, t).toBeNull();
  });

  it("the catalog seed Android posts carries the default, and its spec carries the presets", () => {
    const catalog = buildCatalog(null);
    for (const entry of catalog.entries.filter((e) => e.kind === "template")) {
      if (!("document" in entry.create)) continue;
      const doc = entry.create.document;
      const d = designById(doc.design)!;
      expect(doc.itemPhotoSize, entry.id).toBe(DESIGN_ITEM_PHOTO_DEFAULT[d.composition]);
      expect(entry.customization?.itemPhotoSize).toEqual({ def: DESIGN_ITEM_PHOTO_DEFAULT[d.composition] });
    }
  });

  it("switching template keeps the owner's choice (and absent stays absent)", () => {
    const owner = { ...designDocument(designById("modern-restaurant")!), itemPhotoSize: "small" as const };
    expect(switchDesign(owner, designById("taqueria")!).itemPhotoSize).toBe("small");
    expect("itemPhotoSize" in switchDesign(existing(owner), designById("taqueria")!)).toBe(false);
  });
});

describe("t421u item photo size: rendering", () => {
  it("absent renders byte-identically to Small on every template, both orientations, with item photos", () => {
    for (const d of MENU_DESIGNS) for (const o of ORIENTATIONS) {
      for (const make of [withPhotos, dense, longText]) {
        const doc = { ...orient(existing(make(designDocument(d))), o) };
        expect(render(sized(doc, "small")).svg, `${d.id} ${o} ${make.name}`).toBe(render(doc).svg);
      }
    }
  });

  for (const [label, list] of [["22 food templates", FOOD], ["16 non-food templates", NON_FOOD], ["4 premium service templates", PREMIUM]] as const) {
    it(`${label}: Medium/Large never drop an item or price, never shrink text past 88% of Small, and report what was drawn`, () => {
      expect(list.length).toBe(Number(label.split(" ")[0]));
      for (const d of list) for (const o of ORIENTATIONS) for (const make of [withPhotos, dense, longText]) {
        const doc = { ...orient(existing(make(designDocument(d))), o) };
        const small = render(sized(doc, "small"));
        for (const size of ["medium", "large"] as const) {
          const r = render(sized(doc, size));
          const key = `${d.id} ${o} ${make.name} ${size}`;
          expect(r.report.dropped, key).toBeLessThanOrEqual(small.report.dropped);
          expect(r.report.scale, key).toBeGreaterThanOrEqual(small.report.scale * 0.88 - 1e-6);
          expect(r.report.itemPhotos?.requested, key).toBe(size);
          if (!small.report.dropped) {
            // Every item that Small draws is still drawn, name and price (names may wrap beside a bigger photo).
            const text = drawnText(r.svg);
            for (const s of doc.sections) for (const i of s.items) {
              if (d.composition === "cards" && doc.sections.flatMap((x) => x.items).indexOf(i) >= 15) continue;
              if (drawnText(small.svg).includes(esc(i.name))) expect(text, `${key} ${i.name}`).toContain(esc(i.name));
              if (i.price && small.svg.includes(`>${esc(i.price)}<`)) expect(r.svg, `${key} ${i.price}`).toContain(`>${esc(i.price)}<`);
            }
          }
        }
      }
    });
  }

  it("Medium and Large really are bigger when reported, and grow on most realistic boards (a few dishes with photos)", () => {
    const thumb = (svg: string) => Number(/<clipPath id="ip0"><rect [^>]*width="([\d.]+)"/.exec(svg)?.[1] ?? 0);
    let grew = 0; let cases = 0;
    for (const d of MENU_DESIGNS) for (const o of ORIENTATIONS) {
      const doc = { ...orient(existing(withPhotos(designDocument(d), false)), o) };
      const small = render(sized(doc, "small"));
      for (const size of ["medium", "large"] as const) {
        const r = render(sized(doc, size)); cases += 1;
        const eff = r.report.itemPhotos?.effective;
        if (eff !== "small") grew += 1;
        if (eff === "small") expect(r.svg, `${d.id} ${o} ${size}`).toBe(small.svg);
        if (!["cards", "featured"].includes(d.composition) && eff && eff !== "small") {
          expect(thumb(r.svg), `${d.id} ${o} ${size}`).toBeGreaterThanOrEqual(thumb(small.svg) * (eff === "large" ? 1.3 : 1.12) - 0.5);
        }
      }
    }
    expect(grew / cases).toBeGreaterThan(0.75);
    // Prices end inside the board on every template and size.
    for (const d of MENU_DESIGNS) for (const size of ITEM_PHOTO_SIZES) {
      const svg = render(sized(withPhotos(designDocument(d)), size)).svg;
      for (const m2 of svg.matchAll(/<text x="([\d.]+)"[^>]*text-anchor="end">/g)) expect(Number(m2[1]), `${d.id} ${size}`).toBeLessThanOrEqual(1920);
    }
  });

  it("dense 24-item menus fall back honestly instead of dropping items", () => {
    for (const d of MENU_DESIGNS.filter((x) => x.composition !== "cards")) {
      const doc = existing(dense(designDocument(d)));
      const r = render(sized(doc, "large"));
      expect(r.report.dropped, d.id).toBeLessThanOrEqual(render(doc).report.dropped);
      expect(["small", "medium", "large", null]).toContain(r.report.itemPhotos?.effective);
    }
  });

  it("card grids and featured dishes use their own preset geometry", () => {
    const cafe = { ...withPhotos(designDocument(designById("cafe-favorites")!)), orientation: "portrait" as const };
    const tile = (svg: string) => Number(/<clipPath id="ip0"><(?:rect|circle) [^>]*(?:height|r)="([\d.]+)"/.exec(svg)?.[1] ?? 0);
    expect(tile(render(sized(cafe, "large")).svg)).toBeGreaterThan(tile(render(sized(cafe, "small")).svg));
    const featured = designDocument(designById("featured-dishes")!);
    const two = { ...featured, sections: featured.sections.map((s, si) => ({ ...s, items: s.items.map((i, ii) => ({ ...i, stockPhoto: undefined, imageMediaId: si === 0 && ii < 2 ? OWNER : undefined })) })) };
    const side = (svg: string) => Math.max(...[...svg.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="\3" rx="18"\/>/g)].map((m) => Number(m[3])), 0);
    expect(side(render(sized(two, "medium")).svg)).toBeGreaterThan(side(render(sized(two, "small")).svg));
  });

  it("original layouts ignore the field (row-height thumbnails, control hidden)", () => {
    for (const t of LAYOUTS) {
      const doc = withPhotos(sampleLayout(t));
      expect(layoutSvg({ ...doc, itemPhotoSize: "large" }, art), t).toBe(layoutSvg(doc, art));
    }
  });
});

describe("t421u featured photo framing", () => {
  const box = { x: 1140, y: 0, w: 780, h: 1080 };
  const wide = { w: 4000, h: 2000 };

  it("Fill covers, Fit contains, zoom scales the base, focus slides it inside the box", () => {
    const fill = framePlacement(box, "cover", 1, { x: 50, y: 50 }, wide);
    expect(fill).toMatchObject({ kind: "exact", h: 1080, w: 2160, letterbox: false });
    const fit = framePlacement(box, "contain", 1, { x: 50, y: 50 }, wide);
    expect(fit).toMatchObject({ kind: "exact", w: 780, h: 390, letterbox: true, x: 1140, y: 345 });
    const top = framePlacement(box, "contain", 1, { x: 50, y: 0 }, wide);
    expect(top.y).toBe(0);
    const zoomed = framePlacement(box, "contain", 2, { x: 50, y: 50 }, wide);
    expect([zoomed.w, zoomed.h]).toEqual([1560, 780]);
    expect(framePlacement(box, "cover", 99, { x: 0, y: 0 }, wide).w).toBe(2160 * IMAGE_ZOOM.max);
  });

  it("at zoom 1 in Fill it is exactly the existing focal-point placement", () => {
    for (const f of [{ x: 0, y: 0 }, { x: 30, y: 70 }, { x: 100, y: 100 }]) {
      const a = framePlacement(box, "cover", 1, f, wide); const b = focusPlacement(box, f, wide);
      expect(a.kind === "exact" && b.kind === "exact" && [a.x, a.y, a.w, a.h]).toEqual(b.kind === "exact" ? [b.x, b.y, b.w, b.h] : null);
    }
  });

  it("renders consistently on every template with a photo area, horizontal and vertical, with a Fit backdrop", () => {
    for (const d of MENU_DESIGNS.filter((x) => customizationSpec(designDocument(x)).imageFocus)) for (const o of ORIENTATIONS) {
      const doc = { ...orient(designDocument(d), o), stockPhoto: undefined, imageFit: "contain" as const, custom: { v: 1 as const, imageZoom: 1.2, imageFocus: { x: 20, y: 80 } } };
      const svg = designSvgWithReport(doc, { imageHref: PHOTO, imageSize: wide }).svg;
      expect(svg, `${d.id} ${o}`).toMatch(/<clipPath id="fp\d+"><rect[^>]*\/><\/clipPath><image href="data:image\/png[^"]*" x="[\d.-]+" y="[\d.-]+" width="[\d.]+" height="[\d.]+" preserveAspectRatio="none"/);
      expect(designSvgWithReport({ ...doc, custom: undefined }, { imageHref: PHOTO }).svg, `${d.id} ${o} backdrop`).toMatch(/fill="#[0-9a-f]{6}"\/><image href="data:image\/png[^"]*"[^>]*meet"/);
    }
    for (const t of LAYOUTS) for (const o of ORIENTATIONS) {
      const doc = { ...orient(sampleLayout(t), o), custom: { v: 1 as const, imageZoom: 1.5 } };
      expect(layoutSvg(doc, { imageHref: PHOTO, imageSize: wide }), `${t} ${o}`).toMatch(/clip-path="url\(#lfp\)"/);
    }
  });

  it("boards without zoom keep the exact legacy photo markup (Fill, Fill+focus, Fit on layouts)", () => {
    const d = designDocument(designById("modern-restaurant")!);
    expect(designSvgWithReport(d, { imageHref: PHOTO }).svg).toContain(`<image href="${PHOTO}" x="1140" y="0" width="780" height="1080" preserveAspectRatio="xMidYMid slice"/>`);
  });

  it("Reset photo deletes zoom and focus, returns to Fill/center, and keeps the featured area size", () => {
    const d = { ...designDocument(designById("modern-restaurant")!), imageFit: "contain" as const, imageAnchor: "top" as const, custom: { v: 1 as const, mediaSize: 0.45, imageZoom: 2, imageFocus: { x: 10, y: 10 }, textScale: 1.12 } };
    const r = resetFeaturedPhoto(d);
    expect([r.imageFit, r.imageAnchor]).toEqual(["cover", "center"]);
    expect(r.custom).toEqual({ v: 1, mediaSize: 0.45, textScale: 1.12 });
    // Reset all is unchanged: deletes custom, leaves imageFit/imageAnchor as they are.
    const all = applyCustomReset(d, ["custom", "sections.*.headingOverride"]);
    expect([all.custom, all.imageFit, all.imageAnchor]).toEqual([undefined, "contain", "top"]);
  });

  it("video placement is unchanged by any framing setting", () => {
    for (const d of MENU_DESIGNS) for (const o of ORIENTATIONS) {
      const doc = { ...orient(designDocument(d), o), videoMediaId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" };
      expect(designVideoBox({ ...doc, imageFit: "contain", custom: { v: 1, imageZoom: 2.5, imageFocus: { x: 0, y: 100 } } }), `${d.id} ${o}`).toEqual(designVideoBox(doc));
    }
  });

  it("the fit report echoes framing and item photo size (additive)", () => {
    const doc = { ...designDocument(designById("modern-restaurant")!), custom: { v: 1 as const, imageZoom: 1.5 } };
    const fit = boardFit(withPhotos(doc, false), { natural: wide });
    expect(fit.photo).toEqual({ fit: "cover", zoom: 1.5, focus: null, natural: wide });
    expect(fit.itemPhotos?.requested).toBe("medium");
    expect(boardFit(designDocument(designById("taqueria")!)).photo).toBeNull();
    expect(boardFit(sampleLayout("split-50")).itemPhotos).toBeNull();
  });

  it("the server PNG applies zoom (it loads the photo's size) at 1920×1080 and 1080×1920", () => {
    const bytes = Buffer.from(PHOTO.split(",")[1], "base64");
    for (const o of ORIENTATIONS) {
      const doc = { ...orient(designDocument(designById("modern-restaurant")!), o), stockPhoto: undefined };
      const plain = renderLayoutPng(doc, { bytes, mime: "image/png" });
      const zoomed = renderLayoutPng({ ...doc, imageFit: "contain", custom: { v: 1, imageZoom: 1.3 } }, { bytes, mime: "image/png" });
      expect(zoomed.readUInt32BE(16)).toBe(o === "portrait" ? 1080 : 1920);
      expect(zoomed.equals(plain)).toBe(false);
    }
  });
});

describe("t421u save → reopen → edit → publish (real save path)", () => {
  it("stores, reopens and publishes item photo size and framing; the TV render sees the same document", async () => {
    const { applyLayoutSave } = await import("@/lib/layout-publish");
    const photo = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const files = [{ id: photo, accountId: OWNER, mime: "image/jpeg", kind: "image" as const }];
    const store: { doc?: LayoutDocument } = {}; const rendered: LayoutDocument[] = [];
    const deps = {
      writeContent: async (doc: LayoutDocument) => { store.doc = JSON.parse(JSON.stringify(doc)); },
      render: async (doc: LayoutDocument) => { rendered.push(doc); return "png"; },
      swap: async () => undefined, preview: async () => undefined,
    };
    const seed = { ...designDocument(designById("modern-restaurant")!), stockPhoto: undefined, imageMediaId: photo };
    const first = await applyLayoutSave({ enabled: true, accountId: OWNER, mode: "draft", document: { ...seed, itemPhotoSize: "small", imageFit: "contain", custom: { v: 1, imageZoom: 1.25, imageFocus: { x: 20, y: 40 } } }, files, previousMediaId: null }, deps);
    expect(first.ok).toBe(true);
    expect([store.doc?.itemPhotoSize, store.doc?.imageFit, store.doc?.custom?.imageZoom]).toEqual(["small", "contain", 1.25]);
    // Reopen (the stored row is parsed again) and edit only the size; framing survives.
    const reopened = parseLayout(store.doc);
    expect(reopened.ok).toBe(true);
    const edited = { ...(reopened as { value: LayoutDocument }).value, itemPhotoSize: "large" as const };
    const pub = await applyLayoutSave({ enabled: true, accountId: OWNER, mode: "publish", document: edited, files, previousMediaId: "old" }, deps);
    expect(pub.ok).toBe(true);
    expect(rendered.at(-1)).toMatchObject({ itemPhotoSize: "large", imageFit: "contain", custom: { v: 1, imageZoom: 1.25, imageFocus: { x: 20, y: 40 } } });
    // Reset photo, then publish: zoom/focus gone, Fill/center, size kept.
    const reset = resetFeaturedPhoto(rendered.at(-1)!);
    const pub2 = await applyLayoutSave({ enabled: true, accountId: OWNER, mode: "publish", document: reset, files, previousMediaId: "png" }, deps);
    expect(pub2.ok).toBe(true);
    expect(store.doc).toMatchObject({ itemPhotoSize: "large", imageFit: "cover", imageAnchor: "center" });
    expect(store.doc?.custom?.imageZoom).toBeUndefined();
  });

  it("an existing board saved by an older client (no new keys) stays legacy", async () => {
    const { applyLayoutSave } = await import("@/lib/layout-publish");
    const legacy = existing(designDocument(designById("taqueria")!));
    let stored: LayoutDocument | undefined;
    await applyLayoutSave({ enabled: true, accountId: OWNER, mode: "draft", document: legacy, files: [], previousMediaId: null }, {
      writeContent: async (doc) => { stored = doc; }, render: async () => "png", swap: async () => undefined,
    });
    expect(stored && "itemPhotoSize" in stored).toBe(false);
    expect(stored?.custom?.imageZoom).toBeUndefined();
  });
});
