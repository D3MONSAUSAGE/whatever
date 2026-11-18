import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { layoutSvg, parseLayout, sampleLayout, type LayoutDocument, type LayoutTemplate } from "@/lib/layout-studio";
import { MENU_DESIGNS, designById, designDocument, switchDesign } from "@/lib/menu-designs";
import { MENU_TEMPLATES, keepStoredItemPhotos, parseMenuContent, sampleMenu, type MenuContent } from "@/lib/menu-templates";
import { menuSvg } from "@/lib/menu-classic-svg";
import { renderLayoutPng, prepareBoardPhoto } from "@/lib/server/layout-render";
import { renderMenuPng } from "@/lib/server/menu-render";
import {
  ORIGINAL_LAYOUTS, classicSaveContent, engineOf, filterGallery, fixedColumns, fromClassic, galleryEntries, layoutReport,
  mergeExtraSections, newLayoutDocument, switchToLayout, toClassic,
} from "@/lib/menu-designer";
import { menuTemplatesSetting, unifiedEditorEnabledFor, unifiedEditorSetting } from "@/lib/menu-templates-flag";
import { withItemPhoto } from "@/lib/menu-item-photos";
import { en } from "@/lib/i18n/en";
import { es } from "@/lib/i18n/es";

const P1 = "00000000-0000-4000-8000-000000000101";
const P2 = "00000000-0000-4000-8000-000000000102";
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const href = `data:image/png;base64,${PNG}`;
const sha = (s: string | Buffer | Uint8Array) => createHash("sha256").update(s).digest("hex");
const LAYOUTS: LayoutTemplate[] = ["menu-promo-67", "triple-column", "split-50", "menu-banner", "signature", "two-menu-promo", "two-column"];
const parsedMenu = (c: unknown): MenuContent => { const p = parseMenuContent(c); if (!p.ok) throw new Error(p.error); return p.value; };
const withLayoutPhoto = (doc: LayoutDocument, si = 0, ii = 0, id = P1) => ({ ...doc, sections: withItemPhoto(doc.sections, si, ii, id) });
const withClassicPhoto = (content: MenuContent, si = 0, ii = 0, id = P1): MenuContent => ({
  ...content, sections: content.sections.map((s, i) => (i === si ? { ...s, items: s.items.map((it, j) => (j === ii ? { ...it, imageMediaId: id } : it)) } : s)),
});
const textX = (svg: string, name: string) => Number(new RegExp(`<text x="([\\d.]+)"[^>]*>${name.replace(/[()]/g, "\\$&")}</text>`).exec(svg)?.[1]);

describe("one menu designer: engines and lossless classic boards", () => {
  it("tells the three board types apart", () => {
    expect(engineOf(designDocument(MENU_DESIGNS[0]), null)).toBe("design");
    expect(engineOf(sampleLayout("two-column"), null)).toBe("layout");
    const w = fromClassic("fresh", sampleMenu());
    expect(engineOf(w.doc, w.classic)).toBe("classic");
  });

  it("opening and saving a classic board without edits stores exactly what was there", () => {
    const cases: unknown[] = [
      sampleMenu(),
      { ...sampleMenu(), useBrand: false, photoMediaId: "00000000-0000-4000-8000-000000000999", headingFont: "oswald", bodyFont: "inter" },
      { ...sampleMenu(), headingFont: "inter" },
      { ...sampleMenu(), itemPhotos: false },
      withClassicPhoto(sampleMenu()),
    ];
    for (const theme of MENU_TEMPLATES.map((m) => m.id)) {
      for (const raw of cases) {
        const content = parsedMenu(raw);
        const w = fromClassic(theme, content);
        const back = toClassic(w.doc, w.classic);
        expect(back.template).toBe(theme);
        expect(back.content).toEqual(content);
        // The SVG the browser shows is byte-for-byte the classic renderer's output for the stored board.
        expect(menuSvg(back.template, back.content)).toBe(menuSvg(theme, content));
      }
    }
  });

  it("the web save sends the item photo key on every item, so a removal sticks (keep-stored guard sees it)", () => {
    const body = classicSaveContent(parsedMenu(withClassicPhoto(sampleMenu())));
    const items = (body.sections as { items: Record<string, unknown>[] }[]).flatMap((s) => s.items);
    expect(items.every((item) => "imageMediaId" in item)).toBe(true);
    expect(items[0].imageMediaId).toBe(P1);
    expect(items[1].imageMediaId).toBeNull();
    expect(parsedMenu(body)).toEqual(parsedMenu(withClassicPhoto(sampleMenu())));
  });

  it("classic content accepts optional item photos and a hide flag; invalid ids are dropped, never stored", () => {
    const ok = parsedMenu({ ...withClassicPhoto(sampleMenu()), itemPhotos: false });
    expect(ok.sections[0].items[0].imageMediaId).toBe(P1);
    expect(ok.itemPhotos).toBe(false);
    const bad = parsedMenu({ ...sampleMenu(), sections: [{ name: "A", items: [{ name: "X", price: "1", description: "", imageMediaId: "../etc/passwd" }] }] });
    expect("imageMediaId" in bad.sections[0].items[0]).toBe(false);
    expect("itemPhotos" in parsedMenu({ ...sampleMenu(), itemPhotos: true })).toBe(false);
  });
});

