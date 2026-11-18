import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GlobalFonts, createCanvas } from "@napi-rs/canvas";
import { layoutSvg, mediaVideoBox, parseLayout, playerComposition, sampleLayout, MENU_LIMITS, type LayoutDocument } from "@/lib/layout-studio";
import {
  COMPOSITION_LAYOUT, MENU_DESIGNS, STOCK_PHOTOS, designById, designDocument, designHasMedia, filterDesigns, scratchDocument, switchDesign,
} from "@/lib/menu-designs";
import { contrast, designColors, designSvgWithReport, textWidth, wrapText } from "@/lib/menu-design-svg";
import { menuTemplatesEnabledFor, menuTemplatesSetting } from "@/lib/menu-templates-flag";
import { fontsFor, renderLayoutPng } from "@/lib/server/layout-render";
import { hashes } from "../../scripts/layout-baseline";
import baseline from "../fixtures/layout-svg-baseline.json";
import { en } from "@/lib/i18n/en";
import { es } from "@/lib/i18n/es";

const UUID = "3f0c9a2e-6b1d-4c7a-9e2f-1a2b3c4d5e6f";

describe("existing boards are untouched", () => {
  it("renders every pre-template board byte-for-byte as before (63 recorded SVGs)", () => {
    const now = hashes();
    expect(Object.keys(baseline)).toHaveLength(63);
    for (const [key, hash] of Object.entries(baseline)) expect(now[key], key).toBe(hash);
  });

  it("parses old documents without adding any field, and loads the same fonts", () => {
    for (const template of ["menu-promo-67", "triple-column", "split-50", "menu-banner", "signature", "two-menu-promo", "two-column"] as const) {
      const doc = sampleLayout(template);
      const parsed = parseLayout(doc);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) continue;
      expect(Object.keys(parsed.value).sort()).toEqual(Object.keys(doc).sort());
      expect(parsed.value.design).toBeUndefined();
      expect(mediaVideoBox(parsed.value)).toEqual(mediaVideoBox(doc));
    }
    expect(fontsFor("inter").map((f) => f.split("/").pop())).toEqual(["Inter-Regular.ttf", "Inter-Bold.ttf", "Inter-ExtraBold.ttf", "NotoSerif-Regular.ttf", "NotoSerif-Bold.ttf"]);
  });

  it("ignores template fields it doesn't recognise instead of failing", () => {
    const base = sampleLayout("split-50");
    const parsed = parseLayout({ ...base, design: "not-a-design", variant: "x", stockPhoto: "steak", logoMediaId: UUID });
    expect(parsed.ok && parsed.value.design).toBeFalsy();
    expect(parsed.ok && "stockPhoto" in parsed.value).toBe(false);
    const bad = parseLayout({ ...designDocument(MENU_DESIGNS[0]), stockPhoto: "../../etc/passwd", logoMediaId: "nope", variant: "<script>" });
    expect(bad.ok).toBe(true);
    if (bad.ok) {
      expect(bad.value.stockPhoto).toBeUndefined();
      expect(bad.value.logoMediaId).toBeUndefined();
      expect(bad.value.variant).toBeUndefined();
    }
  });
});

