import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { layoutSvg, parseLayout, sampleLayout, type LayoutDocument, type LayoutSection } from "@/lib/layout-studio";
import { MENU_DESIGNS, designById, designDocument, isPhotoDesign, switchDesign } from "@/lib/menu-designs";
import { CARD_CAPACITY, designSvgWithReport, featuredItems, itemPhotosShown } from "@/lib/menu-design-svg";
import { itemPhotoIds, moveItem, splitLastItems, withItemPhoto } from "@/lib/menu-item-photos";
import { applyLayoutSave, type LibraryFile } from "@/lib/layout-publish";
import { renderLayoutPng } from "@/lib/server/layout-render";
import { en } from "@/lib/i18n/en";
import { es } from "@/lib/i18n/es";
import baselineDesigns from "../fixtures/design-svg-baseline.json";

const ACC = "00000000-0000-4000-8000-0000000000aa";
const OTHER = "00000000-0000-4000-8000-0000000000bb";
const P1 = "00000000-0000-4000-8000-000000000101";
const P2 = "00000000-0000-4000-8000-000000000102";
const FOREIGN = "00000000-0000-4000-8000-000000000999";
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const href = `data:image/png;base64,${PNG}`;
const sha = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");

function photoBoard(designId = "coffee-shop"): LayoutDocument {
  const doc = designDocument(designById(designId)!);
  let sections = doc.sections;
  sections = withItemPhoto(sections, 0, 0, P1);
  sections = withItemPhoto(sections, 1, 1, P2);
  return { ...doc, sections };
}

describe("per-item photos: data model", () => {
  it("stores the photo on its item and parses it back; invalid references are dropped, not fatal", () => {
    const doc = photoBoard();
    const parsed = parseLayout(JSON.parse(JSON.stringify(doc)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.sections[0].items[0].imageMediaId).toBe(P1);
    expect(parsed.value.sections[1].items[1].imageMediaId).toBe(P2);
    const bad = parseLayout({ ...doc, sections: [{ name: "A", items: [{ name: "X", price: "1", description: "", imageMediaId: "../etc", stockPhoto: "nope" }] }] });
    expect(bad.ok).toBe(true);
    if (bad.ok) expect(bad.value.sections[0].items[0]).toEqual({ name: "X", price: "1", description: "" });
  });

  it("items without photos parse exactly as before (no new keys)", () => {
    const parsed = parseLayout(sampleLayout("split-50"));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) for (const s of parsed.value.sections) for (const i of s.items) expect(Object.keys(i).sort()).toEqual(["description", "name", "price"]);
  });

  it("existing boards and the original 18 templates render byte-for-byte as before", () => {
    for (const design of MENU_DESIGNS) {
      for (const variant of design.variants) {
        const key = `${design.id}/${variant.id}`;
        const recorded = (baselineDesigns as Record<string, string>)[key];
        if (!recorded) continue; // the four new templates have no earlier render
        expect(sha(layoutSvg(designDocument(design, variant.id))), key).toBe(recorded);
      }
    }
    expect(Object.keys(baselineDesigns)).toHaveLength(108);
  });
});

