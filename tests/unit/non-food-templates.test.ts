import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MENU_DESIGNS, STOCK_PHOTOS, designById, designDocument, switchDesign, type DesignBusiness, type DesignTerms } from "@/lib/menu-designs";
import { designSvg } from "@/lib/menu-design-svg";
import { parseLayout, type LayoutDocument } from "@/lib/layout-studio";
import { boardFit } from "@/lib/board-fit";
import { renderLayoutPng } from "@/lib/server/layout-render";
import { galleryEntries, filterGallery } from "@/lib/menu-designer";
import { en } from "@/lib/i18n/en";
import { es } from "@/lib/i18n/es";
import baseline from "../fixtures/non-food-svg-baseline.json";

/** The 16 non-food templates (salons, retail, gyms, offices, pet services), in gallery order. */
const NON_FOOD: Record<Exclude<DesignBusiness, "restaurant" | "cafe" | "fast" | "bar" | "sweets">, string[]> = {
  salon: ["salon-maison", "barber-blade", "beauty-glow", "nails-polished"],
  retail: ["retail-sale", "retail-offers", "retail-boutique"],
  fitness: ["fitness-timetable", "fitness-join", "fitness-motivate"],
  office: ["office-welcome", "office-rooms", "office-kudos"],
  pets: ["pets-groom", "pets-treats", "pets-care"],
};
const IDS = Object.values(NON_FOOD).flat();
const designs = IDS.map((id) => designById(id)!);
const portrait = (doc: LayoutDocument): LayoutDocument => ({ ...doc, orientation: "portrait" });
const sha = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);

