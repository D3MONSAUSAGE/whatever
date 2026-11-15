import { describe, expect, it } from "vitest";
import { makeT } from "@/lib/i18n";
import { en } from "@/lib/i18n/en";
import { es } from "@/lib/i18n/es";
import { sampleLayout, templateSpec, type LayoutTemplate } from "@/lib/layout-studio";
import { LAYOUT_OPTIONS } from "@/lib/menu-board-unify";
import { MENU_TEMPLATES, sampleMenu } from "@/lib/menu-templates";
import { boardKindLabel } from "@/lib/menu-board-label";

const TEMPLATES: LayoutTemplate[] = ["menu-promo-67", "triple-column", "split-50", "menu-banner", "signature", "two-menu-promo", "two-column"];

describe("Board list uses the Studio layout name (one name per layout, EN and ES)", () => {
  for (const locale of ["en", "es"] as const) {
    it(`${locale}: every layout board shows the Studio picker name`, () => {
      const t = makeT(locale);
      const dict = (locale === "en" ? en : es) as Record<string, string>;
      for (const id of TEMPLATES) expect(boardKindLabel("fresh", sampleLayout(id), t)).toBe(dict[`lt.${id}.name`]);
    });
  }
  it("the two layouts that used to have two names", () => {
    expect(boardKindLabel("fresh", sampleLayout("two-menu-promo"), makeT("en"))).toBe("Two-column menu + promo");
    expect(boardKindLabel("fresh", sampleLayout("menu-promo-67"), makeT("en"))).toBe("Menu and promotion");
    expect(boardKindLabel("fresh", sampleLayout("two-menu-promo"), makeT("es"))).toBe("Menú de dos columnas + promoción");
    expect(boardKindLabel("fresh", sampleLayout("menu-promo-67"), makeT("es"))).toBe("Menú y promoción");
  });
  it("classic boards and stored data are unchanged", () => {
    for (const tpl of MENU_TEMPLATES) expect(boardKindLabel(tpl.id, sampleMenu(), makeT("es"))).toBe(es[`tpl.${tpl.id}.name` as keyof typeof es]);
    expect(boardKindLabel("fresh", { nope: true }, makeT("en"))).toBe(en["mb.kindBoard"]);
    for (const id of TEMPLATES) expect(templateSpec(id).name).toBe(en[`lt.${id}.name` as keyof typeof en]);
    expect(LAYOUT_OPTIONS.map((o) => [o.id, o.name, o.layoutTemplate ?? null])).toContainEqual(["two-menu-promo", "Two menus + promo", "two-menu-promo"]);
    expect(LAYOUT_OPTIONS.map((o) => [o.id, o.name, o.layoutTemplate ?? null])).toContainEqual(["menu-promo", "Menu + promo image/video", "menu-promo-67"]);
  });
});
