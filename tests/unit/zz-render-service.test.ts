import { it } from "vitest";
import { writeFileSync } from "node:fs";
import { MENU_DESIGNS, designDocument } from "@/lib/menu-designs";
import { designSvgWithReport } from "@/lib/menu-design-svg";
import { renderLayoutPng } from "@/lib/server/layout-render";
const OUT = process.env.OUT_DIR!;
const IDS = ["luxury-barbershop", "boutique-promotion", "product-spotlight", "modern-gym"];
it("render service templates", () => {
  for (const d of MENU_DESIGNS.filter((x) => IDS.includes(x.id))) {
    for (const v of d.variants) for (const orientation of ["landscape", "portrait"] as const) {
      const doc = { ...designDocument(d, v.id), ...(orientation === "portrait" ? { orientation: "portrait" as const } : {}) };
      const r = designSvgWithReport(doc).report;
      writeFileSync(`${OUT}/${d.id}--${v.id}--${orientation}.png`, renderLayoutPng(doc));
      console.log(d.id, v.id, orientation, "dropped", r.dropped, "scale", r.scale.toFixed(2), "clips", JSON.stringify(r.clips));
    }
  }
}, 300000);
