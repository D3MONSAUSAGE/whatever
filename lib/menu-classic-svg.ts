/**
 * Classic full-screen menu board (Classic night / Fresh day / Bold blue) as SVG. Pure: shared by the browser preview
 * in the menu designer and the server PNG (lib/server/menu-render.ts), so both draw the same board.
 */
import type { MenuContent, MenuSection, MenuTemplate } from "@/lib/menu-templates";
import { shownSections } from "@/lib/menu-fields";
import { boardFont } from "@/lib/board-fonts";
import { safeDesignHref } from "@/lib/menu-design-svg";

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

export type MenuArt = {
  brand?: { primaryColor: string; accentColor: string } | null;
  logo?: string | null; // data URI (PNG/JPEG)
  photo?: string | null; // data URI (PNG/JPEG)
  /** Item photos by media id (data URIs). Only this account's own images; a missing one draws a quiet tile. */
  itemImages?: Record<string, string>;
};

/** Item photos show beside their items unless the board hides them. Boards without item photos are unchanged. */
export function classicItemPhotosShown(content: MenuContent): boolean {
  return content.itemPhotos !== false && content.sections.some((section) => section.items.some((item) => Boolean(item.imageMediaId)));
}

function rgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function hex([r, g, b]: number[]) {
  return "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
}
export function luminance(color: string) {
  const [r, g, b] = rgb(color).map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}
export function mix(a: string, b: string, t: number) {
  const [x, y] = [rgb(a), rgb(b)];
  return hex(x.map((v, i) => v + (y[i] - v) * t));
}
/** Nudge a colour toward white or black until it reads on the background (≥ min contrast). */
export function readable(color: string, bg: string, min = 3) {
  const toward = luminance(bg) < 0.4 ? "#ffffff" : "#0b1220";
  for (let t = 0; t <= 1.0001; t += 0.1) {
    const c = mix(color, toward, t);
    if (contrast(c, bg) >= min) return c;
  }
  return toward;
}
export const onColor = (bg: string) => (contrast("#ffffff", bg) >= contrast("#0b1220", bg) ? "#ffffff" : "#0b1220");

export function themeFor(template: MenuTemplate, brand?: MenuArt["brand"]): Theme {
  const base = THEMES[template];
  if (!brand) return base;
  const p = brand.primaryColor, a = brand.accentColor;
  if (template === "classic") {
    return { ...base, section: readable(p, base.bg, 4.5) };
  }
  if (template === "fresh") {
    const on = onColor(p);
    return { ...base, band: p, title: on, subtitle: mix(p, on, 0.82), section: readable(p, base.bg, 4.5) };
  }
  const on = onColor(p);
  const muted = on === "#ffffff" ? mix(p, "#ffffff", 0.75) : mix(p, "#0b1220", 0.7);
  return {
    ...base, bg: p, bg2: mix(p, "#000000", 0.3), title: on, subtitle: muted, text: on, muted,
    section: contrast(a, p) >= 3 ? a : on, priceBg: a, price: onColor(a), rule: mix(p, on, 0.25), footer: muted,
  };
}

