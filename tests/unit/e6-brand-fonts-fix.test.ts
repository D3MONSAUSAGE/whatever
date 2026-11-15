import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { describe, expect, it } from "vitest";
import { menuSvg, renderMenuPng } from "@/lib/server/menu-render";
import { parseMenuContent, sampleMenu } from "@/lib/menu-templates";
import { layoutSvg, parseLayout, sampleLayout, seedBrand } from "@/lib/layout-studio";
import { seedClassicMenu } from "@/lib/brand-kit";
import { ALL_FONT_FILES, BOARD_FONTS, boardFont, FONT_FILES, fontFaceCss, type BoardFontId } from "@/lib/board-fonts";

const sha = (b: Uint8Array | string) => createHash("sha256").update(b).digest("hex").slice(0, 16);
const IDS = BOARD_FONTS.map((f) => f.id) as BoardFontId[];
/** Every heading/body pair a Brand Kit can hold (different fonts). */
const PAIRS: [BoardFontId, BoardFontId][] = IDS.flatMap((h) => IDS.filter((b) => b !== h).map((b) => [h, b] as [BoardFontId, BoardFontId]));
/** The QA-reported pairs also get the real-browser face check. */
const QA_PAIRS = new Set(["bebas-neue/montserrat", "lobster/oswald"]);
const fam = (id: BoardFontId) => boardFont(id).family;
const texts = (svg: string) => [...svg.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)].map((m) => ({ attrs: m[1]!, text: m[2]!, family: /font-family="([^"]*)"/.exec(m[1]!)?.[1] ?? null }));
const familyOf = (svg: string, text: string) => texts(svg).find((t) => t.text === text)?.family;

describe("E6 fix: existing boards are untouched", () => {
  it("classic and Layout boards without new font fields render byte-for-byte as before (hashes from main 785daf4)", () => {
    const want = { classic: ["8a69672cf294aa12", "614963b3eca5ba19"], fresh: ["ba19231e6c06f5ac", "595da3a802e5e0bd"], bold: ["bd97ba91ee3e2ccc", "c4b324efaffae1f3"] } as const;
    for (const [t, [png, svg]] of Object.entries(want) as [keyof typeof want, readonly [string, string]][]) {
      expect(sha(menuSvg(t, sampleMenu()))).toBe(svg);
      expect(sha(renderMenuPng(t, sampleMenu()))).toBe(png);
    }
    expect(menuSvg("classic", sampleMenu())).not.toContain("font-family");
    const layouts = { "two-column": "f96c427c1dffa753", "menu-promo-67": "c906e1d96de39eaa", signature: "2d5f52a8c8e5c4b0", "triple-column": "196f27335eb13b6d" } as const;
    for (const [t, h] of Object.entries(layouts)) expect(sha(layoutSvg(sampleLayout(t as keyof typeof layouts)))).toBe(h);
  });

  it("seeding is for new content only: a board that already has fonts keeps them, and parse keeps old JSON valid", () => {
    const kept = seedClassicMenu({ ...sampleMenu(), headingFont: "oswald" }, { headingFont: "lobster", bodyFont: "montserrat" });
    expect(kept.headingFont).toBe("oswald");
    expect(kept.bodyFont).toBe("montserrat");
    const old = parseMenuContent(sampleMenu());
    expect(old.ok && "headingFont" in old.value).toBe(false);
    expect(parseMenuContent({ ...sampleMenu(), headingFont: "comic-sans" }).ok).toBe(false);
    const parsed = parseLayout({ ...sampleLayout("two-column"), bodyFont: "inter" });
    expect(parsed.ok && parsed.value.bodyFont).toBeFalsy(); // same as font → dropped
  });
});

describe.each(PAIRS)("E6 fix: Brand Kit %s headings / %s body on new boards", (heading, body) => {
  it("E6-F1 classic: title and sections in the heading font; items, prices, description, subtitle, footer in the body font", () => {
    const content = seedClassicMenu(sampleMenu(), { headingFont: heading, bodyFont: body, displayName: "Harbor Street", phone: "(555) 010-0199" });
    expect(content).toMatchObject({ headingFont: heading, bodyFont: body });
    const parsed = parseMenuContent(content);
    expect(parsed.ok && parsed.value).toMatchObject({ headingFont: heading, bodyFont: body }); // survives save
    const svg = menuSvg("fresh", content);
    const item = content.sections[0]!.items[0]!;
    expect(familyOf(svg, "Harbor Street")).toBe(fam(heading));
    expect(familyOf(svg, content.sections[0]!.name.toUpperCase())).toBe(fam(heading));
    expect(familyOf(svg, item.price)).toBe(fam(body));
    expect(texts(svg).find((t) => t.text.startsWith(item.name.slice(0, 4)))?.family).toBe(fam(body));
    expect(familyOf(svg, "(555) 010-0199")).toBe(fam(body));
    // The PNG really draws the faces (differs from the Inter render).
    expect(sha(renderMenuPng("fresh", content))).not.toBe(sha(renderMenuPng("fresh", { ...content, headingFont: undefined, bodyFont: undefined })));
  });

  it("E6-F2 Layout Studio: heading font on title/sections, body font on item names, prices and descriptions", () => {
    const doc = seedBrand(sampleLayout("two-column"), { headingFont: heading, bodyFont: body });
    expect(doc.font).toBe(heading);
    expect(doc.bodyFont).toBe(body);
    const svg = layoutSvg(doc);
    const sec = doc.sections[0]!;
    expect(familyOf(svg, sec.name.toUpperCase())).toBe(fam(heading));
    const item = sec.items.find((i) => i.price)!;
    expect(familyOf(svg, item.price)).toBe(fam(body));
    const desc = sec.items.find((i) => i.description)!;
    expect(texts(svg).find((t) => desc.description.startsWith(t.text.replace(/…$/, "")) && t.text.length > 3)?.family).toBe(fam(body));
    const roundTrip = parseLayout(JSON.parse(JSON.stringify(doc)));
    expect(roundTrip.ok && roundTrip.value.bodyFont).toBe(body);
  });

  it.runIf(QA_PAIRS.has(`${heading}/${body}`))("the published PNG renderer and the browser preview both resolve each family to its own file", async () => {
    // resvg: every family name used on the board matches a bundled file.
    const dir = path.join(process.cwd(), "assets", "fonts");
    for (const id of [heading, body]) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="80"><text x="10" y="60" font-family="${fam(id)}" font-size="48">Hamburguesa</text></svg>`;
      const draw = (files: string[]) => sha(new Resvg(svg, { font: { fontFiles: files.map((f) => path.join(dir, f)), loadSystemFonts: false, defaultFontFamily: "Inter" } }).render().asPng());
      expect(draw(ALL_FONT_FILES)).not.toBe(draw(["Inter-Regular.ttf"]));
    }
    // Browser (editor/Brand Kit preview): computed family and a loaded face for each text role.
    let chromium: typeof import("@playwright/test").chromium;
    try { chromium = (await import("@playwright/test")).chromium; } catch { return; }
    let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
    try { browser = await chromium.launch({ timeout: 20000 }); } catch { return; }
    try {
      const page = await browser.newPage();
      await page.route("http://fonts.test/**", (route) => {
        const url = new URL(route.request().url());
        const name = url.pathname.split("/").pop()!;
        if (!url.pathname.startsWith("/layout-studio/media/font/")) return route.fulfill({ body: "<!doctype html><title>t</title>", contentType: "text/html" });
        return route.fulfill({ body: readFileSync(path.join(dir, FONT_FILES[name]!)), contentType: "font/ttf" });
      });
      await page.goto("http://fonts.test/");
      await page.setContent(`<style>${fontFaceCss()}</style><div id="h" style="font-family:${fam(heading)}">Title</div><div id="b" style="font-family:${fam(body)};font-weight:500">Featured item</div>`);
      const loaded = await page.evaluate(async ([h, b]) => {
        await Promise.all([document.fonts.load(`48px "${h}"`), document.fonts.load(`500 16px "${b}"`)]);
        return { h: document.fonts.check(`48px "${h}"`), b: document.fonts.check(`500 16px "${b}"`), faces: [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family.replace(/"/g, "")) };
      }, [fam(heading), fam(body)]);
      expect(loaded.h).toBe(true);
      expect(loaded.b).toBe(true);
      expect(loaded.faces).toEqual(expect.arrayContaining([fam(heading), fam(body)]));
    } finally { await browser.close(); }
  }, 30000);
});

describe("E6-F5 toast", () => {
  it("doesn't claim a new classic board is in a playlist", () => {
    const src = readFileSync("components/classic-editor.tsx", "utf8");
    expect(src).not.toContain("It's in your media and playlists");
    expect(src).toContain("Add it to a playlist or a screen when you're ready.");
  });
});
