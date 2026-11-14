import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { BOARD_FONT_IDS, BOARD_FONTS, FONT_FILES, boardFont, fontFaceCss, isBoardFont, widthScaleForFamily } from "@/lib/board-fonts";
import { layoutSvg, parseLayout, sampleLayout, seedBrand, type LayoutTemplate } from "@/lib/layout-studio";
import { isBrandFont, parseOptionalFont, fontFamilyName } from "@/lib/brand-kit";
import { renderLayoutPng } from "@/lib/server/layout-render";

const TEMPLATES: LayoutTemplate[] = ["menu-promo-67", "triple-column", "split-50", "menu-banner", "signature", "two-menu-promo", "two-column"];
const sha = (v: string | Uint8Array) => createHash("sha256").update(v).digest("hex").slice(0, 16);

// Computed on main bc69b89 (before E6). Inter and Noto Serif boards must render byte-for-byte the same.
const GOLDEN: Record<string, string> = {
  "menu-promo-67/inter/svg": "c906e1d96de39eaa",
  "menu-promo-67/inter/png": "562d15c6fffa49ee",
  "menu-promo-67/noto-serif/svg": "74c8b9be82e725a2",
  "menu-promo-67/noto-serif/png": "0cce6a0affd11207",
  "triple-column/inter/svg": "196f27335eb13b6d",
  "triple-column/inter/png": "84ffae33b4cdda2e",
  "triple-column/noto-serif/svg": "12d7e80f83657468",
  "triple-column/noto-serif/png": "47deefd966c1d577",
  "split-50/inter/svg": "3c04951f9087d1f2",
  "split-50/inter/png": "d60d366e34c3e88f",
  "split-50/noto-serif/svg": "10303e84a11f2b02",
  "split-50/noto-serif/png": "0b06e6a0fe34beeb",
  "menu-banner/inter/svg": "1803dd569a25c6a7",
  "menu-banner/inter/png": "67cc1eec256cf407",
  "menu-banner/noto-serif/svg": "fce2866167d7474c",
  "menu-banner/noto-serif/png": "1e661468439c0768",
  "signature/inter/svg": "2d5f52a8c8e5c4b0",
  "signature/inter/png": "691ec55d9018e216",
  "signature/noto-serif/svg": "f2e8e7f3ea0cb0ca",
  "signature/noto-serif/png": "6d47258a1e60914c",
  "two-menu-promo/inter/svg": "77bb8456a0c8e337",
  "two-menu-promo/inter/png": "2fbb534bd49dc250",
  "two-menu-promo/noto-serif/svg": "b0de2e6129333933",
  "two-menu-promo/noto-serif/png": "02f202bcf68d8df1",
  "two-column/inter/svg": "f96c427c1dffa753",
  "two-column/inter/png": "63ad0b3db9e4d236",
  "two-column/noto-serif/svg": "b250bb7b4edaa8fc",
  "two-column/noto-serif/png": "115356632cc94045"
};