export function esc(s: string) {
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
export function columnsFor(sections: MenuSection[], singleUpTo = 9): MenuSection[][] {
  const total = sections.reduce((n, s) => n + units(s), 0);
  if (total <= singleUpTo && (sections.length <= 1 || singleUpTo > 9)) return [sections];
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

/**
 * E6-F1: per-board fonts. Boards without headingFont/bodyFont get no font-family attribute at all,
 * so their SVG (and PNG) is byte-for-byte what it was. Width estimates scale for wider faces.
 */
function faces(content: MenuContent) {
  const face = (id: MenuContent["headingFont"]) => {
    if (!id) return { attr: "", scale: 1 };
    const spec = boardFont(id);
    return { attr: ` font-family="${spec.family}"`, scale: spec.widthScale };
  };
  return { heading: face(content.headingFont), body: face(content.bodyFont) };
}

export function menuSvg(template: MenuTemplate, content: MenuContent, art: MenuArt = {}) {
  const t = themeFor(template, content.useBrand === false ? null : art.brand);
  const f = faces(content);
  const hf = f.heading.attr, bf = f.body.attr;
  const hs = f.heading.scale, bs = f.body.scale;
  const H = MENU_HEIGHT, pad = 96;
  const photoW = art.photo ? Math.round(MENU_WIDTH * 0.38) : 0;
  const W = MENU_WIDTH - photoW; // content area; the photo fills the right side
  const logoBox = art.logo ? (art.photo ? { w: 220, h: 100 } : { w: 300, h: 120 }) : null;
  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${MENU_WIDTH}" height="${H}" viewBox="0 0 ${MENU_WIDTH} ${H}">`);
  out.push(`<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${t.bg}"/><stop offset="1" stop-color="${t.bg2}"/></linearGradient></defs>`);
  out.push(`<rect width="${MENU_WIDTH}" height="${H}" fill="url(#g)"/>`);
  if (art.photo) {
    out.push(`<clipPath id="photo"><rect x="${W}" y="0" width="${photoW}" height="${H}"/></clipPath>`);
    out.push(`<image href="${esc(art.photo)}" x="${W}" y="0" width="${photoW}" height="${H}" preserveAspectRatio="xMidYMid slice" clip-path="url(#photo)"/>`);
  }

  const hasHeader = Boolean(content.title || content.subtitle);
  const headerH = hasHeader ? (content.subtitle ? 250 : 200) : 60;
  if (t.band && hasHeader) out.push(`<rect width="${W}" height="${headerH}" fill="${t.band}"/>`);
  if (!t.band) out.push(`<rect x="${pad}" y="${headerH - 24}" width="${hasHeader ? 160 : 0}" height="8" rx="4" fill="${t.section}"/>`);
  const titleW = W - 2 * pad - (logoBox ? logoBox.w + 40 : 0);
  if (content.title) {
    // Shrink long titles further (down to 40) before shortening them with "…" (QA B1-06).
    let size = 96;
    while (size > 40 && approxWidth(content.title, size, 800) * hs > titleW) size -= 4;
    out.push(`<text x="${pad}" y="${content.subtitle ? 140 : 145}"${hf} font-size="${size}" font-weight="800" fill="${t.title}">${esc(fit(content.title, size, titleW / hs, 800))}</text>`);
  }
  if (content.subtitle) {
    out.push(`<text x="${pad}" y="${200}" font-size="40"${bf} fill="${t.subtitle}">${esc(fit(content.subtitle, 40, titleW / bs))}</text>`);
  }
  if (art.logo && logoBox) {
    const ly = hasHeader ? Math.max(30, (headerH - logoBox.h) / 2 - 6) : 30;
    out.push(`<image href="${esc(art.logo)}" x="${W - pad - logoBox.w}" y="${ly}" width="${logoBox.w}" height="${logoBox.h}" preserveAspectRatio="xMaxYMid meet"/>`);
  }

  const top = headerH + 70;
  const bottom = H - (content.footer ? 120 : 70);
  const cols = columnsFor(shownSections(content.sections), art.photo ? 11 : 9); // QA B1-04: no headings for empty sections
  const gap = 120;
  const colW = (W - 2 * pad - gap * (cols.length - 1)) / cols.length;
  const maxUnits = Math.max(1, ...cols.map((c) => c.reduce((n, s) => n + units(s), 0)));
  const u = Math.min(cols.length === 1 ? 92 : 86, (bottom - top) / maxUnits);
  const nameSize = Math.round(Math.min(48, u * 0.52));
  const descSize = Math.round(Math.min(30, u * 0.34));
  const sectionSize = Math.round(Math.min(40, u * 0.46));

  const photosOn = classicItemPhotosShown(content);
  let clipN = 0;
  cols.forEach((col, ci) => {
    const x0 = pad + ci * (colW + gap);
    let y = top;
    for (const section of col) {
      // Compact thumbnails: only sections with a photo make room for them, so their names stay aligned.
      const thumbs = photosOn && section.items.some((item) => Boolean(item.imageMediaId));
      let x = x0;
      let colW2 = colW;
      if (section.name) {
        y += u * 0.8;
        out.push(`<text x="${x0}" y="${y.toFixed(1)}" font-size="${sectionSize}"${hf} font-weight="800" letter-spacing="3" fill="${t.section}">${esc(fit(section.name.toUpperCase(), sectionSize, colW / hs, 800))}</text>`);
        out.push(`<rect x="${x0}" y="${(y + u * 0.2).toFixed(1)}" width="${colW}" height="2" fill="${t.rule}"/>`);
        y += u * 0.5;
      }
      for (const item of section.items) {
        y += u * 0.78;
        if (thumbs) {
          const top = y - nameSize * 0.85;
          const size = Math.round((item.description ? y + u * 0.55 + descSize * 0.25 : y + nameSize * 0.3) - top);
          // One text indent per section (the tallest thumbnail), so every name in it lines up.
          const tallest = Math.round(section.items.some((it) => it.description) ? nameSize * 0.85 + u * 0.55 + descSize * 0.25 : nameSize * 1.15);
          const shift = tallest + Math.max(14, Math.round(tallest * 0.24));
          x = x0 + shift;
          colW2 = colW - shift;
          const href = safeDesignHref(item.imageMediaId ? art.itemImages?.[item.imageMediaId] : undefined);
          const r = Math.round(size * 0.18);
          if (item.imageMediaId) {
            const id = `ip${clipN++}`;
            out.push(`<clipPath id="${id}"><rect x="${x0}" y="${top.toFixed(1)}" width="${size}" height="${size}" rx="${r}"/></clipPath>`);
            out.push(`<rect x="${x0}" y="${top.toFixed(1)}" width="${size}" height="${size}" rx="${r}" fill="${t.rule}"/>`);
            if (href) out.push(`<image href="${esc(href)}" x="${x0}" y="${top.toFixed(1)}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/>`);
          }
        }
        const priceW = item.price ? approxWidth(item.price, nameSize, 700) * bs + (t.priceBg ? 36 : 0) : 0;
        if (item.price) {
          if (t.priceBg) {
            out.push(`<rect x="${(x0 + colW - priceW).toFixed(1)}" y="${(y - nameSize * 0.95).toFixed(1)}" width="${priceW.toFixed(1)}" height="${(nameSize * 1.3).toFixed(1)}" rx="${(nameSize * 0.3).toFixed(1)}" fill="${t.priceBg}"/>`);
            out.push(`<text x="${(x0 + colW - 18).toFixed(1)}" y="${y.toFixed(1)}" text-anchor="end" font-size="${nameSize}"${bf} font-weight="700" fill="${t.price}">${esc(item.price)}</text>`);
          } else {
            out.push(`<text x="${(x0 + colW).toFixed(1)}" y="${y.toFixed(1)}" text-anchor="end" font-size="${nameSize}"${bf} font-weight="700" fill="${t.price}">${esc(item.price)}</text>`);
          }
        }
        out.push(`<text x="${x}" y="${y.toFixed(1)}" font-size="${nameSize}"${bf} font-weight="700" fill="${t.text}">${esc(fit(item.name, nameSize, (colW2 - priceW - 32) / bs, 700))}</text>`);
        if (item.description) {
          y += u * 0.55;
          out.push(`<text x="${x}" y="${y.toFixed(1)}" font-size="${descSize}"${bf} fill="${t.muted}">${esc(fit(item.description, descSize, (colW2 - priceW - 32) / bs))}</text>`);
        }
        y += u * 0.22;
      }
      y += u * 0.5;
    }
  });

  if (content.footer) {
    out.push(`<rect x="${pad}" y="${H - 104}" width="${W - 2 * pad}" height="2" fill="${t.rule}"/>`);
    out.push(`<text x="${pad}" y="${H - 50}" font-size="34"${bf} fill="${t.footer}">${esc(fit(content.footer, 34, (W - 2 * pad) / bs))}</text>`);
  }
  out.push(`</svg>`);
  return out.join("");
}