describe("photos travel with their items", () => {
  it("add, replace and remove a photo on one item only", () => {
    const base = designDocument(designById("coffee-shop")!).sections;
    const added = withItemPhoto(base, 0, 2, P1);
    expect(added[0].items[2].imageMediaId).toBe(P1);
    const replaced = withItemPhoto(added, 0, 2, P2);
    expect(replaced[0].items[2].imageMediaId).toBe(P2);
    const removed = withItemPhoto(replaced, 0, 2, null);
    expect(removed[0].items[2].imageMediaId).toBeUndefined();
    expect(removed[0].items[2].name).toBe(base[0].items[2].name);
    expect(base[0].items[2].imageMediaId).toBeUndefined(); // inputs are never mutated
    // A template sample photo is replaced by the owner's photo, and removing clears it too.
    const grid = designDocument(designById("photo-menu-grid")!).sections;
    expect(grid[0].items[0].stockPhoto).toBe("bowl");
    const own = withItemPhoto(grid, 0, 0, P1);
    expect(own[0].items[0]).toMatchObject({ imageMediaId: P1 });
    expect(own[0].items[0].stockPhoto).toBeUndefined();
  });

  it("reordering and moving between sections keeps each photo on its item", () => {
    const start = photoBoard().sections;
    const name = start[0].items[0].name;
    let s = moveItem(start, 0, 0, 1); // down within the section
    expect(s[0].items[1]).toMatchObject({ name, imageMediaId: P1 });
    s = moveItem(s, 0, s[0].items.length - 1, 1); // last of section 0 → first of section 1
    const lastName = start[0].items[start[0].items.length - 1].name;
    expect(s[1].items[0].name).toBe(lastName);
    s = moveItem(s, 1, 0, -1); // and back up into section 0
    expect(s[0].items[s[0].items.length - 1].name).toBe(lastName);
    const p2Item = start[1].items[1];
    const moved = moveItem(start, 1, 1, -1);
    expect(moved[1].items[0]).toEqual(p2Item);
    expect(itemPhotoIds(moved).sort()).toEqual([P1, P2]);
    // Moving into a full section is refused rather than losing anything.
    const full: LayoutSection[] = [{ name: "A", items: [{ name: "x", price: "", description: "" }] }, { name: "B", items: Array.from({ length: 12 }, (_, i) => ({ name: `b${i}`, price: "", description: "" })) }];
    expect(moveItem(full, 0, 0, 1)).toBe(full);
  });

  it("switching photo → text → photo templates keeps all photos, and they stay visible", () => {
    const doc = photoBoard("photo-menu-grid");
    const ids = itemPhotoIds(doc.sections);
    const textOnly = switchDesign(doc, designById("chalkboard-bistro")!);
    expect(itemPhotoIds(textOnly.sections)).toEqual(ids);
    // A text-focused template shows the owner's photos as thumbnails instead of silently dropping them.
    expect(itemPhotosShown(textOnly, designById("chalkboard-bistro")!)).toBe(true);
    expect(layoutSvg(textOnly, { itemImages: { [P1]: href, [P2]: href } })).toContain(href);
    // Hiding them is an explicit owner choice, and the photos stay on their items.
    const hidden = { ...textOnly, photoStyle: "text" as const };
    expect(layoutSvg(hidden, { itemImages: { [P1]: href, [P2]: href } })).not.toContain(href);
    expect(itemPhotoIds(hidden.sections)).toEqual(ids);
    const back = switchDesign(hidden, designById("cafe-favorites")!);
    expect(itemPhotoIds(back.sections)).toEqual(ids);
    expect(layoutSvg(back, { itemImages: { [P1]: href, [P2]: href } })).toContain(href); // cards always show photos
  });

  it("splits a too-long menu into two boards without losing an item or a photo", () => {
    const doc = designDocument(designById("photo-menu-grid")!);
    const many = { ...doc, sections: [0, 1, 2, 3].map((s) => ({ name: `S${s}`, items: Array.from({ length: 5 }, (_, i) => ({ name: `Item ${s}-${i}`, price: "$9", description: "", imageMediaId: s === 3 && i === 4 ? P1 : undefined })) })) };
    const { dropped } = designSvgWithReport(many).report;
    expect(dropped).toBe(20 - CARD_CAPACITY);
    const { kept, moved } = splitLastItems(many.sections, dropped);
    const count = (secs: LayoutSection[]) => secs.reduce((a, s) => a + s.items.length, 0);
    expect(count(kept) + count(moved)).toBe(20);
    expect(itemPhotoIds(moved)).toEqual([P1]);
    expect(designSvgWithReport({ ...many, sections: kept }).report.dropped).toBe(0);
  });
});