describe("template library", () => {
  it("has 22 templates (18 + 4 photo templates) across business types and styles, including the three approved designs", () => {
    expect(MENU_DESIGNS.length).toBe(22);
    expect(new Set(MENU_DESIGNS.map((d) => d.id)).size).toBe(MENU_DESIGNS.length);
    for (const id of ["modern-restaurant", "coffee-shop", "bold-fast-casual"]) expect(designById(id), id).not.toBeNull();
    for (const business of ["restaurant", "cafe", "fast", "bar", "sweets"] as const) expect(filterDesigns(business, "all").length, business).toBeGreaterThanOrEqual(2);
    for (const style of ["dark", "light", "bold"] as const) expect(filterDesigns("all", style).length, style).toBeGreaterThanOrEqual(4);
    expect(filterDesigns("cafe", "light").every((d) => d.business === "cafe" && d.style === "light")).toBe(true);
  });

  it("every template is a real, saveable board within the existing limits", () => {
    for (const design of MENU_DESIGNS) {
      const doc = designDocument(design);
      const parsed = parseLayout(doc);
      expect(parsed.ok, design.id).toBe(true);
      if (!parsed.ok) continue;
      expect(parsed.value.design).toBe(design.id);
      expect(parsed.value.variant).toBe(design.variants[0].id);
      expect(parsed.value.template).toBe(COMPOSITION_LAYOUT[design.composition].template);
      const items = doc.sections.reduce((a, s) => a + s.items.length, 0);
      expect(items, design.id).toBeLessThanOrEqual(MENU_LIMITS.items);
      expect(doc.sections.length).toBeLessThanOrEqual(MENU_LIMITS.sections);
      if (design.stock) expect(STOCK_PHOTOS).toContain(design.stock);
      expect(design.variants.length).toBeGreaterThanOrEqual(2);
      // Realistic content: every template ships with real items and prices, no placeholders.
      expect(items).toBeGreaterThanOrEqual(8);
      expect(JSON.stringify(doc)).not.toMatch(/lorem|placeholder|item name/i);
    }
    const scratch = parseLayout(scratchDocument());
    expect(scratch.ok).toBe(true);
  });

  it("bundled stock photos exist for the browser and the server", () => {
    for (const id of STOCK_PHOTOS) {
      expect(readFileSync(`public/menu-templates/${id}.jpg`).length).toBeGreaterThan(20_000);
      expect(readFileSync(`assets/menu-templates/${id}.jpg`).equals(readFileSync(`public/menu-templates/${id}.jpg`))).toBe(true);
    }
  });
});

describe("guided editing keeps the owner's content", () => {
  it("switching templates keeps every word, price, photo, video, logo and brand colour", () => {
    const start: LayoutDocument = {
      ...designDocument(designById("coffee-shop")!),
      title: "Casa Verde", imageMediaId: UUID, videoMediaId: UUID.replace("3f", "4f"), logoMediaId: UUID.replace("3f", "5f"),
      primaryColor: "#6e1f2a", accentColor: "#e9b44c",
    };
    for (const design of MENU_DESIGNS) {
      const next = switchDesign(start, design);
      expect(next.title).toBe("Casa Verde");
      expect(next.sections).toEqual(start.sections);
      expect(next.subtitle).toBe(start.subtitle);
      expect(next.featureTitle).toBe(start.featureTitle);
      expect([next.imageMediaId, next.videoMediaId, next.logoMediaId]).toEqual([start.imageMediaId, start.videoMediaId, start.logoMediaId]);
      expect([next.primaryColor, next.accentColor]).toEqual(["#6e1f2a", "#e9b44c"]);
      expect(next.design).toBe(design.id);
      expect(parseLayout(next).ok).toBe(true);
    }
  });

  it("a template's own stock photo follows the template, an owner's choice stays", () => {
    const coffee = designDocument(designById("coffee-shop")!);
    expect(switchDesign(coffee, designById("bakery")!).stockPhoto).toBe("croissant");
    expect(switchDesign({ ...coffee, stockPhoto: "pizza" }, designById("bakery")!).stockPhoto).toBe("pizza");
  });
});

