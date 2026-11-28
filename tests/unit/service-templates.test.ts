import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MENU_DESIGNS, designById, designDocument } from "@/lib/menu-designs";
import { designColors, designSvgWithReport } from "@/lib/menu-design-svg";
import { boardFit } from "@/lib/board-fit";
import { customizationSpec } from "@/lib/board-custom";
import { BOARD_FONTS, CLASSIC_FONT_IDS, FONT_FILES, fontFaceCss } from "@/lib/board-fonts";
import { parseMenuContent, sampleMenu } from "@/lib/menu-templates";
import { parseLayout, type LayoutDocument } from "@/lib/layout-studio";
import { renderLayoutPng } from "@/lib/server/layout-render";
import { en } from "@/lib/i18n/en";
import { es } from "@/lib/i18n/es";

/**
 * The approved premium service templates (salons, retail, fitness): Luxury Barbershop (Noir & Co.), Boutique
 * Promotion and Product Spotlight (Linden), Modern Gym (Forge). Every colour style, both screen shapes.
 */
const IDS = ["luxury-barbershop", "boutique-promotion", "product-spotlight", "modern-gym"] as const;
const designs = IDS.map((id) => designById(id)!);
const portrait = (doc: LayoutDocument): LayoutDocument => ({ ...doc, orientation: "portrait" });
const sha = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");
const pngSize = (png: Buffer) => [png.readUInt32BE(16), png.readUInt32BE(20)];
const sizes = (svg: string) => [...svg.matchAll(/font-size="([\d.]+)"/g)].map((m) => Number(m[1]));