describe("Android and other older clients can't erase classic item photos", () => {
  const stored = { ...withClassicPhoto(withClassicPhoto(sampleMenu()), 1, 0, P2), itemPhotos: false };
  const android = () => {
    const c = JSON.parse(JSON.stringify(sampleMenu())) as Record<string, unknown>;
    return c; // sampleMenu has no imageMediaId / itemPhotos keys: exactly what an older client sends
  };
  it("items sent without the key keep their stored photo, matched by section and name", () => {
    const incoming = android();
    const next = keepStoredItemPhotos(incoming, parsedMenu(incoming), stored);
    expect(next.sections[0].items[0].imageMediaId).toBe(P1);
    expect(next.sections[1].items[0].imageMediaId).toBe(P2);
    expect(next.itemPhotos).toBe(false);
  });
  it("reordering, renaming a section or editing a price on Android keeps the photo with its item", () => {
    const incoming = android() as { sections: { name: string; items: { name: string; price: string }[] }[] };
    incoming.sections[0].items.reverse();
    incoming.sections[0].items[2].price = "$9";
    incoming.sections[1].name = "Bebidas";
    const next = keepStoredItemPhotos(incoming, parsedMenu(incoming), stored);
    const alPastor = next.sections[0].items.find((it) => it.name === "Al pastor");
    expect(alPastor?.imageMediaId).toBe(P1);
    expect(next.sections[1].items.find((it) => it.name === "Horchata")?.imageMediaId).toBe(P2);
  });
  it("an explicit null (the web editor) removes it; a new photo replaces it", () => {
    const removed = classicSaveContent(parsedMenu(sampleMenu()));
    expect(keepStoredItemPhotos(removed, parsedMenu(removed), stored).sections[0].items[0].imageMediaId).toBeUndefined();
    const replaced = classicSaveContent(parsedMenu(withClassicPhoto(sampleMenu(), 0, 0, P2)));
    expect(keepStoredItemPhotos(replaced, parsedMenu(replaced), stored).sections[0].items[0].imageMediaId).toBe(P2);
  });
  it("boards without stored item photos are returned unchanged", () => {
    const incoming = android();
    const parsed = parsedMenu(incoming);
    expect(keepStoredItemPhotos(incoming, parsed, sampleMenu())).toEqual(parsed);
  });
});