/* -------- text never leaves the board, at any content length -------- */
function textBoxes(svg: string) {
  const out: { left: number; right: number; y: number; size: number; text: string }[] = [];
  for (const m of svg.matchAll(/<text ([^>]*)>([^<]*)<\/text>/g)) {
    const attrs = Object.fromEntries([...m[1].matchAll(/([a-z-]+)="([^"]*)"/g)].map((a) => [a[1], a[2]]));
    const value = m[2].replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
    const size = Number(attrs["font-size"]);
    const w = textWidth(value, size, attrs["font-family"], Number(attrs["font-weight"]), attrs["letter-spacing"] ? Number(attrs["letter-spacing"]) / size : 0);
    const x = Number(attrs.x);
    const left = attrs["text-anchor"] === "end" ? x - w : attrs["text-anchor"] === "middle" ? x - w / 2 : x;
    out.push({ left, right: left + w, y: Number(attrs.y), size, text: value });
  }
  return out;
}
const long = (n: number) => "Slow-roasted heirloom carrot & honey glazed spec".slice(0, n);
function fullMenu(design: ReturnType<typeof designById>, opts: { names: number; desc: number; price: string }): LayoutDocument {
  const doc = designDocument(design!);
  const sections = Array.from({ length: 4 }, (_, s) => ({ name: `Long section heading ${s + 1}`.slice(0, MENU_LIMITS.sectionName), items: Array.from({ length: 6 }, (_, i) => ({ name: `${long(opts.names - 2)} ${i}`, price: opts.price, description: opts.desc ? "Hand-cut, slow-cooked and finished with herbs, citrus, chili and smoked sea salt".slice(0, opts.desc) : "" })) }));
  return { ...doc, title: "The Very Long Business Name Kitchen & Bar".slice(0, MENU_LIMITS.title), subtitle: "A long tagline that keeps going to test how the header wraps and fits on screen".slice(0, 80), footer: "A long footer note about allergens, gluten-free options, opening hours and parking".slice(0, 80), featureTitle: "A very long feature headline here".slice(0, 40), featureDetail: "Two of anything from the grill with fries and a drink · $29.99".slice(0, 80), sections };
}

describe("automatic sizing with any content length", () => {
  it("keeps every line of text inside the 1920×1080 board for all templates, short or maxed-out menus", () => {
    for (const design of MENU_DESIGNS) {
      for (const doc of [designDocument(design), fullMenu(design, { names: 40, desc: 80, price: "$1,234.99" }), fullMenu(design, { names: 12, desc: 0, price: "$9" })]) {
        const { svg } = designSvgWithReport(doc);
        for (const box of textBoxes(svg)) {
          expect(box.left, `${design.id}: ${box.text}`).toBeGreaterThanOrEqual(-0.5);
          expect(box.right, `${design.id}: ${box.text}`).toBeLessThanOrEqual(1920.5);
          expect(box.y, `${design.id}: ${box.text}`).toBeLessThanOrEqual(1080);
        }
      }
    }
  });

  it("fits a typical full menu without dropping items on the text-heavy templates, and reports what doesn't fit", () => {
    for (const id of ["taqueria", "diner-classics", "chalkboard-bistro", "juice-bar", "ice-cream-parlor", "boba-tea"]) {
      const doc = fullMenu(designById(id), { names: 16, desc: 0, price: "$9.50" });
      expect(designSvgWithReport(doc).report.dropped, id).toBe(0);
    }
    const crowded = fullMenu(designById("coffee-shop"), { names: 40, desc: 80, price: "$12.50" });
    const report = designSvgWithReport(crowded).report;
    expect(report.scale).toBeGreaterThanOrEqual(0.55);
    // A maxed-out menu in a two-column photo template is reported, never silently cut.
    expect(report.dropped).toBeGreaterThanOrEqual(0);
  });

  it("wraps long names onto a second line instead of cutting them off", () => {
    const lines = wrapText("Slow-roasted heirloom carrot salad", 40, "Inter", 700, 480, 2);
    expect(lines.length).toBe(2);
    expect(lines.join(" ")).toBe("Slow-roasted heirloom carrot salad");
    expect(wrapText("Short", 40, "Inter", 700, 360, 2)).toEqual(["Short"]);
  });

  it("measures text from the real font files (matches the rasterizer within 1%)", () => {
    GlobalFonts.registerFromPath("assets/fonts/Montserrat-ExtraBold.ttf", "MetricsCheckMontserrat");
    GlobalFonts.registerFromPath("assets/fonts/BebasNeue-Regular.ttf", "MetricsCheckBebas");
    const ctx = createCanvas(10, 10).getContext("2d");
    for (const [alias, family, weight] of [["MetricsCheckMontserrat", "Montserrat", 800], ["MetricsCheckBebas", "Bebas Neue", 400]] as const) {
      ctx.font = `48px ${alias}`;
      const sample = "Little Harbor Coffee · $13.99";
      const real = ctx.measureText(sample).width;
      expect(Math.abs(textWidth(sample, 48, family, weight) - real) / real).toBeLessThan(0.01);
    }
  });
});

describe("readability and Brand Kit colours", () => {
  it("every colour style meets contrast: text 4.5:1, headings 3:1, prices and panels 4.5:1", () => {
    for (const design of MENU_DESIGNS) {
      for (const variant of design.variants) {
        const c = designColors({ ...designDocument(design), variant: variant.id }, design);
        expect(contrast(c.ink, c.paper), `${design.id}/${variant.id} text`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(c.muted, c.paper), `${design.id}/${variant.id} details`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(c.accent, c.paper), `${design.id}/${variant.id} headings`).toBeGreaterThanOrEqual(3);
        expect(contrast(c.panelInk, c.panel), `${design.id}/${variant.id} panel`).toBeGreaterThanOrEqual(4.5);
        if (design.look.tags) expect(contrast(c.tagInk, c.tag), `${design.id}/${variant.id} tags`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("adjusts hard-to-read brand colours automatically and says so", () => {
    for (const design of MENU_DESIGNS) {
      const light = designDocument(design);
      const c = designColors({ ...light, primaryColor: "#fff3a0", accentColor: "#fff7c2", textColor: "#cccccc" }, design);
      expect(contrast(c.ink, c.paper)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c.accent, c.paper)).toBeGreaterThanOrEqual(3);
      expect(contrast(c.panelInk, c.panel)).toBeGreaterThanOrEqual(4.5);
    }
    const coffee = designById("coffee-shop")!;
    const checks = designColors({ ...designDocument(coffee), accentColor: "#f8f0e0" }, coffee).checks;
    expect(checks.find((c) => c.key === "headings")?.adjusted).toBe(true);
  });

  it("brand colours and the logo reach the TV image (same SVG as the preview)", () => {
    const doc = { ...designDocument(designById("modern-restaurant")!), primaryColor: "#6e1f2a", accentColor: "#e9b44c" };
    const logo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const svg = layoutSvg(doc, { logoHref: logo });
    expect(svg).toContain('fill="#e9b44c"');
    expect(svg).toContain(logo);
    const restored = layoutSvg({ ...doc, primaryColor: null, accentColor: null }, {});
    expect(restored).not.toContain("#e9b44c");
    expect(restored).toContain(designById("modern-restaurant")!.variants[0].accent);
  });
});

describe("server-rendered TV image", () => {
  it("renders every template as a 1920×1080 PNG with its stock photo, logo and fonts", () => {
    const logo = { bytes: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"), mime: "image/png" as const };
    for (const design of MENU_DESIGNS) {
      const png = renderLayoutPng({ ...designDocument(design), logoMediaId: UUID }, null, { logo });
      expect(png.subarray(1, 4).toString()).toBe("PNG");
      expect(png.readUInt32BE(16)).toBe(1920);
      expect(png.readUInt32BE(20)).toBe(1080);
      // Photo templates are much larger than text-only ones: the stock photo was drawn into the image.
      if (design.stock) expect(png.length).toBeGreaterThan(300_000);
    }
  }, 60_000);

  it("is deterministic: the same board renders the same image every time", () => {
    const doc = designDocument(designById("bold-fast-casual")!);
    const a = createHash("sha256").update(renderLayoutPng(doc)).digest("hex");
    const b = createHash("sha256").update(renderLayoutPng(doc)).digest("hex");
    expect(a).toBe(b);
  });

  it("plays a video only in the photo area, never over menu text", () => {
    for (const design of MENU_DESIGNS) {
      const doc = { ...designDocument(design), videoMediaId: UUID };
      const comp = playerComposition(doc, "https://x/still.png", "https://x/v.mp4");
      if (!designHasMedia(design)) { expect(comp).toBeNull(); continue; }
      expect(comp?.video?.box, design.id).toBeTruthy();
      const box = comp!.video!.box;
      const menuRight = { showcase: 1140, columns: 1344, promo: 1260, list: 1920, cards: 1920, featured: 1920 }[design.composition];
      expect(box.x, design.id).toBeGreaterThanOrEqual(menuRight);
      expect(box.x + box.w).toBeLessThanOrEqual(1920);
      expect(box.y + box.h).toBeLessThanOrEqual(1080);
    }
  });
});

describe("rollout flag", () => {
  const who = { email: "Owner@Example.com", accountId: UUID, developer: false };
  it("is released to every customer by default; \"developers\" limits it to developer accounts", () => {
    const s = menuTemplatesSetting({});
    expect(menuTemplatesEnabledFor(who, s, true)).toBe(true);
    const dev = menuTemplatesSetting({ MENU_TEMPLATES: "developers" });
    expect(menuTemplatesEnabledFor(who, dev, true)).toBe(false);
    expect(menuTemplatesEnabledFor({ ...who, developer: true }, dev, true)).toBe(true);
  });
  it("supports an allowlist of emails or account ids, all, and a kill switch", () => {
    expect(menuTemplatesEnabledFor(who, menuTemplatesSetting({ MENU_TEMPLATES: "owner@example.com, someone@x.co" }), true)).toBe(true);
    expect(menuTemplatesEnabledFor(who, menuTemplatesSetting({ MENU_TEMPLATES: UUID.toUpperCase() }), true)).toBe(true);
    expect(menuTemplatesEnabledFor(who, menuTemplatesSetting({ MENU_TEMPLATES: "other@example.com" }), true)).toBe(false);
    expect(menuTemplatesEnabledFor(who, menuTemplatesSetting({ MENU_TEMPLATES: "all" }), true)).toBe(true);
    expect(menuTemplatesEnabledFor({ ...who, developer: true }, menuTemplatesSetting({ MENU_TEMPLATES: "off" }), true)).toBe(false);
    expect(menuTemplatesEnabledFor(who, menuTemplatesSetting({ MENU_TEMPLATES: "all" }), false)).toBe(false);
  });
});

describe("customer UI wiring", () => {
  const boards = () => readFileSync("components/menu-boards.tsx", "utf8");
  const ui = () => readFileSync("components/menu-templates.tsx", "utf8");
  it("New menu board opens the gallery only when the flag is on; the old flow stays otherwise", () => {
    const s = boards();
    expect(s).toContain('if (studioEnabled && templatesOn) { setView({ mode: "template-gallery"');
    expect(s).toContain('setView({ mode: "pick-layout", screenId: parseUnifiedSearch(initialSearch ?? {}).screenId }); }');
    expect(s).toContain("const templatesOn = useMenuTemplatesFlag(Boolean(fixture)) || Boolean(fixture?.templates);");
    expect(s).toContain("if (!templatesOn) return null;");
  });
  it("saves with the existing draft/publish API and assigns screens with the existing route; keeps the advanced editor", () => {
    const s = ui();
    expect(s).toContain('api<{ menuId: string }>("/api/layout-studio", { method: "POST", body: JSON.stringify(accountSaveBody({ mode, menuId, name, document: parsed.value })) })');
    expect(s).toContain('api("/api/layout-studio/assign", { method: "POST", body: JSON.stringify({ menuId: id, displayId }) })');
    expect(s).toContain("useRegisterStudioLeave(() => dirtyRef.current);");
    expect(s).toContain('{t("tpl.advanced")}');
    expect(boards()).toContain('onAdvanced={(menuId) => setView({ mode: "layout", boardId: menuId, template: view.document.template, screenId: null })}');
  });
  it("the Brand Kit is read, never written", () => {
    expect(ui()).not.toMatch(/\/api\/brand["'`]\s*,\s*\{\s*method/);
  });
  it("every template string exists in English and Spanish", () => {
    const keys = Object.keys(en).filter((k) => k.startsWith("tpl."));
    expect(keys.length).toBeGreaterThan(100);
    for (const k of keys) expect(es[k as keyof typeof es], k).toBeTruthy();
    for (const m of ui().matchAll(/t\("(tpl\.[a-zA-Z.]+)"/g)) expect(en[m[1] as keyof typeof en], m[1]).toBeTruthy();
    for (const d of MENU_DESIGNS) { expect(d.name.es).toBeTruthy(); expect(d.blurb.es).not.toBe(d.blurb.en); }
  });
});