describe("non-food templates", () => {
  it("adds 16 templates after the 22 food templates, 3–4 per category, with a use case in English and Spanish", () => {
    expect(designs.every(Boolean)).toBe(true);
    expect(MENU_DESIGNS.slice(22).map((d) => d.id)).toEqual(IDS);
    for (const [business, ids] of Object.entries(NON_FOOD)) {
      expect(MENU_DESIGNS.filter((d) => d.business === business).map((d) => d.id)).toEqual(ids);
      expect(ids.length).toBeGreaterThanOrEqual(3);
    }
    for (const d of designs) {
      expect(d.useCase?.en, d.id).toBeTruthy();
      expect(d.useCase?.es, d.id).toBeTruthy();
      expect(d.name.es && d.blurb.es && d.blurb.es !== d.blurb.en, d.id).toBeTruthy();
      expect(d.terms, d.id).toBeTruthy();
      for (const v of d.variants) expect(v.name.es, `${d.id}/${v.id}`).toBeTruthy();
      expect(d.variants).toHaveLength(3);
    }
    // Food templates keep the menu words: no terms, no use-case change in behaviour.
    expect(MENU_DESIGNS.slice(0, 22).every((d) => d.terms === undefined)).toBe(true);
  });

  it("every colour style is publishable in 16:9 and 9:16, with nothing dropped or shortened", () => {
    for (const d of designs) for (const v of d.variants) {
      for (const doc of [designDocument(d, v.id), portrait(designDocument(d, v.id))]) {
        const label = `${d.id}/${v.id}/${doc.orientation ?? "landscape"}`;
        expect(parseLayout(doc).ok, label).toBe(true);
        const fit = boardFit(doc);
        expect(fit.canPublish, label).toBe(true);
        expect(fit.droppedItems, label).toBe(0);
        expect(designSvg(doc), label).not.toContain("…");
      }
    }
  });

  it("renders the TV image at 1920×1080 and 1080×1920, with the bundled photo where the design has one", () => {
    for (const d of designs) {
      const land = renderLayoutPng(designDocument(d));
      expect([land.readUInt32BE(16), land.readUInt32BE(20)], d.id).toEqual([1920, 1080]);
      const tall = renderLayoutPng(portrait(designDocument(d)));
      expect([tall.readUInt32BE(16), tall.readUInt32BE(20)], d.id).toEqual([1080, 1920]);
      if (d.stock) expect(land.length, d.id).toBeGreaterThan(300_000);
    }
  }, 120_000);

  it("uses only the two licensed photos it adds, bundled for the browser and the server", () => {
    const stocks = new Set(designs.map((d) => d.stock).filter(Boolean));
    expect([...stocks].sort()).toEqual(["beagle", "shoppingbags"]);
    for (const id of stocks) {
      expect(STOCK_PHOTOS).toContain(id);
      expect(readFileSync(`assets/menu-templates/${id}.jpg`).equals(readFileSync(`public/menu-templates/${id}.jpg`))).toBe(true);
    }
    expect(readFileSync("docs/MENU_TEMPLATES.md", "utf8")).toMatch(/shoppingbags.*1607082348824-0a96f2a4b9da/);
    expect(readFileSync("docs/MENU_TEMPLATES.md", "utf8")).toMatch(/beagle.*1543466835-00a7907e9de1/);
  });

  it("prices are optional: a board with every price cleared still saves, fits and draws no empty tags or leaders", () => {
    for (const d of designs) {
      const doc = designDocument(d);
      const bare: LayoutDocument = { ...doc, sections: doc.sections.map((s) => ({ ...s, items: s.items.map((i) => ({ ...i, price: "" })) })) };
      expect(parseLayout(bare).ok, d.id).toBe(true);
      expect(boardFit(bare).canPublish, d.id).toBe(true);
      const svg = designSvg(bare);
      for (const s of doc.sections) for (const i of s.items) if (i.price) expect(svg, `${d.id}: ${i.price}`).not.toContain(`>${i.price.replace(/&/g, "&amp;")}<`);
    }
  });

  it("switching between a food and a non-food template keeps every word and price", () => {
    const start = designDocument(designById("modern-restaurant")!);
    for (const d of designs) {
      const there = switchDesign(start, d);
      expect(there.sections).toEqual(start.sections);
      const back = switchDesign(there, designById("modern-restaurant")!);
      expect(back.sections).toEqual(start.sections);
      expect(back.title).toBe(start.title);
    }
  });

  it("shows in the gallery under its own business filter, in English and Spanish", () => {
    const all = galleryEntries();
    const f = { business: "all", style: "all", photos: false, structure: "all" } as const;
    for (const [business, ids] of Object.entries(NON_FOOD)) {
      const hits = filterGallery(all, { ...f, business: business as DesignBusiness }).filter((e) => e.kind === "design").map((e) => e.id);
      expect(hits).toEqual(ids);
      const key = `tpl.business.${business}` as keyof typeof en;
      expect(en[key]).toBeTruthy();
      expect(es[key]).toBeTruthy();
      expect(es[key]).not.toBe(en[key]);
    }
    // Restaurant filters are unchanged.
    expect(filterGallery(all, { ...f, business: "restaurant" }).some((e) => IDS.includes(e.id))).toBe(false);
  });

  it("has editor words for every term set, in English and Spanish", () => {
    const sets: DesignTerms[] = ["services", "products", "classes", "schedule", "board"];
    for (const set of sets) for (const k of ["step", "title", "item", "itemName", "addItem"]) {
      const key = `tpl.terms.${set}.${k}` as keyof typeof en;
      expect(en[key], key).toBeTruthy();
      expect(es[key], key).toBeTruthy();
      expect(es[key], key).not.toBe(en[key]);
    }
    for (const key of ["tpl.priceOptional", "tpl.time", "tpl.itemTime", "tpl.detail", "tpl.itemDetail", "tpl.photoTipAny", "tpl.itemPhotosWhereAny"] as const) {
      expect(en[key], key).toBeTruthy();
      expect(es[key], key).toBeTruthy();
    }
    expect(en["tpl.photoTipAny"]).not.toMatch(/food/i);
    expect(en["tpl.itemPhotosWhereAny"]).not.toMatch(/food/i);
  });

  it("draws exactly the approved boards (pinned SVGs for every colour style and orientation)", () => {
    const now: Record<string, string> = {};
    for (const d of designs) for (const v of d.variants) {
      now[`${d.id}/${v.id}`] = sha(designSvg(designDocument(d, v.id)));
      now[`${d.id}/${v.id}/portrait`] = sha(designSvg(portrait(designDocument(d, v.id))));
    }
    expect(now).toEqual(baseline);
  });
});
