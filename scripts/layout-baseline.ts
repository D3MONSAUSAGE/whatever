// Prints SHA-256 of layoutSvg for a matrix of existing (pre-template) board documents. Used once to record
// tests/fixtures/layout-svg-baseline.json; tests/unit/menu-designs-compat.test.ts re-computes and compares.
import { createHash } from "node:crypto";
import { sampleLayout, layoutSvg, type LayoutDocument, type LayoutTemplate } from "@/lib/layout-studio";

export function baselineDocs(): { key: string; doc: LayoutDocument; art?: { imageHref: string } }[] {
  const templates: LayoutTemplate[] = ["menu-promo-67", "triple-column", "split-50", "menu-banner", "signature", "two-menu-promo", "two-column"];
  const out: { key: string; doc: LayoutDocument; art?: { imageHref: string } }[] = [];
  for (const template of templates) {
    for (const palette of ["classic", "fresh", "bold"] as const) {
      const base = { ...sampleLayout(template), palette };
      out.push({ key: `${template}/${palette}`, doc: base });
      out.push({ key: `${template}/${palette}/photo`, doc: base, art: { imageHref: "https://example.com/photo.jpg" } });
      out.push({ key: `${template}/${palette}/brand`, doc: { ...base, primaryColor: "#7b2d26", accentColor: "#e9b44c", font: "montserrat", bodyFont: "inter", textColor: "#111111", backgroundColor: "#fafafa" } });
    }
  }
  return out;
}

export function hashes() {
  return Object.fromEntries(baselineDocs().map(({ key, doc, art }) => [key, createHash("sha256").update(layoutSvg(doc, art)).digest("hex")]));
}