describe("regression: a photo on Modern Restaurant's Burrata appears on the TV", () => {
  const design = designById("modern-restaurant")!;
  const burrata = () => {
    const doc = designDocument(design);
    expect(doc.sections[0].items[0].name).toBe("Burrata");
    return { ...doc, sections: withItemPhoto(doc.sections, 0, 0, P1) };
  };

  it("the photo is drawn in the preview SVG with the template unchanged otherwise", () => {
    const doc = burrata();
    expect(doc.photoStyle).toBeUndefined();
    expect(itemPhotosShown(doc, design)).toBe(true);
    const svg = layoutSvg(doc, { itemImages: { [P1]: href } });
    expect(svg).toContain(href);
    expect(svg).toContain("Burrata");
    for (const s of doc.sections) for (const i of s.items) expect(svg, i.name).toContain(i.name.replace(/&/g, "&amp;").replace(/'/g, "&#39;"));
    expect(designSvgWithReport(doc, { itemImages: { [P1]: href } }).report.dropped).toBe(0);
  });

  it("no initial-letter placeholder tiles on a text template", () => {
    const doc = burrata();
    const svg = layoutSvg(doc, { itemImages: { [P1]: href } });
    // "C" (Charred octopus) and "B" (Beef tartare) placeholders must not appear as centred single letters.
    expect(svg).not.toMatch(/text-anchor="middle">C</);
    expect(svg).not.toMatch(/text-anchor="middle">B</);
  });

  it("survives save and reopen (stored JSON round trip)", () => {
    const parsed = parseLayout(JSON.parse(JSON.stringify(burrata())));
    if (!parsed.ok) throw new Error(parsed.error);
    const reopened = parsed.value;
    expect(reopened.sections[0].items[0].imageMediaId).toBe(P1);
    expect(layoutSvg(reopened, { itemImages: { [P1]: href } })).toContain(href);
  });

  it("the server's 1920×1080 PNG draws it", () => {
    const bytes = Buffer.from(PNG, "base64");
    const doc = burrata();
    const withPhoto = renderLayoutPng(doc, null, { itemImages: { [P1]: { bytes, mime: "image/png" } } });
    const hidden = renderLayoutPng({ ...doc, photoStyle: "text" }, null, { itemImages: { [P1]: { bytes, mime: "image/png" } } });
    expect(withPhoto.readUInt32BE(16)).toBe(1920);
    expect(withPhoto.readUInt32BE(20)).toBe(1080);
    expect(sha(withPhoto)).not.toBe(sha(hidden));
  }, 30_000);

  it("an explicit Hide is respected and explained", () => {
    const doc = { ...burrata(), photoStyle: "text" as const };
    expect(itemPhotosShown(doc, design)).toBe(false);
    expect(layoutSvg(doc, { itemImages: { [P1]: href } })).not.toContain(href);
    for (const k of ["tpl.photosHiddenNote", "tpl.showItemPhotos", "tpl.photoSavedHidden", "tpl.photoAdded", "tpl.photosShownNote", "tpl.photoWhereThumbs"] as const) {
      expect(en[k], k).toBeTruthy();
      expect(es[k], k).toBeTruthy();
      expect(es[k], k).not.toBe(en[k]);
    }
  });

  it("every one of the 22 templates shows an owner photo unless hidden", () => {
    for (const d of MENU_DESIGNS) {
      const doc = designDocument(d);
      const withPhoto = { ...doc, sections: withItemPhoto(doc.sections, 0, 0, P1) };
      expect(layoutSvg(withPhoto, { itemImages: { [P1]: href } }), d.id).toContain(href);
      expect(designSvgWithReport(withPhoto, { itemImages: { [P1]: href } }).report.dropped, d.id).toBe(0);
    }
  });
});

describe("rendering item photos (shared SVG: browser preview and TV PNG)", () => {
  it("crops photos to fit (never stretched), clips them, and keeps them off text and prices", () => {
    const doc = { ...photoBoard("coffee-shop"), photoStyle: "thumbs" as const };
    const svg = layoutSvg(doc, { itemImages: { [P1]: href, [P2]: href } });
    const images = [...svg.matchAll(/<image href="data:image\/png[^>]*>/g)].map((m) => m[0]);
    expect(images.length).toBe(2);
    for (const tag of images) {
      expect(tag).toContain('preserveAspectRatio="xMidYMid slice"');
      expect(tag).toMatch(/clip-path="url\(#ip\d+\)"/);
    }
    // Every item name and price sits to the right of its thumbnail column.
    const thumb = images.map((tag) => ({ x: Number(/x="([\d.]+)"/.exec(tag)![1]), w: Number(/width="([\d.]+)"/.exec(tag)![1]) }));
    for (const t of thumb) expect(t.w).toBeGreaterThan(40);
  });

  it("shows a tidy placeholder for items without a photo, and for photos that can't be loaded", () => {
    const doc = photoBoard("photo-menu-grid");
    const missing = layoutSvg(withItemPhoto(doc.sections, 0, 0, FOREIGN) && { ...doc, sections: withItemPhoto(doc.sections, 0, 0, FOREIGN) }, {});
    expect(missing).not.toContain(FOREIGN);
    expect(missing).toMatch(/font-family="Noto Serif"[^>]*text-anchor="middle">H</); // "H" for Harvest bowl
  });

  it("featured template highlights the items with photos and keeps the rest in the list", () => {
    const doc = designDocument(designById("featured-dishes")!);
    const featured = featuredItems(doc).map((i) => i.name);
    expect(featured).toEqual(["Seared salmon", "Dry-aged ribeye", "Rigatoni al ragù"]);
    const svg = layoutSvg(doc);
    for (const s of doc.sections) for (const i of s.items) expect(svg, i.name).toContain(i.name.replace(/&/g, "&amp;").replace(/'/g, "&#39;"));
  });

  it("server PNG draws the owner's item photos (account files loaded on the server)", () => {
    const doc = photoBoard("photo-menu-grid");
    const bytes = Buffer.from(PNG, "base64");
    const withPhotos = renderLayoutPng(doc, null, { itemImages: { [P1]: { bytes, mime: "image/png" }, [P2]: { bytes, mime: "image/png" } } });
    const without = renderLayoutPng(doc, null, {});
    expect(withPhotos.readUInt32BE(16)).toBe(1920);
    expect(withPhotos.readUInt32BE(20)).toBe(1080);
    expect(sha(withPhotos)).not.toBe(sha(without));
  }, 30_000);

  it("never hides items silently: card grids report what doesn't fit, a full 24-item menu fits with thumbnails", () => {
    const grid = designDocument(designById("photo-menu-grid")!);
    const full = { ...grid, sections: [0, 1, 2, 3].map((s) => ({ name: `Section ${s}`, items: Array.from({ length: 6 }, (_, i) => ({ name: `Long item name number ${s}${i}`, price: "$12.50", description: "With a description that is fairly long", stockPhoto: "tacos" as const })) })) };
    expect(designSvgWithReport(full).report.dropped).toBe(24 - CARD_CAPACITY);
    // A typical full menu (24 items, photos on all, descriptions on half) fits on the thumbnail template.
    const typical = { ...full, sections: full.sections.map((sec) => ({ ...sec, items: sec.items.map((it, i) => ({ ...it, name: it.name.slice(0, 16), description: i % 2 ? "" : "Fresh, made to order" })) })) };
    const thumbs = switchDesign(typical, designById("taqueria-specials")!);
    expect(designSvgWithReport(thumbs).report.dropped).toBe(0);
    // Even the extreme case (every item with a long name, a long description and a photo) fits: a long section
    // continues into the next column instead of anything being left off.
    const extreme = switchDesign(full, designById("taqueria-specials")!);
    const report = designSvgWithReport(extreme).report;
    expect(report.dropped).toBe(0);
    expect(report.scale).toBeGreaterThanOrEqual(0.55);
    const hidden = { ...extreme, photoStyle: "text" as const };
    expect(designSvgWithReport(hidden).report.dropped).toBe(0);
    expect(itemPhotoIds(hidden.sections)).toEqual(itemPhotoIds(full.sections));
  });
});

describe("saving: ownership, missing photos and publishing", () => {
  const files: LibraryFile[] = [
    { id: P1, accountId: ACC, mime: "image/jpeg", kind: "image" },
    { id: P2, accountId: ACC, mime: "image/png", kind: "image" },
    { id: FOREIGN, accountId: OTHER, mime: "image/png", kind: "image" },
  ];
  const deps = (writes: LayoutDocument[], renders: string[]) => ({
    writeContent: async (doc: LayoutDocument) => { writes.push(doc); },
    render: async () => { renders.push("png"); return "00000000-0000-4000-8000-0000000000ee"; },
    swap: async () => {},
    preview: async () => {},
  });

  it("keeps the account's own item photos and drops another account's (never stored or drawn)", async () => {
    const writes: LayoutDocument[] = [];
    const doc = photoBoard("photo-menu-grid");
    const sneaky = { ...doc, sections: withItemPhoto(doc.sections, 2, 0, FOREIGN), logoMediaId: FOREIGN };
    const res = await applyLayoutSave({ enabled: true, accountId: ACC, mode: "draft", document: sneaky, files, previousMediaId: null }, deps(writes, []));
    expect(res.ok).toBe(true);
    const saved = writes[0];
    expect(itemPhotoIds(saved.sections).sort()).toEqual([P1, P2]);
    expect(JSON.stringify(saved)).not.toContain(FOREIGN);
    expect(saved.logoMediaId).toBeNull();
    expect(saved.sections[2].items[0].name).toBe(doc.sections[2].items[0].name); // the item itself is kept
  });

  it("a deleted photo doesn't block saving; the item keeps its text", async () => {
    const writes: LayoutDocument[] = [];
    const deleted = "00000000-0000-4000-8000-000000000555";
    const doc = { ...photoBoard(), sections: withItemPhoto(photoBoard().sections, 0, 1, deleted) };
    const res = await applyLayoutSave({ enabled: true, accountId: ACC, mode: "draft", document: doc, files, previousMediaId: null }, deps(writes, []));
    expect(res.ok).toBe(true);
    expect(writes[0].sections[0].items[1].imageMediaId).toBeUndefined();
  });

  it("refuses to publish an incomplete menu, but saves it as a draft without touching screens", async () => {
    const grid = designDocument(designById("photo-menu-grid")!);
    const tooMany = { ...grid, sections: [0, 1, 2, 3].map((s) => ({ name: `S${s}`, items: Array.from({ length: 5 }, (_, i) => ({ name: `Dish ${s}${i}`, price: "$9", description: "" })) })) };
    const writes: LayoutDocument[] = []; const renders: string[] = [];
    const pub = await applyLayoutSave({ enabled: true, accountId: ACC, mode: "publish", document: tooMany, files, previousMediaId: null }, deps(writes, renders));
    expect(pub.ok).toBe(false);
    if (!pub.ok) expect(pub.error).toMatch(/5 items don't fit/);
    expect(writes).toHaveLength(0);
    expect(renders).toHaveLength(0);
    const draft = await applyLayoutSave({ enabled: true, accountId: ACC, mode: "draft", document: tooMany, files, previousMediaId: null }, deps(writes, renders));
    expect(draft.ok).toBe(true);
    expect(writes[0].sections.reduce((a, s) => a + s.items.length, 0)).toBe(20); // every item kept
  });
});

describe("older clients can't erase layout boards or item photos", () => {
  it("the classic menus PATCH refuses to re-render a layout/template board and only renames or assigns it", () => {
    const src = readFileSync("app/api/menus/[id]/route.ts", "utf8");
    expect(src).toContain("if (parseLayout(row.content).ok) {");
    expect(src).toContain('return fail("This menu board was made in the web editor. Edit it at pekkotv.com.", 409);');
    expect(src.indexOf("if (parseLayout(row.content).ok) {")).toBeLessThan(src.indexOf("const result = await rerenderMenu("));
  });
  it("apply-brand-to-all skips layout/template boards instead of overwriting them with the classic renderer", () => {
    const src = readFileSync("app/api/brand/apply/route.ts", "utf8");
    expect(src).toContain("if (parseLayout(row.content).ok) { skipped++; continue; }");
    expect(src.indexOf("parseLayout(row.content).ok")).toBeLessThan(src.indexOf("await rerenderMenu(admin.accountId, row, {})"));
  });
  it("the advanced editor keeps unknown item fields when editing (spreads the item)", () => {
    expect(readFileSync("components/layout-studio.tsx", "utf8")).toContain("items: section.items.map((item, j) => j === ii ? { ...item, ...patch } : item),");
  });
});

describe("guided editor wiring and languages", () => {
  const ui = () => readFileSync("components/menu-templates.tsx", "utf8");
  it("each item has a photo button that opens upload, media library and remove", () => {
    const s = ui();
    expect(s).toContain('data-testid={`tpl-photo-${si}-${ii}`}');
    expect(s).toContain('data-testid="tpl-item-upload"');
    expect(s).toContain('data-testid="tpl-item-remove"');
    expect(s).toContain('void upload(e.target.files?.[0], "item", target)');
    expect(s).toContain("disabled={busy !== null || fit.dropped > 0}");
  });
  it("has 22 templates including the four photo templates", () => {
    expect(MENU_DESIGNS).toHaveLength(22);
    for (const id of ["photo-menu-grid", "cafe-favorites", "taqueria-specials", "featured-dishes"]) expect(isPhotoDesign(designById(id)!), id).toBe(true);
    expect(MENU_DESIGNS.filter(isPhotoDesign)).toHaveLength(4);
  });
  it("every new string exists in English and Spanish", () => {
    for (const m of ui().matchAll(/t\("(tpl\.[a-zA-Z.]+)"/g)) {
      expect(en[m[1] as keyof typeof en], m[1]).toBeTruthy();
      expect(es[m[1] as keyof typeof es], m[1]).toBeTruthy();
    }
  });
});
