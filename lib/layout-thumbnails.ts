import { layoutSvg, sampleLayout, type LayoutTemplate } from "@/lib/layout-studio";
import { layoutOptionById, type LayoutOptionId } from "@/lib/menu-board-unify";

/** Reuse the existing layout SVG renderer (and a matching classic sketch) as gallery thumbnails. No new templates. */
export function layoutThumbnailSvg(id: LayoutOptionId): string {
  const option = layoutOptionById(id);
  if (!option || option.kind === "classic" || !option.layoutTemplate) return classicMenuThumbnail();
  return layoutSvg(sampleLayout(option.layoutTemplate));
}

export function layoutThumbnailSrc(id: LayoutOptionId): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(layoutThumbnailSvg(id))}`;
}

function classicMenuThumbnail(): string {
  const rows = [
    ["Pollo asado", "$14"],
    ["Carne asada", "$16"],
    ["Market fish", "$18"],
    ["Veggie bowl", "$13"],
    ["Street corn", "$5"],
    ["Greens", "$6"],
  ];
  const items = rows.map(([name, price], index) => {
    const y = 280 + index * 110;
    return `<text x="96" y="${y}" font-family="system-ui,sans-serif" font-size="42" font-weight="600" fill="#122033">${escapeXml(name)}</text>`
      + `<text x="1824" y="${y}" font-family="system-ui,sans-serif" font-size="42" font-weight="700" fill="#122033" text-anchor="end">${escapeXml(price)}</text>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080" role="img">`
    + `<rect width="1920" height="1080" fill="#f6f9fe"/>`
    + `<rect width="1920" height="160" fill="#0066ff"/>`
    + `<text x="96" y="108" font-family="system-ui,sans-serif" font-size="72" font-weight="800" fill="#ffffff">Full-screen menu</text>`
    + items
    + `</svg>`;
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}


/** Scaled-down still of an existing Layout Studio template. No new templates. */
export function studioTemplateThumbnailSrc(template: LayoutTemplate): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(layoutSvg(sampleLayout(template)))}`;
}
