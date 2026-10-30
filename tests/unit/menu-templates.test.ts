import { describe, expect, it } from "vitest";
import { parsePromoContent, parsePromoDates, samplePromo } from "@/lib/promo-templates";
import { promoSvg, wrap } from "@/lib/server/promo-render";
import { MENU_LIMITS, normalizeHex, parseMenuContent, sampleMenu } from "@/lib/menu-templates";
import { columnsFor, contrast, fit, menuSvg, renderMenuPng, themeFor } from "@/lib/server/menu-render";

describe("menu content", () => {
  it("accepts the sample and drops blank rows", () => {
    const m = sampleMenu();
    m.sections[0].items.push({ name: "  ", price: "", description: "" });
    const r = parseMenuContent(m);
    expect(r.ok && r.value.sections[0].items).toHaveLength(3);
  });
  it("rejects too many items, long text, and empty menus", () => {
    const many = { title: "x", sections: [0, 1, 2, 3].map(() => ({ name: "s", items: Array.from({ length: 7 }, () => ({ name: "a", price: "1" })) })) };
    expect(parseMenuContent(many).ok).toBe(false);
    expect(parseMenuContent({ title: "x".repeat(MENU_LIMITS.title + 1), sections: [] }).ok).toBe(false);
    expect(parseMenuContent({ title: "", sections: [] }).ok).toBe(false);
    expect(parseMenuContent(null).ok).toBe(false);
  });
});

describe("menu render", () => {
  it("escapes text and shortens long names", () => {
    const svg = menuSvg("classic", { title: "<b>&", subtitle: "", footer: "", sections: [{ name: "", items: [{ name: "x".repeat(40), price: "$1", description: "" }] }] });
    expect(svg).toContain("&lt;b&gt;&amp;");
    expect(fit("a".repeat(200), 40, 300)).toMatch(/…$/);
  });
  it("balances sections into columns", () => {
    expect(columnsFor(sampleMenu().sections)).toHaveLength(2);
    expect(columnsFor([{ name: "", items: [{ name: "a", price: "", description: "" }] }])).toHaveLength(1);
  });
  it("renders a 1920x1080 PNG for every template", () => {
    for (const t of ["classic", "fresh", "bold"] as const) {
      const png = renderMenuPng(t, sampleMenu());
      expect([...png.slice(1, 4)].map((c) => String.fromCharCode(c)).join("")).toBe("PNG");
      const view = new DataView(png.buffer, png.byteOffset);
      expect([view.getUint32(16), view.getUint32(20)]).toEqual([1920, 1080]);
    }
  });
});

describe("brand", () => {
  it("normalizes colours", () => {
    expect(normalizeHex("#ABC")).toBe("#aabbcc");
    expect(normalizeHex("#C8102E")).toBe("#c8102e");
    expect(normalizeHex("red")).toBeNull();
    expect(normalizeHex("#12345")).toBeNull();
  });
  it("validates photo and useBrand", () => {
    const ok = parseMenuContent({ ...sampleMenu(), photoMediaId: "6f1c1a9e-2b1f-4a8c-9f0e-1d2c3b4a5e6f", useBrand: false });
    expect(ok.ok && ok.value).toMatchObject({ useBrand: false });
    expect(parseMenuContent({ ...sampleMenu(), photoMediaId: "nope" }).ok).toBe(false);
  });
  it("keeps text readable on any brand colour", () => {
    for (const primary of ["#ffe600", "#000000", "#c8102e", "#ffffff", "#00ff00"]) {
      for (const t of ["classic", "fresh", "bold"] as const) {
        const theme = themeFor(t, { primaryColor: primary, accentColor: "#ffffff" });
        expect(contrast(theme.text, theme.bg)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(theme.title, theme.band ?? theme.bg)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(theme.price, theme.priceBg ?? theme.bg)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(theme.section, theme.bg)).toBeGreaterThanOrEqual(3);
      }
    }
  });
  it("adds the logo and photo only when given", () => {
    const plain = menuSvg("bold", sampleMenu(), {});
    expect(plain).not.toContain("<image");
    const art = menuSvg("bold", sampleMenu(), { logo: "data:image/png;base64,AA", photo: "data:image/png;base64,BB" });
    expect(art.match(/<image/g)).toHaveLength(2);
    expect(menuSvg("bold", { ...sampleMenu(), useBrand: false }, { brand: { primaryColor: "#c8102e", accentColor: "#fff" } })).not.toContain("#c8102e");
  });
});

describe("promos", () => {
  it("validates content and dates", () => {
    expect(parsePromoContent(samplePromo()).ok).toBe(true);
    expect(parsePromoContent({ ...samplePromo(), headline: " " }).ok).toBe(false);
    expect(parsePromoContent({ ...samplePromo(), price: "x".repeat(13) }).ok).toBe(false);
    expect(parsePromoDates("2026-11-01", "2026-11-30")).toEqual({ ok: true, startsOn: "2026-11-01", endsOn: "2026-11-30" });
    expect(parsePromoDates("", null)).toEqual({ ok: true, startsOn: null, endsOn: null });
    expect(parsePromoDates("2026-02-30", null).ok).toBe(false);
    expect(parsePromoDates("2026-12-02", "2026-12-01").ok).toBe(false);
  });
  it("wraps long headlines to two lines and renders every template", () => {
    expect(wrap("A very long headline that goes on and on", 150, 900, 800).length).toBe(2);
    for (const t of ["happy", "deal", "special"] as const) {
      const svg = promoSvg(t, samplePromo(t), { brand: { primaryColor: "#ffe600", accentColor: "#111111" } });
      expect(svg).toContain(samplePromo(t).headline.split(" ")[0]);
      expect(svg).not.toContain("<image");
    }
  });
});
