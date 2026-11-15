import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { en } from "@/lib/i18n/en";
import { es } from "@/lib/i18n/es";
import { PROMO_LIMITS, PROMO_TEMPLATES, parsePromoContent, placeholderFields, samplePromo, samplePromoFor } from "@/lib/promo-templates";
import { layoutSvg, layoutSvgWithClips, sampleLayout } from "@/lib/layout-studio";

const ES_RULES = /\b(tú|tu cuenta|tienes|puedes|quieres|elige|escribe|ingresa)\b|televisor|prueba gratuita|desconectad|programación|Inténtelo|Ingrese/i;
const src = (p: string) => readFileSync(p, "utf8");
const NEW_KEYS = ["ss.noun.locations", "ss.noun.schedules", "cnav.tab.media", "cnav.tab.promotions", "cnav.tab.playlists", "cnav.tab.presentations", "mif.lengths", "ls.clippedNames", "billing.manage", "billing.opening", "billing.title", "billing.eyebrow"] as const;

describe("R11 follow-ups: dictionaries", () => {
  it("adds every new key in both languages, Spanish in usted", () => {
    for (const k of NEW_KEYS) {
      expect(en[k], k).toBeTruthy();
      expect(es[k], k).toBeTruthy();
      expect(es[k], k).not.toMatch(ES_RULES);
    }
  });
  it("keeps English tab labels identical to the hub titles and shortens the Spanish playlists tab", () => {
    for (const id of ["media", "promotions", "playlists", "presentations"] as const) expect(en[`cnav.tab.${id}`]).toBe(en[`hub.${id}.title`]);
    expect(es["cnav.tab.playlists"]).toBe("Listas");
    expect(es["fu.none"].length).toBeLessThan(24);
    expect(es["pl.namePh"].length).toBeLessThan(30);
  });
  it("uses 'último contacto' and never 'tuvo contacto'", () => {
    expect(Object.values(es).join("\n")).not.toMatch(/tuvo contacto/i);
    expect(es["tv.onlineHint"]).toMatch(/último contacto/);
  });
});

describe("R11 follow-ups: Spanish promo samples (creation only)", () => {
  it("leaves PROMO_TEMPLATES and the English samples exactly as before", () => {
    expect(PROMO_TEMPLATES.map((t) => t.id)).toEqual(["happy", "deal", "special"]);
    expect(samplePromo("happy")).toEqual({ tag: "Happy hour", headline: "[Your drink deal]", subheadline: "[What's included]", price: "[$0]", details: "[Which days, where]", footer: "[Hours]", useBrand: true });
    for (const t of PROMO_TEMPLATES) {
      expect(samplePromoFor(t.id, "en")).toEqual(samplePromo(t.id));
      expect(samplePromoFor(t.id)).toEqual(samplePromo(t.id));
    }
  });
  it("seeds bracketed Spanish placeholders that are flagged and valid", () => {
    expect(samplePromoFor("happy", "es").headline).toBe("[Su promoción de bebidas]");
    for (const t of PROMO_TEMPLATES) {
      const c = samplePromoFor(t.id, "es");
      expect(c.headline).toMatch(/^\[.*\]$/);
      expect(placeholderFields(c).length).toBeGreaterThan(0);
      expect(parsePromoContent(c).ok).toBe(true);
      for (const k of ["tag", "headline", "subheadline", "price", "details", "footer"] as const) expect(c[k].length).toBeLessThanOrEqual(PROMO_LIMITS[k]);
      expect(Object.values(c).join(" ")).not.toMatch(ES_RULES);
    }
  });
  it("only new drafts use the locale; saved promos are loaded untouched", () => {
    const s = src("components/promo-slides.tsx");
    expect(s.match(/samplePromoFor\(/g)?.length).toBe(3);
    expect(s).toContain("setDraft({ id: match.id, name: match.name, template: match.template, content: match.content");
    expect(s).toContain("...(draft.id ? {} :");
  });
});

describe("R11 follow-ups: Studio clipped names (MB1-F1)", () => {
  it("returns byte-identical SVG to layoutSvg (TV output unchanged) and reports clipped names", () => {
    const doc = sampleLayout("triple-column");
    const long = "Burrito de carne asada con guacamole XL"; // 39 chars, under the 40 limit
    const withLong = { ...doc, sections: doc.sections.map((s, i) => (i === 0 ? { ...s, items: s.items.map((it, j) => (j === 0 ? { ...it, name: long } : it)) } : s)) };
    for (const d of [doc, withLong]) {
      const r = layoutSvgWithClips(d);
      expect(r.svg).toBe(layoutSvg(d));
    }
    expect(layoutSvgWithClips(withLong).clipped).toContain(long);
    expect(layoutSvg(withLong)).toContain("…");
    // The collector is cleared afterwards: a plain call records nothing and stays deterministic.
    expect(layoutSvg(withLong)).toBe(layoutSvg(withLong));
  });
  it("the TV render still calls plain layoutSvg", () => {
    expect(src("lib/server/layout-render.ts")).toMatch(/layoutSvg\(/);
    expect(src("lib/server/layout-render.ts")).not.toContain("layoutSvgWithClips");
  });
});

describe("R11 follow-ups: wiring", () => {
  it("passes nounKey for locations, screen groups and schedules", () => {
    const s = src("components/schedule-screen.tsx");
    for (const k of ["ss.noun.locations", "groups.limitNoun", "ss.noun.schedules"]) expect(s).toContain(`nounKey="${k}"`);
  });
  it("shows name and price counters and links them to the inputs", () => {
    expect(src("components/menu-item-fields.tsx")).toContain("mif.lengths");
    for (const f of ["components/classic-editor.tsx", "components/layout-studio.tsx"]) expect(src(f).match(/-lengths/g)?.length).toBeGreaterThanOrEqual(3);
  });
  it("Classic card placeholders meet AA (no #8a96ab on white)", () => {
    const s = src("lib/menu-fields.ts");
    expect(s).not.toContain("#8a96ab");
    expect(s).toContain(".product-card input::placeholder");
  });
  it("adds the English-only billing note on Settings and the billing page", () => {
    for (const f of ["app/dashboard/settings/page.tsx", "app/dashboard/billing/page.tsx"]) expect(src(f)).toContain('t("common.englishOnlyNote")');
  });
  it("screen actions have no hard-coded English publish copy left", () => {
    const s = src("components/screen-actions.tsx");
    for (const phrase of ["Publish to this TV", "Change content", "Edit playlist", "Upload media", "Create content"]) expect(s).not.toContain(`>${phrase}<`);
    expect(s).not.toMatch(/"Publish to this TV\?"/);
  });
});