describe("service templates: library", () => {
  it("adds the four approved templates after the original 22, with their approved colour styles", () => {
    expect(MENU_DESIGNS.slice(0, 22).every((d) => !["salon", "retail", "fitness"].includes(d.business))).toBe(true);
    expect(designs.map((d) => [d.id, d.composition, d.business, d.look.head])).toEqual([
      ["luxury-barbershop", "showcaseLeft", "salon", "cormorant-garamond"],
      ["boutique-promotion", "editorial", "retail", "playfair-display"],
      ["product-spotlight", "spotlight", "retail", "playfair-display"],
      ["modern-gym", "timetable", "fitness", "bebas-neue"],
    ]);
    for (const d of designs) {
      expect(d.variants).toHaveLength(3);
      expect(d.stock && existsSync(`assets/menu-templates/${d.stock}.jpg`) && existsSync(`public/menu-templates/${d.stock}.jpg`), d.id).toBe(true);
      for (const key of ["name", "blurb"] as const) { expect(d[key].en.length, d.id).toBeGreaterThan(5); expect(d[key].es.length, d.id).toBeGreaterThan(5); }
      for (const v of d.variants) expect(v.name.es.length, `${d.id}/${v.id}`).toBeGreaterThan(2);
    }
    for (const k of ["tpl.business.salon", "tpl.business.retail", "tpl.business.fitness", "tpl.time", "tpl.itemTime", "tpl.timeNote", "tpl.spotlightNote"] as const) {
      expect(en[k], k).toBeTruthy(); expect(es[k], k).toBeTruthy(); expect(es[k]).not.toBe(en[k]);
    }
  });

  it("every template and colour style is a valid, publishable board in both shapes (nothing dropped or shortened)", () => {
    for (const d of designs) for (const v of d.variants) for (const shape of ["landscape", "portrait"] as const) {
      const base = designDocument(d, v.id);
      const doc = shape === "portrait" ? portrait(base) : base;
      expect(parseLayout(doc).ok, `${d.id}/${v.id}/${shape}`).toBe(true);
      const { report } = designSvgWithReport(doc);
      expect(report.dropped, `${d.id}/${v.id}/${shape}`).toBe(0);
      expect(Object.values(report.clips ?? {}).every((n) => n === 0), `${d.id}/${v.id}/${shape} ${JSON.stringify(report.clips)}`).toBe(true);
      expect(boardFit(doc).canPublish, `${d.id}/${v.id}/${shape}`).toBe(true);
    }
  });

  it("server PNGs are 1920×1080 and 1080×1920 (portrait is its own composition, not a stretched landscape)", () => {
    for (const d of designs) {
      const land = renderLayoutPng(designDocument(d));
      const tall = renderLayoutPng(portrait(designDocument(d)));
      expect(pngSize(land), d.id).toEqual([1920, 1080]);
      expect(pngSize(tall), d.id).toEqual([1080, 1920]);
      const landSvg = designSvgWithReport(designDocument(d)).svg;
      const tallSvg = designSvgWithReport(portrait(designDocument(d))).svg;
      expect(tallSvg).toContain('viewBox="0 0 1080 1920"');
      expect(tallSvg).not.toMatch(/scale\(|matrix\(/); // drawn for the tall canvas, never transformed
      expect(tallSvg).not.toBe(landSvg);
    }
  });
});

describe("service templates: typography and readability", () => {
  it("ships Cormorant Garamond and Playfair Display (with italics) for board previews and the TV", () => {
    for (const id of ["cormorant-garamond", "playfair-display"]) {
      const font = BOARD_FONTS.find((f) => f.id === id)!;
      expect(font.files.some((f) => f.italic)).toBe(true);
      for (const face of font.files) { expect(FONT_FILES[face.name]).toBe(face.file); expect(existsSync(`assets/fonts/${face.file}`)).toBe(true); }
    }
    const css = fontFaceCss();
    expect(css).toMatch(/font-family: "Cormorant Garamond"; src: url\("\/layout-studio\/media\/font\/cormorant-garamond-italic"\) format\("truetype"\); font-weight: 500; font-style: italic;/);
    expect(css).toMatch(/font-family: "Playfair Display"; src: url\("\/layout-studio\/media\/font\/playfair-display-italic"\) format\("truetype"\); font-weight: 400; font-style: italic;/);
    // Barbershop's signature service and Linden's second headline line are drawn in italics.
    expect(designSvgWithReport(designDocument(designs[0])).svg).toMatch(/font-family="Cormorant Garamond"[^>]*font-style="italic"[^>]*>The hot towel shave/);
    expect(designSvgWithReport(designDocument(designs[1])).svg).toMatch(/font-family="Playfair Display"[^>]*font-style="italic"[^>]*>Edit</);
    expect(designSvgWithReport(designDocument(designs[2])).svg).toMatch(/font-style="italic"[^>]*>bottled\.</);
  });

  it("text meets the contrast floors in every colour style (body 4.5:1, headings 3:1, text on panels 4.5:1)", () => {
    for (const d of designs) for (const v of d.variants) {
      const c = designColors(designDocument(d, v.id), d);
      for (const check of c.checks) expect(check.ratio, `${d.id}/${v.id}/${check.key}`).toBeGreaterThanOrEqual(check.key === "headings" ? 3 : 4.5);
    }
  });

  it("nothing on the sample boards is smaller than 20 px at 1920×1080 (TV distance)", () => {
    for (const d of designs) for (const shape of ["landscape", "portrait"] as const) {
      const doc = shape === "portrait" ? portrait(designDocument(d)) : designDocument(d);
      expect(Math.min(...sizes(designSvgWithReport(doc).svg)), `${d.id}/${shape}`).toBeGreaterThanOrEqual(20);
    }
  });
});

describe("service templates: content rules", () => {
  it("Modern Gym leads each row with the time from the price field, in the accent colour", () => {
    const doc = designDocument(designs[3]);
    const svg = designSvgWithReport(doc).svg;
    const accent = designColors(doc, designs[3]).accent;
    for (const item of doc.sections[0].items) {
      const time = svg.indexOf(`>${item.price}</text>`);
      const name = svg.indexOf(`>${item.name.toUpperCase()}</text>`);
      expect(time, item.price).toBeGreaterThan(0);
      expect(time, item.name).toBeLessThan(name);
    }
    expect(svg).toMatch(new RegExp(`fill="${accent}"[^>]*>6:00<`));
  });

  it("Product Spotlight features the first item (with its price) and lists the rest as highlights", () => {
    const doc = designDocument(designs[2]);
    const svg = designSvgWithReport(doc).svg;
    expect(svg).toContain(">Amber Facial Oil<");
    expect(svg).toMatch(/font-family="Playfair Display"[^>]*>\$64</);
    expect(svg).toContain(">WHY IT WORKS<");
    for (const n of ["Fragrance-free", "Fast absorbing", "Refillable glass", "Made in small batches"]) expect(svg).toContain(`>${n}<`);
  });

  it("long content is fitted, then reported (publish refused) instead of being cut silently, in both shapes", () => {
    for (const d of designs) for (const shape of ["landscape", "portrait"] as const) {
      const base = designDocument(d);
      const dense = { ...base, sections: [1, 2, 3, 4].map((s) => ({ name: `Section ${s}`, items: Array.from({ length: 6 }, (_, i) => ({ name: `Service ${s}-${i + 1} with a longer name`, price: `$${i + 20}`, description: "A description that runs fairly long" })) })) };
      const doc = shape === "portrait" ? portrait(dense) : dense;
      const fit = boardFit(doc);
      if (fit.droppedItems > 0) expect(fit.canPublish, `${d.id}/${shape}`).toBe(false);
      else expect(fit.canPublish, `${d.id}/${shape}`).toBe(true);
    }
  });

  it("owner customization: photo-size bounds for the photo layouts, a fixed product column on Spotlight", () => {
    expect(customizationSpec(designDocument(designs[0])).media).toMatchObject({ axis: "width", min: 0.3, max: 0.5 });
    expect(customizationSpec(designDocument(designs[1])).media).toMatchObject({ axis: "width", min: 0.34, max: 0.5 });
    expect(customizationSpec(designDocument(designs[2])).media).toBeNull();
    expect(customizationSpec(designDocument(designs[3])).media).toMatchObject({ axis: "width", min: 0.45, max: 0.65 });
    const custom = { ...designDocument(designs[0]), custom: { v: 1 as const, mediaSize: 0.45, textScale: 1.2 } } as LayoutDocument;
    const report = designSvgWithReport(custom).report;
    expect(report.dropped).toBe(0);
    expect(report.regions?.some((r) => r.target.kind === "featuredMedia" && r.box.w === Math.round(1920 * 0.45))).toBe(true);
  });
});

describe("service templates: compatibility boundaries", () => {
  it("classic menus (Android contract) and Brand Kit keep the six classic faces; template boards accept the new ones", () => {
    expect(CLASSIC_FONT_IDS).not.toContain("cormorant-garamond");
    const classic = parseMenuContent({ ...sampleMenu(), headingFont: "cormorant-garamond" });
    expect(classic.ok).toBe(false);
    expect(parseLayout({ ...designDocument(designs[1]), font: "cormorant-garamond", bodyFont: "playfair-display" }).ok).toBe(true);
  });

  it("the approved boards are pinned: any change to their drawing shows up here for review", () => {
    const path = "tests/fixtures/service-svg-baseline.json";
    const now: Record<string, string> = {};
    for (const d of designs) for (const v of d.variants) for (const shape of ["landscape", "portrait"] as const) {
      const doc = shape === "portrait" ? portrait(designDocument(d, v.id)) : designDocument(d, v.id);
      now[`${d.id}/${v.id}/${shape}`] = sha(designSvgWithReport(doc).svg);
    }
    if (process.env.UPDATE_SERVICE_BASELINE === "1") { writeFileSync(path, JSON.stringify(now, null, 1) + "\n"); return; }
    expect(now).toEqual(JSON.parse(readFileSync(path, "utf8")));
  });
});