describe("item photos in every menu style", () => {
  it("original layouts: boards without item photos (or with them hidden) draw exactly as before", () => {
    for (const t of LAYOUTS) {
      const base = sampleLayout(t);
      const hidden = { ...withLayoutPhoto(base), photoStyle: "text" as const };
      expect(layoutSvg(hidden, { itemImages: { [P1]: href } }), t).toBe(layoutSvg(base));
      // A board that never had photos ignores the photo map entirely.
      expect(layoutSvg(base, { itemImages: { [P1]: href } }), t).toBe(layoutSvg(base));
    }
  });

  it("original layouts: an item photo is drawn as a cropped thumbnail, names in its section stay aligned, nothing is lost", () => {
    for (const t of LAYOUTS) {
      const doc = withLayoutPhoto(sampleLayout(t));
      const svg = layoutSvg(doc, { itemImages: { [P1]: href } });
      expect(svg, t).toMatch(new RegExp(`<image href="${href.replace(/[+/]/g, "\\$&")}"[^>]*preserveAspectRatio="xMidYMid slice" clip-path="url\\(#ip0\\)"`));
      const shown = fixedColumns(t) ? doc.sections.slice(0, fixedColumns(t)!) : doc.sections;
      for (const s of shown) for (const it of s.items) expect(svg, `${t} ${it.name}`).toContain(`>${it.name.replace(/&/g, "&amp;")}</text>`);
      const first = doc.sections[0].items;
      const xs = first.map((it) => textX(svg, it.name));
      expect(new Set(xs).size, `${t} aligned`).toBe(1);
      expect(layoutReport(doc, { itemImages: { [P1]: href } }).hiddenItems).toBe(0);
    }
  });

  it("original layouts: a photo that can't be loaded draws a quiet tile in the browser and on the TV alike", () => {
    const svg = layoutSvg(withLayoutPhoto(sampleLayout("two-column")), {});
    expect(svg).toContain('<clipPath id="ip0">');
    expect(svg).not.toContain("<image ");
  });

  it("classic boards: unchanged without photos or with photos hidden; thumbnails when shown", () => {
    for (const theme of MENU_TEMPLATES.map((m) => m.id)) {
      const base = sampleMenu();
      expect(menuSvg(theme, { ...withClassicPhoto(base), itemPhotos: false }, { itemImages: { [P1]: href } })).toBe(menuSvg(theme, base));
      const svg = menuSvg(theme, withClassicPhoto(base), { itemImages: { [P1]: href } });
      expect(svg).toContain(`<image href="${href}"`);
      expect(svg).toContain('preserveAspectRatio="xMidYMid slice" clip-path="url(#ip0)"');
      const xs = base.sections[0].items.map((it) => textX(svg, it.name));
      expect(new Set(xs).size, `${theme} aligned`).toBe(1);
      for (const s of base.sections) for (const it of s.items) expect(svg).toContain(`>${it.name}</text>`);
    }
  });

  it("every one of the 22 templates still shows an owner photo", () => {
    for (const d of MENU_DESIGNS) expect(layoutSvg(withLayoutPhoto(designDocument(d)), { itemImages: { [P1]: href } }), d.id).toContain(href);
  });

  it("the server's 1920×1080 PNG draws item photos on original layouts and classic boards", async () => {
    const photo = await prepareBoardPhoto(readFileSync("assets/menu-templates/salad.jpg"), "image/jpeg", 600);
    for (const t of ["two-column", "split-50"] as LayoutTemplate[]) {
      const doc = withLayoutPhoto(sampleLayout(t));
      const a = renderLayoutPng(doc, null, { itemImages: { [P1]: photo } });
      const b = renderLayoutPng({ ...doc, photoStyle: "text" }, null, { itemImages: { [P1]: photo } });
      expect(a.readUInt32BE(16)).toBe(1920);
      expect(a.readUInt32BE(20)).toBe(1080);
      expect(sha(a)).not.toBe(sha(b));
      expect(sha(b)).toBe(sha(renderLayoutPng(sampleLayout(t))));
    }
    const uri = `data:${photo.mime};base64,${photo.bytes.toString("base64")}`;
    const c1 = renderMenuPng("fresh", withClassicPhoto(sampleMenu()), { itemImages: { [P1]: uri } });
    const c0 = renderMenuPng("fresh", sampleMenu());
    expect(Buffer.from(c1).readUInt32BE(16)).toBe(1920);
    expect(sha(c1)).not.toBe(sha(c0));
  }, 60_000);

  it("photo display applies to original layouts too and survives save and reopen", () => {
    const doc = { ...withLayoutPhoto(sampleLayout("menu-banner")), photoStyle: "text" as const };
    const parsed = parseLayout(JSON.parse(JSON.stringify(doc)));
    expect(parsed.ok && parsed.value.photoStyle).toBe("text");
    expect(parsed.ok && parsed.value.sections[0].items[0].imageMediaId).toBe(P1);
  });
});

describe("switching between templates and original layouts", () => {
  it("template → original layout → template keeps content, colours, fonts and every item photo", () => {
    const start = withLayoutPhoto(withLayoutPhoto(designDocument(designById("modern-restaurant")!)), 1, 1, P2);
    for (const t of LAYOUTS) {
      const layout = switchToLayout(start, t);
      expect(layout.design).toBeUndefined();
      expect(layout.variant).toBeUndefined();
      expect(layout.stockPhoto).toBeUndefined();
      const parsed = parseLayout(JSON.parse(JSON.stringify(layout)));
      expect(parsed.ok, t).toBe(true);
      expect(layout.sections.flatMap((s) => s.items.map((i) => i.imageMediaId)).filter(Boolean)).toEqual([P1, P2]);
      expect(layout.title).toBe(start.title);
      const back = switchDesign(layout, designById("cafe-favorites")!);
      expect(back.sections.flatMap((s) => s.items.map((i) => i.imageMediaId)).filter(Boolean)).toEqual([P1, P2]);
    }
  });

  it("column layouts say which sections they can't show, offer to merge them, and never publish them silently", () => {
    const doc = switchToLayout(designDocument(designById("diner-classics")!), "two-column");
    const report = layoutReport(doc);
    expect(doc.sections.length).toBeGreaterThan(2);
    expect(report.hiddenSections).toBe(doc.sections.length - 2);
    expect(report.hiddenItems).toBeGreaterThan(0);
    const merged = mergeExtraSections({ ...doc, sections: [doc.sections[0], { ...doc.sections[1], items: doc.sections[1].items.slice(0, 2) }, { name: "Extra", items: [{ name: "Pie", price: "$5", description: "" }] }] });
    expect(merged?.sections.length).toBe(2);
    expect(merged && layoutReport(merged).hiddenItems).toBe(0);
    expect(merged?.sections[1].items.map((i) => i.name)).toContain("Pie");
  });
});

