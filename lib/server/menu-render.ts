import path from "node:path";
import { Resvg } from "@resvg/resvg-js";
import type { MenuContent, MenuSection, MenuTemplate } from "@/lib/menu-templates";

export const MENU_WIDTH = 1920;
export const MENU_HEIGHT = 1080;

type Theme = {
  bg: string; bg2: string; band: string | null; title: string; subtitle: string;
  section: string; text: string; muted: string; price: string; priceBg: string | null; rule: string; footer: string;
};

const THEMES: Record<MenuTemplate, Theme> = {
  classic: { bg: "#0b1220", bg2: "#13203a", band: null, title: "#ffffff", subtitle: "#9fb0c8", section: "#4d94ff", text: "#ffffff", muted: "#9fb0c8", price: "#ffffff", priceBg: null, rule: "#24324d", footer: "#9fb0c8" },
  fresh: { bg: "#f6f9fe", bg2: "#ffffff", band: "#0066ff", title: "#ffffff", subtitle: "#dbe8ff", section: "#0066ff", text: "#0b1220", muted: "#5b6b82", price: "#0b1220", priceBg: null, rule: "#d5e2f2", footer: "#5b6b82" },
  bold: { bg: "#0066ff", bg2: "#0047b3", band: null, title: "#ffffff", subtitle: "#cfe0ff", section: "#ffd34d", text: "#ffffff", muted: "#cfe0ff", price: "#0b1220", priceBg: "#ffd34d", rule: "#3a85ff", footer: "#cfe0ff" },
};

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Rough Inter advance width so long text is shortened instead of overlapping. */
export function approxWidth(s: string, size: number, weight = 400) {
  let units = 0;
  for (const ch of s) {
    if (/[ilI.,:;'!|]/.test(ch)) units += 0.28;
    else if (/[mwMW@]/.test(ch)) units += 0.86;
    else if (/[A-Z0-9$]/.test(ch)) units += 0.66;
    else if (ch === " ") units += 0.27;
    else units += 0.56;
  }
  return units * size * (weight >= 700 ? 1.05 : 1);
}

export function fit(s: string, size: number, max: number, weight = 400) {
  if (approxWidth(s, size, weight) <= max) return s;
  const chars = [...s];
  while (chars.length > 1 && approxWidth(chars.join("") + "…", size, weight) > max) chars.pop();
  return chars.join("").trimEnd() + "…";
}

function units(section: MenuSection) {
  return (section.name ? 1.3 : 0) + section.items.reduce((n, i) => n + (i.description ? 1.55 : 1), 0) + 0.5;
}

/** Split sections into one or two balanced columns. */
export function columnsFor(sections: MenuSection[]): MenuSection[][] {
  const total = sections.reduce((n, s) => n + units(s), 0);
  if (sections.length <= 1 && total <= 9) return [sections];
  if (sections.length === 1) {
    const s = sections[0];
    const half = Math.ceil(s.items.length / 2);
    return [[{ name: s.name, items: s.items.slice(0, half) }], [{ name: "", items: s.items.slice(half) }]];
  }
  let best = 1, bestDiff = Infinity;
  for (let k = 1; k < sections.length; k++) {
    const left = sections.slice(0, k).reduce((n, s) => n + units(s), 0);
    const diff = Math.abs(total - 2 * left);
    if (diff < bestDiff) { bestDiff = diff; best = k; }
  }
  return [sections.slice(0, best), sections.slice(best)];
}

export function menuSvg(template: MenuTemplate, content: MenuContent) {
  const t = THEMES[template];
  const W = MENU_WIDTH, H = MENU_HEIGHT, pad = 96;
  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
  out.push(`<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${t.bg}"/><stop offset="1" stop-color="${t.bg2}"/></linearGradient></defs>`);
  out.push(`<rect width="${W}" height="${H}" fill="url(#g)"/>`);

  const hasHeader = Boolean(content.title || content.subtitle);
  const headerH = hasHeader ? (content.subtitle ? 250 : 200) : 60;
  if (t.band && hasHeader) out.push(`<rect width="${W}" height="${headerH}" fill="${t.band}"/>`);
  if (!t.band) out.push(`<rect x="${pad}" y="${headerH - 24}" width="${hasHeader ? 160 : 0}" height="8" rx="4" fill="${t.section}"/>`);
  if (content.title) {
    out.push(`<text x="${pad}" y="${content.subtitle ? 140 : 145}" font-size="96" font-weight="800" fill="${t.title}">${esc(fit(content.title, 96, W - 2 * pad, 800))}</text>`);
  }
  if (content.subtitle) {
    out.push(`<text x="${pad}" y="${200}" font-size="40" fill="${t.subtitle}">${esc(fit(content.subtitle, 40, W - 2 * pad))}</text>`);
  }

  const top = headerH + 70;
  const bottom = H - (content.footer ? 120 : 70);
  const cols = columnsFor(content.sections);
  const gap = 120;
  const colW = (W - 2 * pad - gap * (cols.length - 1)) / cols.length;
  const maxUnits = Math.max(1, ...cols.map((c) => c.reduce((n, s) => n + units(s), 0)));
  const u = Math.min(cols.length === 1 ? 92 : 86, (bottom - top) / maxUnits);
  const nameSize = Math.round(Math.min(48, u * 0.52));
  const descSize = Math.round(Math.min(30, u * 0.34));
  const sectionSize = Math.round(Math.min(40, u * 0.46));

  cols.forEach((col, ci) => {
    const x = pad + ci * (colW + gap);
    let y = top;
    for (const section of col) {
      if (section.name) {
        y += u * 0.8;
        out.push(`<text x="${x}" y="${y.toFixed(1)}" font-size="${sectionSize}" font-weight="800" letter-spacing="3" fill="${t.section}">${esc(fit(section.name.toUpperCase(), sectionSize, colW, 800))}</text>`);
        out.push(`<rect x="${x}" y="${(y + u * 0.2).toFixed(1)}" width="${colW}" height="2" fill="${t.rule}"/>`);
        y += u * 0.5;
      }
      for (const item of section.items) {
        y += u * 0.78;
        const priceW = item.price ? approxWidth(item.price, nameSize, 700) + (t.priceBg ? 36 : 0) : 0;
        if (item.price) {
          if (t.priceBg) {
            out.push(`<rect x="${(x + colW - priceW).toFixed(1)}" y="${(y - nameSize * 0.95).toFixed(1)}" width="${priceW.toFixed(1)}" height="${(nameSize * 1.3).toFixed(1)}" rx="${(nameSize * 0.3).toFixed(1)}" fill="${t.priceBg}"/>`);
            out.push(`<text x="${(x + colW - 18).toFixed(1)}" y="${y.toFixed(1)}" text-anchor="end" font-size="${nameSize}" font-weight="700" fill="${t.price}">${esc(item.price)}</text>`);
          } else {
            out.push(`<text x="${(x + colW).toFixed(1)}" y="${y.toFixed(1)}" text-anchor="end" font-size="${nameSize}" font-weight="700" fill="${t.price}">${esc(item.price)}</text>`);
          }
        }
        out.push(`<text x="${x}" y="${y.toFixed(1)}" font-size="${nameSize}" font-weight="700" fill="${t.text}">${esc(fit(item.name, nameSize, colW - priceW - 32, 700))}</text>`);
        if (item.description) {
          y += u * 0.55;
          out.push(`<text x="${x}" y="${y.toFixed(1)}" font-size="${descSize}" fill="${t.muted}">${esc(fit(item.description, descSize, colW - priceW - 32))}</text>`);
        }
        y += u * 0.22;
      }
      y += u * 0.5;
    }
  });

  if (content.footer) {
    out.push(`<rect x="${pad}" y="${H - 104}" width="${W - 2 * pad}" height="2" fill="${t.rule}"/>`);
    out.push(`<text x="${pad}" y="${H - 50}" font-size="34" fill="${t.footer}">${esc(fit(content.footer, 34, W - 2 * pad))}</text>`);
  }
  out.push(`</svg>`);
  return out.join("");
}

const FONT_DIR = path.join(process.cwd(), "assets", "fonts");
const FONTS = ["Inter-Regular.ttf", "Inter-Bold.ttf", "Inter-ExtraBold.ttf"].map((f) => path.join(FONT_DIR, f));

/** Render a menu to a 1920×1080 PNG with bundled open-source fonts (no paid service). */
export function renderMenuPng(template: MenuTemplate, content: MenuContent): Uint8Array {
  const resvg = new Resvg(menuSvg(template, content), {
    font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: "Inter" },
    fitTo: { mode: "original" },
  });
  return new Uint8Array(resvg.render().asPng());
}