describe("E6: more fonts for boards and Brand Kit", () => {
  it("adds four self-hosted OFL faces; Inter and Noto Serif unchanged", () => {
    expect(BOARD_FONT_IDS).toEqual(["inter", "noto-serif", "oswald", "montserrat", "bebas-neue", "lobster"]);
    for (const font of BOARD_FONTS) for (const face of font.files) expect(existsSync(`assets/fonts/${face.file}`)).toBe(true);
    for (const lic of ["Oswald-OFL.txt", "Montserrat-OFL.txt", "BebasNeue-OFL.txt", "Lobster-OFL.txt", "NotoSerif-OFL.txt"]) {
      expect(readFileSync(`assets/fonts/${lic}`, "utf8")).toMatch(/SIL Open Font License, Version 1\.1/);
    }
    expect(FONT_FILES).toMatchObject({ inter: "Inter-Regular.ttf", "inter-bold": "Inter-Bold.ttf", "inter-extrabold": "Inter-ExtraBold.ttf", "noto-serif": "NotoSerif-Regular.ttf", "noto-serif-bold": "NotoSerif-Bold.ttf" });
    expect(widthScaleForFamily("Inter")).toBe(1);
    expect(widthScaleForFamily("Noto Serif")).toBe(1);
  });

  it("existing Inter and Noto Serif boards render byte-for-byte as before (SVG and PNG)", () => {
    for (const t of TEMPLATES) for (const font of ["inter", "noto-serif"] as const) {
      const doc = { ...sampleLayout(t), font };
      expect(sha(layoutSvg(doc)), `${t}/${font}/svg`).toBe(GOLDEN[`${t}/${font}/svg`]);
      expect(sha(renderLayoutPng(doc)), `${t}/${font}/png`).toBe(GOLDEN[`${t}/${font}/png`]);
    }
  });

  it("renders each new face into the published PNG, distinct from Inter", () => {
    const inter = sha(renderLayoutPng(sampleLayout("menu-promo-67")));
    for (const id of ["oswald", "montserrat", "bebas-neue", "lobster"] as const) {
      const doc = { ...sampleLayout("menu-promo-67"), font: id };
      expect(layoutSvg(doc)).toContain(`font-family="${boardFont(id).family}"`);
      const png = renderLayoutPng(doc);
      expect(png.length).toBeGreaterThan(10_000);
      expect(sha(png)).not.toBe(inter);
    }
  });

  it("Montserrat truncates long text earlier so it stays inside its column", () => {
    const long = { ...sampleLayout("triple-column"), title: "Harbor Street Kitchen and Bar Weekend Brunch Specials Menu Board" };
    const interSvg = layoutSvg({ ...long, font: "inter" });
    const montSvg = layoutSvg({ ...long, font: "montserrat" });
    const titleOf = (svg: string) => [...svg.matchAll(/>([^<]*…)</g)].map((m) => m[1]).sort((a, b) => b.length - a.length)[0] ?? "";
    expect(titleOf(montSvg).length).toBeLessThan(titleOf(interSvg).length);
  });

  it("accepts the new faces in board documents and Brand Kit, and refuses others", () => {
    for (const id of BOARD_FONT_IDS) {
      const parsed = parseLayout({ ...sampleLayout(), font: id });
      expect(parsed.ok && parsed.value.font).toBe(id);
      expect(isBrandFont(id)).toBe(true);
      expect(parseOptionalFont(id, "heading")).toEqual({ ok: true, value: id });
    }
    const bad = parseLayout({ ...sampleLayout(), font: "comic-sans" });
    expect(bad).toEqual({ ok: false, error: "Choose one of: Inter, Noto Serif, Oswald, Montserrat, Bebas Neue, Lobster." });
    expect(parseOptionalFont("papyrus", "heading")).toEqual({ ok: false, error: "Choose one of: Inter, Noto Serif, Oswald, Montserrat, Bebas Neue, Lobster for the heading." });
    expect(isBoardFont("__proto__")).toBe(false);
    expect(fontFamilyName("bebas-neue")).toBe("Bebas Neue");
    expect(fontFamilyName(null)).toBe("Inter");
    // Brand seeds only new boards; heading wins over body, as before.
    expect(seedBrand(sampleLayout(), { headingFont: "lobster", bodyFont: "oswald" } as never).font).toBe("lobster");
  });

  it("the editor preview loads the same files, never fakes a bold, and uses no font CDN", () => {
    const css = fontFaceCss();
    expect(css).toContain(`font-family: Inter; src: url("/layout-studio/media/font/inter-extrabold") format("truetype"); font-weight: 800;`);
    expect(css).toContain(`font-family: "Bebas Neue"; src: url("/layout-studio/media/font/bebas-neue") format("truetype"); font-weight: 100 900;`);
    expect(css).toContain(`font-family: Lobster; src: url("/layout-studio/media/font/lobster") format("truetype"); font-weight: 100 900;`);
    const route = readFileSync("app/layout-studio/media/font/[name]/route.ts", "utf8");
    expect(route).toMatch(/Object\.hasOwn\(FILES, name\)/);
    const sources = ["components/studio-chrome.tsx", "components/brand-kit.tsx", "components/layout-studio.tsx", "app/layout.tsx"].filter(existsSync).map((f) => readFileSync(f, "utf8")).join("\n");
    expect(sources).not.toMatch(/fonts\.googleapis|fonts\.gstatic|use\.typekit|fonts\.bunny/);
  });

  it("migration only widens the Brand Kit checks to exactly these faces", () => {
    const files = readdirSync("supabase/migrations").filter((f) => /brand_kit_fonts_e6/.test(f));
    expect(files).toEqual(["0026_brand_kit_fonts_e6.sql"]);
    const sql = readFileSync(`supabase/migrations/${files[0]}`, "utf8");
    const list = BOARD_FONT_IDS.map((id) => `'${id}'`).join(", ");
    expect(sql).toContain(`heading_font is null or heading_font in (${list})`);
    expect(sql).toContain(`body_font is null or body_font in (${list})`);
    expect(sql).not.toMatch(/\b(update|delete|truncate|drop table|drop column)\b/i);
  });
});