describe("one gallery", () => {
  const all = galleryEntries();
  it("holds the 22 templates, the 7 original layouts and the full-screen classic menu", () => {
    expect(all.filter((e) => e.kind === "design")).toHaveLength(22);
    expect(all.filter((e) => e.kind === "layout").map((e) => e.id)).toEqual(ORIGINAL_LAYOUTS.map((l) => l.id));
    expect(all.filter((e) => e.kind === "classic")).toHaveLength(1);
    expect(all).toHaveLength(30);
  });
  it("filters by business type, style, photos and layout structure; original layouts suit any business", () => {
    const f = { business: "all", style: "all", photos: false, structure: "all" } as const;
    expect(filterGallery(all, f)).toHaveLength(30);
    const cafes = filterGallery(all, { ...f, business: "cafe" });
    expect(cafes.every((e) => e.business === "cafe" || e.business === "any")).toBe(true);
    expect(cafes.some((e) => e.kind === "layout")).toBe(true);
    expect(filterGallery(all, { ...f, photos: true }).every((e) => e.photos)).toBe(true);
    expect(filterGallery(all, { ...f, structure: "cards" }).map((e) => e.id).sort()).toEqual(["cafe-favorites", "featured-dishes", "photo-menu-grid"]);
    expect(filterGallery(all, { ...f, structure: "columns" }).some((e) => e.id === "two-column")).toBe(true);
  });
  it("every original layout starts as a valid board seeded from the Brand Kit, with its own sample content", () => {
    for (const l of ORIGINAL_LAYOUTS) {
      const doc = newLayoutDocument(l.template, { primaryColor: "#c8102e", accentColor: "#ffd34d", displayName: "Demo Café" });
      expect(parseLayout(doc).ok, l.id).toBe(true);
      expect(doc.title).toBe("Demo Café");
      expect(doc.primaryColor).toBe("#c8102e");
    }
  });
  it("names and blurbs exist in English and Spanish for every entry and filter", () => {
    for (const e of all.filter((x) => x.kind !== "design")) {
      for (const k of [`lo.${e.id}.name`, `lo.${e.id}.blurb`] as const) { expect(en[k as keyof typeof en], k).toBeTruthy(); expect(es[k as keyof typeof es], k).toBeTruthy(); }
    }
    for (const k of ["tpl.structure.single", "tpl.structure.columns", "tpl.structure.media", "tpl.structure.cards", "tpl.business.any", "tpl.originalTag", "tpl.unifiedTitle", "tpl.advancedOptions", "tpl.classicSave", "tpl.classicNote", "tpl.columnsHidden", "tpl.mergeColumns"] as const) {
      expect(en[k], k).toBeTruthy();
      expect(es[k], k).toBeTruthy();
      expect(es[k], k).not.toBe(en[k]);
    }
  });
});

describe("rollout flag: UNIFIED_MENU_EDITOR", () => {
  const dev = { email: "dev@example.com", accountId: "a1", developer: true };
  const owner = { email: "owner@example.com", accountId: "a2", developer: false };
  const on = (env: Record<string, string | undefined>, who: typeof dev) =>
    unifiedEditorEnabledFor(who, menuTemplatesSetting(env), unifiedEditorSetting(env), true);
  it("unset means developers only; a list adds accounts; all means everyone; off stops it", () => {
    expect(on({}, dev)).toBe(true);
    expect(on({}, owner)).toBe(false);
    expect(on({ UNIFIED_MENU_EDITOR: "owner@example.com" , MENU_TEMPLATES: "owner@example.com" }, owner)).toBe(true);
    expect(on({ UNIFIED_MENU_EDITOR: "all", MENU_TEMPLATES: "all" }, owner)).toBe(true);
    expect(on({ UNIFIED_MENU_EDITOR: "off" }, dev)).toBe(false);
  });
  it("needs the template gallery too, and Layout Studio", () => {
    expect(on({ MENU_TEMPLATES: "off" }, dev)).toBe(false);
    expect(unifiedEditorEnabledFor(dev, menuTemplatesSetting({}), unifiedEditorSetting({}), false)).toBe(false);
    // Templates on for everyone does not turn the unified designer on for customers.
    expect(on({ MENU_TEMPLATES: "all" }, owner)).toBe(false);
  });
});
