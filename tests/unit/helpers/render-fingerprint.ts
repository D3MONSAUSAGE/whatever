/** Fingerprints of the TV player and renderers, compared against tests/fixtures/render-guard.json. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { layoutSvg, sampleLayout, type LayoutTemplate } from "@/lib/layout-studio";
import { menuSvg } from "@/lib/server/menu-render";
import { promoSvg } from "@/lib/server/promo-render";
import { MENU_TEMPLATES, sampleMenu } from "@/lib/menu-templates";
import { PROMO_TEMPLATES, samplePromo } from "@/lib/promo-templates";

export const GUARDED_FILES = ["public/player.html", "lib/server/layout-render.ts", "lib/server/menu-render.ts", "lib/menu-classic-svg.ts", "lib/server/promo-render.ts"] as const;
const LAYOUTS: LayoutTemplate[] = ["menu-promo-67", "triple-column", "split-50", "menu-banner", "signature", "two-menu-promo", "two-column"];
const NAMES = [null, "Burrito de carne asada con guacamole XL", "MMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMM"];

const sha = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");

export function fingerprint() {
  const files = Object.fromEntries(GUARDED_FILES.map((f) => [f, sha(readFileSync(f))]));
  const outputs: Record<string, string> = {};
  for (const t of LAYOUTS) {
    const doc = sampleLayout(t);
    NAMES.forEach((name, i) => {
      const d = name ? { ...doc, sections: doc.sections.map((s) => ({ ...s, items: s.items.map((it) => ({ ...it, name })) })) } : doc;
      outputs[`layoutSvg:${t}:${i}`] = sha(layoutSvg(d));
    });
  }
  for (const m of MENU_TEMPLATES) outputs[`menuSvg:${m.id}`] = sha(menuSvg(m.id, sampleMenu()));
  for (const p of PROMO_TEMPLATES) outputs[`promoSvg:${p.id}`] = sha(promoSvg(p.id, samplePromo(p.id)));
  return { files, outputs };
}
