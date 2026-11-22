// Records SHA-256 of every board renderer's SVG for a wide matrix of existing (uncustomized) documents.
// Captured once on main before Guided Customization; tests/unit/menu-customization-compat.test.ts recomputes and
// compares, proving that boards without `custom` render byte-identically (so pixel-identically) after the change.
import { createHash } from "node:crypto";
import { layoutSvg, sampleLayout, type LayoutDocument, type LayoutTemplate } from "@/lib/layout-studio";
import { MENU_DESIGNS, designDocument } from "@/lib/menu-designs";
import { menuSvg } from "@/lib/menu-classic-svg";
import { sampleMenu, type MenuTemplate } from "@/lib/menu-templates";

const PHOTO = "https://example.com/photo.jpg";
const VIDEO = "00000000-0000-4000-8000-0000000000a1";
const OWNER = "00000000-0000-4000-8000-000000000101";
const LONG_NAME = "Extra crispy double smash burger with fries";
const LONG_DESC = "Brioche bun, two smashed patties, aged cheddar, pickles, onions and our secret house sauce";

function big(doc: LayoutDocument): LayoutDocument {
  const names = ["Starters", "Mains", "Sides", "Drinks"];
  return {
    ...doc,
    sections: names.map((name, s) => ({
      name,
      items: Array.from({ length: 6 }, (_, i) => ({ name: `${name} item ${i + 1}${i === 0 ? " with a long name" : ""}`, price: `$${10 + i}`, description: i % 2 ? "Seasonal, local and made fresh daily" : "" , ...(s === 0 && i === 0 ? { imageMediaId: OWNER } : {}) })),
    })),
  };
}
function longText(doc: LayoutDocument): LayoutDocument {
  return {
    ...doc,
    title: "The Very Long Restaurant Name Co.",
    featureTitle: doc.featureTitle ? "Tonight only special" : doc.featureTitle,
    featureDetail: doc.featureDetail ? "Twenty-eight day dry-aged ribeye with smoked butter · $46" : doc.featureDetail,
    sections: doc.sections.map((sec) => ({ ...sec, items: sec.items.map((it, i) => (i === 0 ? { ...it, name: LONG_NAME.slice(0, 40), description: LONG_DESC.slice(0, 80) } : it)) })),
  };
}
function small(doc: LayoutDocument): LayoutDocument {
  return { ...doc, sections: [{ name: doc.sections[0]?.name ?? "Menu", items: doc.sections[0]?.items.slice(0, 2) ?? [] }] };
}

export type Case = { key: string; svg: () => string };

export function corpus(): Case[] {
  const out: Case[] = [];
  for (const design of MENU_DESIGNS) {
    for (const variant of design.variants) {
      const base = designDocument(design, variant.id);
      out.push({ key: `design/${design.id}/${variant.id}`, svg: () => layoutSvg(base) });
    }
    const base = designDocument(design);
    const own = { ...base, stockPhoto: undefined };
    out.push({ key: `design/${design.id}/photo`, svg: () => layoutSvg(own, { imageHref: PHOTO }) });
    out.push({ key: `design/${design.id}/photo-contain-top`, svg: () => layoutSvg({ ...own, imageFit: "contain", imageAnchor: "top" }, { imageHref: PHOTO }) });
    out.push({ key: `design/${design.id}/video`, svg: () => layoutSvg({ ...own, videoMediaId: VIDEO }, { imageHref: PHOTO }) });
    out.push({ key: `design/${design.id}/no-feature`, svg: () => layoutSvg({ ...base, featureTitle: "", featureDetail: "" }) });
    out.push({ key: `design/${design.id}/big`, svg: () => layoutSvg(big(base), { itemImages: { [OWNER]: PHOTO } }) });
    out.push({ key: `design/${design.id}/long`, svg: () => layoutSvg(longText(base)) });
    out.push({ key: `design/${design.id}/small`, svg: () => layoutSvg(small(base)) });
    out.push({ key: `design/${design.id}/text-photos`, svg: () => layoutSvg({ ...base, photoStyle: "text" }) });
    out.push({ key: `design/${design.id}/brand`, svg: () => layoutSvg({ ...base, primaryColor: "#7b2d26", accentColor: "#e9b44c", textColor: "#111111", backgroundColor: "#fafafa", font: "montserrat", bodyFont: "inter" }) });
  }
  const templates: LayoutTemplate[] = ["menu-promo-67", "triple-column", "split-50", "menu-banner", "signature", "two-menu-promo", "two-column"];
  for (const template of templates) {
    const base = sampleLayout(template);
    out.push({ key: `layout/${template}`, svg: () => layoutSvg(base) });
    out.push({ key: `layout/${template}/photo`, svg: () => layoutSvg(base, { imageHref: PHOTO }) });
    out.push({ key: `layout/${template}/photo-contain-left`, svg: () => layoutSvg({ ...base, imageFit: "contain", imageAnchor: "left" }, { imageHref: PHOTO }) });
    out.push({ key: `layout/${template}/video`, svg: () => layoutSvg({ ...base, videoMediaId: VIDEO }, { imageHref: PHOTO }) });
    out.push({ key: `layout/${template}/counter`, svg: () => layoutSvg({ ...base, typeScale: "counter" }) });
    out.push({ key: `layout/${template}/big`, svg: () => layoutSvg(big(base), { itemImages: { [OWNER]: PHOTO } }) });
    out.push({ key: `layout/${template}/long`, svg: () => layoutSvg(longText(base)) });
    out.push({ key: `layout/${template}/small`, svg: () => layoutSvg(small(base)) });
    out.push({ key: `layout/${template}/no-feature`, svg: () => layoutSvg({ ...base, featureTitle: "", featureDetail: "" }, { imageHref: PHOTO }) });
    out.push({ key: `layout/${template}/fonts`, svg: () => layoutSvg({ ...base, font: "bebas-neue", bodyFont: "inter" }) });
  }
  for (const theme of ["classic", "fresh", "bold"] as MenuTemplate[]) {
    out.push({ key: `classic/${theme}`, svg: () => menuSvg(theme, sampleMenu()) });
    out.push({ key: `classic/${theme}/photo`, svg: () => menuSvg(theme, sampleMenu(), { photo: PHOTO }) });
  }
  return out;
}

export function hashes(): Record<string, string> {
  return Object.fromEntries(corpus().map(({ key, svg }) => [key, createHash("sha256").update(svg()).digest("hex")]));
}
