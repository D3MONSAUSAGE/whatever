/**
 * Premium template renderer. Pure, shared by the browser preview and the server PNG (resvg): both draw this SVG
 * with the same bundled font files, and text is measured from those files' advance widths
 * (lib/board-font-metrics.ts), so wrapping, sizing and alignment are identical on the TV and in the editor.
 *
 * Only documents with a `design` id reach this file; every older board keeps the original renderer.
 */
import { FONT_METRICS } from "@/lib/board-font-metrics";
import { boardFont, type BoardFontId } from "@/lib/board-fonts";
import { designById, designVariant, type MenuDesign } from "@/lib/menu-designs";
import type { LayoutDocument, LayoutSection, ZoneBox } from "@/lib/layout-studio";

const W = 1920;
const H = 1080;

/* ---------------- colour and readability ---------------- */

function rgb(hex: string) { return [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)); }
function channel(v: number) { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }
export function luminance(hex: string) { const [r, g, b] = rgb(hex).map(channel); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
export function contrast(a: string, b: string) { const x = luminance(a); const y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
export function mix(a: string, b: string, k: number) {
  const x = rgb(a); const y = rgb(b);
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * k).toString(16).padStart(2, "0")).join("")}`;
}
/** Nudge fg toward black or white (whichever the background favours) until it reaches `min`. */
export function readableOn(fg: string, bg: string, min: number): { color: string; adjusted: boolean } {
  if (contrast(fg, bg) >= min) return { color: fg, adjusted: false };
  const toward = luminance(bg) > 0.4 ? "#000000" : "#ffffff";
  for (let k = 0.05; k <= 1.0001; k += 0.05) {
    const c = mix(fg, toward, k);
    if (contrast(c, bg) >= min) return { color: c, adjusted: true };
  }
  return { color: toward, adjusted: true };
}
function bestInk(bg: string, preferred?: string) {
  if (preferred && contrast(preferred, bg) >= 4.5) return preferred;
  return contrast("#ffffff", bg) >= contrast("#111111", bg) ? "#ffffff" : "#111111";
}

export type DesignCheck = { key: "text" | "details" | "headings" | "prices" | "feature"; ratio: number; adjusted: boolean };
export type DesignColors = { paper: string; ink: string; muted: string; accent: string; panel: string; panelInk: string; tag: string; tagInk: string; priceInk: string; checks: DesignCheck[] };

/**
 * Colours for a design board: the chosen colour style, then the board's own overrides (Brand Kit or advanced
 * editor), then automatic readability: body text ≥ 4.5:1, headings ≥ 3:1, text on panels and tags ≥ 4.5:1.
 */
export function designColors(doc: LayoutDocument, design: MenuDesign): DesignColors {
  const base = designVariant(design, doc.variant);
  const paper = doc.backgroundColor || base.paper;
  const panelRaw = doc.primaryColor || base.panel;
  const accentRaw = doc.accentColor || base.accent;
  const tagRaw = doc.accentColor || base.tag || base.accent;
  const ink = readableOn(doc.textColor || base.ink, paper, 4.5);
  const muted = readableOn(doc.textColor ? mix(doc.textColor, paper, 0.3) : base.muted, paper, 4.5);
  const accent = readableOn(accentRaw, paper, 3);
  const tagFirst = design.look.tags ? readableOn(tagRaw, paper, 1.6) : { color: tagRaw, adjusted: false };
  // Text on a panel or a price tag is white or near-black; when neither reaches 4.5:1 the fill itself moves
  // a little darker or lighter (brand colours included) so the words stay readable on the TV.
  const tagInk = bestInk(tagFirst.color, design.look.tags ? base.paper : undefined);
  const tagFix = readableOn(tagFirst.color, tagInk, 4.5);
  const tag = { color: tagFix.color, adjusted: tagFirst.adjusted || tagFix.adjusted };
  const panelInk = bestInk(panelRaw);
  const panelFix = readableOn(panelRaw, panelInk, 4.5);
  const panel = panelFix.color;
  const priceInk = design.look.tags ? tagInk : design.look.accentPrices ? accent.color : ink.color;
  const priceBg = design.look.tags ? tag.color : paper;
  const checks: DesignCheck[] = [
    { key: "text", ratio: contrast(ink.color, paper), adjusted: ink.adjusted },
    { key: "details", ratio: contrast(muted.color, paper), adjusted: muted.adjusted },
    { key: "headings", ratio: contrast(accent.color, paper), adjusted: accent.adjusted },
    { key: "prices", ratio: contrast(priceInk, priceBg), adjusted: tag.adjusted },
  ];
  if (design.composition !== "showcase") checks.push({ key: "feature", ratio: contrast(panelInk, panel), adjusted: panelFix.adjusted });
  return { paper, ink: ink.color, muted: muted.color, accent: accent.color, panel, panelInk, tag: tag.color, tagInk, priceInk, checks };
}

/* ---------------- text measurement from the font files ---------------- */

function metricsFor(family: string, weight: number) {
  const keys = Object.keys(FONT_METRICS).filter((k) => k.startsWith(`${family}|`));
  if (!keys.length) return FONT_METRICS["Inter|400"];
  let best = keys[0]; let gap = Infinity;
  for (const key of keys) {
    const w = Number(key.split("|")[1]);
    const d = Math.abs(w - weight) + (w < weight ? 0.5 : 0);
    if (d < gap) { gap = d; best = key; }
  }
  return FONT_METRICS[best];
}
export function textWidth(value: string, size: number, family: string, weight: number, tracking = 0) {
  const m = metricsFor(family, weight);
  let units = 0; let count = 0;
  for (const ch of value) { units += m[ch] ?? m.n ?? 550; count += 1; }
  return (units * size) / 1000 + tracking * size * count;
}
function ellipsize(value: string, size: number, family: string, weight: number, max: number, tracking = 0) {
  if (textWidth(value, size, family, weight, tracking) <= max) return value;
  const chars = [...value];
  while (chars.length > 1 && textWidth(`${chars.join("").trimEnd()}…`, size, family, weight, tracking) > max) chars.pop();
  return `${chars.join("").trimEnd()}…`;
}
/** Greedy word wrap into at most maxLines; the last line ends in "…" only when the text truly does not fit. */
export function wrapText(value: string, size: number, family: string, weight: number, max: number, maxLines: number, tracking = 0): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (let index = 0; index < words.length; index++) {
    const word = words[index];
    const next = line ? `${line} ${word}` : word;
    if (textWidth(next, size, family, weight, tracking) <= max || !line) {
      line = next;
      continue;
    }
    lines.push(line);
    line = word;
    if (lines.length === maxLines - 1) {
      line = words.slice(index).join(" ");
      break;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, maxLines).map((l, i, all) => (i === all.length - 1 ? ellipsize(l, size, family, weight, max, tracking) : ellipsize(l, size, family, weight, max, tracking)));
}

/* ---------------- svg helpers ---------------- */

function esc(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}
const n = (v: number) => (Math.round(v * 10) / 10).toString();
type TextOpts = { size: number; family: string; weight: number; fill: string; anchor?: "start" | "end" | "middle"; tracking?: number; opacity?: number; transform?: string };
function text(x: number, y: number, value: string, o: TextOpts) {
  const ls = o.tracking ? ` letter-spacing="${n(o.tracking * o.size)}"` : "";
  const anchor = o.anchor && o.anchor !== "start" ? ` text-anchor="${o.anchor}"` : "";
  const op = o.opacity != null && o.opacity < 1 ? ` fill-opacity="${o.opacity}"` : "";
  const tf = o.transform ? ` transform="${o.transform}"` : "";
  return `<text x="${n(x)}" y="${n(y)}" font-family="${esc(o.family)}" font-size="${n(o.size)}" font-weight="${o.weight}" fill="${o.fill}"${ls}${anchor}${op}${tf}>${esc(value)}</text>`;
}
function rect(x: number, y: number, w: number, h: number, fill: string, extra = "") {
  return `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${fill}"${extra ? ` ${extra}` : ""}/>`;
}
/** A photo/logo href the renderer may paint: data URIs, https, or a bundled stock path. */
export function safeDesignHref(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=\s]+$/i.test(value)) return value.replace(/\s/g, "");
  if (/^https:\/\/[^\s"'<>]+$/i.test(value)) return value;
  if (/^\/menu-templates\/[a-z]+\.jpg$/.test(value)) return value;
  return null;
}
function aspect(doc: LayoutDocument) {
  const fit = doc.imageFit === "contain" ? "meet" : "slice";
  const a = doc.imageAnchor;
  return `${a === "left" ? "xMin" : a === "right" ? "xMax" : "xMid"}${a === "top" ? "YMin" : a === "bottom" ? "YMax" : "YMid"} ${fit}`;
}

/* ---------------- menu block layout ---------------- */

type Fam = { family: string; weight: number };
type Style = {
  name: Fam & { size: number; upper: boolean };
  price: Fam & { size: number };
  desc: Fam & { size: number };
  section: Fam & { size: number; tracking: number; upper: boolean };
  itemGap: number; sectionGap: number; headGap: number;
  leader: boolean; rule: boolean; tags: boolean;
};
type PlacedItem = { lines: string[]; desc: string[]; price: string; priceW: number; h: number };
type PlacedSection = { name: string; items: PlacedItem[]; headH: number; h: number };
type Column = { sections: PlacedSection[]; h: number };

function scaled(base: Style, s: number): Style {
  return {
    ...base,
    name: { ...base.name, size: base.name.size * s }, price: { ...base.price, size: base.price.size * s }, desc: { ...base.desc, size: base.desc.size * s },
    section: { ...base.section, size: base.section.size * s },
    itemGap: base.itemGap * s, sectionGap: base.sectionGap * s, headGap: base.headGap * s,
  };
}
function tagPad(st: Style) { return st.price.size * 0.32; }
function measureSection(section: LayoutSection, colW: number, st: Style): PlacedSection {
  const items: PlacedItem[] = [];
  for (const item of section.items) {
    if (!item.name.trim()) continue;
    const name = st.name.upper ? item.name.toUpperCase() : item.name;
    const price = item.price || "";
    const priceW = price ? textWidth(price, st.price.size, st.price.family, st.price.weight) + (st.tags ? tagPad(st) * 2 : 0) : 0;
    const room = Math.max(colW * 0.4, colW - priceW - (st.leader ? st.name.size * 1.1 : st.name.size * 0.6));
    const lines = wrapText(name, st.name.size, st.name.family, st.name.weight, room, 2, st.name.upper ? 0.02 : 0);
    const desc = item.description ? wrapText(item.description, st.desc.size, st.desc.family, st.desc.weight, colW - (st.tags ? 0 : 0), 2) : [];
    const lineH = st.name.size * 1.17;
    const tagH = st.tags && price ? st.price.size * 1.25 : 0;
    const h = Math.max(lines.length * lineH, tagH) + (desc.length ? st.desc.size * 0.32 + desc.length * st.desc.size * 1.32 : 0) + st.itemGap;
    items.push({ lines, desc, price, priceW, h });
  }
  const headH = section.name ? st.section.size * 1.05 + (st.rule ? st.section.size * 0.45 + 2 : 0) + st.headGap : 0;
  return { name: section.name, items, headH, h: headH + items.reduce((a, i) => a + i.h, 0) };
}
/** Sections in order, kept whole, into `cols` columns of height `colH`. Null when they do not fit. */
function flow(sections: PlacedSection[], cols: number, colH: number, st: Style): Column[] | null {
  const out: Column[] = [{ sections: [], h: 0 }];
  for (const section of sections) {
    let col = out[out.length - 1];
    const gap = col.sections.length ? st.sectionGap : 0;
    if (col.h + gap + section.h > colH) {
      if (out.length === cols || !col.sections.length) return null;
      col = { sections: [], h: 0 };
      out.push(col);
    }
    col.h += (col.sections.length ? st.sectionGap : 0) + section.h;
    col.sections.push(section);
  }
  return out;
}
/** Balance two or three columns: keep the flow but try to even out the heights. */
function balanced(sections: PlacedSection[], cols: number, colH: number, st: Style): Column[] | null {
  const total = sections.reduce((a, s) => a + s.h, 0) + Math.max(0, sections.length - 1) * st.sectionGap;
  for (let target = Math.min(colH, total / cols + 1); target <= colH + 0.5; target += 12) {
    const res = flow(sections, cols, Math.min(colH, target), st);
    if (res) return res;
  }
  return flow(sections, cols, colH, st);
}

export type FitResult = { style: Style; columns: Column[]; cols: number; scale: number; dropped: number };
function fit(sectionsIn: LayoutSection[], base: Style, options: { cols: number; colW: number }[], colH: number, maxScale: number, minScale: number, preferFewerAbove = 0.9): FitResult {
  const sections = sectionsIn.filter((s) => s.items.some((i) => i.name.trim()) || false);
  const wraps = (placed: PlacedSection[]) => placed.reduce((a, sec) => a + sec.items.reduce((b, it) => b + it.lines.length + it.desc.length, 0), 0);
  let best: FitResult | null = null;
  for (const opt of options) {
    // Lines at the design size: a short menu may grow, but only while names and descriptions don't wrap more.
    const designLines = wraps(sections.map((sec) => measureSection(sec, opt.colW, scaled(base, 1))));
    for (let s = maxScale; s >= minScale - 1e-6; s -= 0.02) {
      const st = scaled(base, s);
      const placed = sections.map((sec) => measureSection(sec, opt.colW, st));
      if (s > 1 && wraps(placed) > designLines) continue;
      const cols = opt.cols > 1 ? balanced(placed, opt.cols, colH, st) : flow(placed, 1, colH, st);
      if (cols) {
        const cand = { style: st, columns: cols, cols: opt.cols, scale: s, dropped: 0 };
        if (!best || (best.scale < preferFewerAbove && s > best.scale + 0.001)) best = cand;
        break;
      }
    }
    if (best && best.scale >= preferFewerAbove) break;
  }
  if (best) return best;
  // Too long even at the smallest size: draw what fits and report how many items were left off.
  const opt = options[options.length - 1];
  const st = scaled(base, minScale);
  const placed = sections.map((sec) => measureSection(sec, opt.colW, st));
  const columns: Column[] = [];
  let dropped = 0; let col: Column = { sections: [], h: 0 };
  for (const sec of placed) {
    const gap = col.sections.length ? st.sectionGap : 0;
    if (col.h + gap + sec.h <= colH) { col.sections.push(sec); col.h += gap + sec.h; continue; }
    if (columns.length + 1 < opt.cols) { columns.push(col); col = { sections: [sec], h: sec.h }; if (sec.h <= colH) continue; }
    // Partial section: keep the items that fit.
    const room = colH - col.h - (col.sections.length && col.sections[col.sections.length - 1] !== sec ? st.sectionGap : 0);
    const kept: PlacedItem[] = []; let used = sec.headH;
    for (const item of sec.items) { if (used + item.h <= room) { kept.push(item); used += item.h; } else dropped += 1; }
    if (col.sections[col.sections.length - 1] === sec) col.sections.pop();
    if (kept.length) { col.sections.push({ ...sec, items: kept, h: used }); col.h += used; }
  }
  columns.push(col);
  const shown = new Set(columns.flatMap((c) => c.sections.map((s) => s.name)));
  for (const sec of placed) if (!shown.has(sec.name)) dropped += sec.items.length;
  return { style: st, columns, cols: opt.cols, scale: minScale, dropped };
}

function paintColumns(parts: string[], result: FitResult, x0: number, top: number, colW: number, gap: number, c: DesignColors) {
  const st = result.style;
  result.columns.forEach((col, ci) => {
    const x = x0 + ci * (colW + gap);
    let y = top;
    col.sections.forEach((sec, si) => {
      if (si > 0) y += st.sectionGap;
      if (sec.name) {
        const label = st.section.upper ? sec.name.toUpperCase() : sec.name;
        const base = y + st.section.size * 0.82;
        parts.push(text(x, base, ellipsize(label, st.section.size, st.section.family, st.section.weight, colW, st.section.tracking), { size: st.section.size, family: st.section.family, weight: st.section.weight, fill: c.accent, tracking: st.section.tracking }));
        y += st.section.size * 1.05;
        if (st.rule) { y += st.section.size * 0.45; parts.push(rect(x, y, colW, 2, mix(c.accent, c.paper, 0.55))); y += 2; }
        y += st.headGap;
      }
      for (const item of sec.items) {
        const lineH = st.name.size * 1.17;
        const tagH = st.tags && item.price ? st.price.size * 1.25 : 0;
        const first = y + (tagH > lineH ? (tagH - lineH) / 2 : 0) + st.name.size * 0.86;
        item.lines.forEach((line, li) => {
          parts.push(text(x, first + li * lineH, line, { size: st.name.size, family: st.name.family, weight: st.name.weight, fill: c.ink, tracking: st.name.upper ? 0.02 : 0 }));
        });
        if (item.price) {
          if (st.tags) {
            const th = st.price.size * 1.25;
            const ty = y + Math.max(0, (Math.max(lineH, th) - th) / 2) + (tagH > lineH ? 0 : (lineH - th) / 2);
            parts.push(rect(x + colW - item.priceW, ty, item.priceW, th, c.tag, `rx="${n(st.price.size * 0.22)}"`));
            parts.push(text(x + colW - item.priceW / 2, ty + th / 2 + st.price.size * 0.36, item.price, { size: st.price.size, family: st.price.family, weight: st.price.weight, fill: c.tagInk, anchor: "middle" }));
          } else {
            parts.push(text(x + colW, first, item.price, { size: st.price.size, family: st.price.family, weight: st.price.weight, fill: c.priceInk, anchor: "end" }));
          }
        }
        if (st.leader && item.price && item.lines.length === 1) {
          const nameEnd = x + textWidth(item.lines[0], st.name.size, st.name.family, st.name.weight) + st.name.size * 0.4;
          const end = x + colW - item.priceW - st.name.size * 0.4;
          if (end - nameEnd > st.name.size) {
            const ly = first - st.name.size * 0.08;
            parts.push(`<line x1="${n(nameEnd)}" y1="${n(ly)}" x2="${n(end)}" y2="${n(ly)}" stroke="${mix(c.muted, c.paper, 0.35)}" stroke-width="${n(Math.max(2, st.name.size * 0.075))}" stroke-dasharray="0.1 ${n(st.name.size * 0.24)}" stroke-linecap="round"/>`);
          }
        }
        let dy = y + Math.max(item.lines.length * lineH, tagH);
        if (item.desc.length) {
          dy += st.desc.size * 0.32;
          item.desc.forEach((line, di) => {
            parts.push(text(x, dy + st.desc.size * 0.95 + di * st.desc.size * 1.32, line, { size: st.desc.size, family: st.desc.family, weight: st.desc.weight, fill: c.muted }));
          });
        }
        y += item.h;
      }
    });
  });
}

/* ---------------- header and logo ---------------- */

function fitTitle(value: string, max: number, start: number, min: number, family: string, weight: number, tracking = 0) {
  let size = start;
  while (size > min && textWidth(value, size, family, weight, tracking) > max) size -= 2;
  return { size, value: ellipsize(value, size, family, weight, max, tracking) };
}
function logo(parts: string[], href: string | null, x: number, y: number, size: number, bg: string) {
  if (!href) return 0;
  // Logos are drawn on a light tile when the board is dark, so dark logos stay visible.
  if (luminance(bg) < 0.25) parts.push(rect(x, y, size, size, "#ffffff", `rx="${n(size * 0.16)}"`));
  const pad = luminance(bg) < 0.25 ? size * 0.1 : 0;
  parts.push(`<image href="${esc(href)}" x="${n(x + pad)}" y="${n(y + pad)}" width="${n(size - pad * 2)}" height="${n(size - pad * 2)}" preserveAspectRatio="xMidYMid meet"/>`);
  return size;
}

/* ---------------- compositions ---------------- */

export type DesignArt = { imageHref?: string | null; logoHref?: string | null; stockHref?: string | null };
export type DesignReport = { dropped: number; scale: number };

function family(id: BoardFontId) { return boardFont(id).family; }
function fonts(doc: LayoutDocument, design: MenuDesign) {
  const head = family(doc.font ?? design.look.head);
  const body = family(doc.bodyFont ?? doc.font ?? design.look.body);
  return { head, body };
}
function photoHref(doc: LayoutDocument, art?: DesignArt) {
  return safeDesignHref(art?.imageHref) ?? (doc.stockPhoto ? safeDesignHref(art?.stockHref ?? `/menu-templates/${doc.stockPhoto}.jpg`) : null);
}
function baseStyle(design: MenuDesign, f: { head: string; body: string }, sizes: { name: number; price: number; desc: number; section: number; itemGap: number; sectionGap: number; headGap: number }): Style {
  const L = design.look;
  const headW = L.headWeight;
  return {
    name: { family: f.body, weight: L.namesUpper ? 800 : 700, size: sizes.name, upper: !!L.namesUpper },
    // Condensed display faces make great price tags; a script or wide heading face does not, so tags use the body face.
    price: L.tags ? (L.head === "bebas-neue" || L.head === "oswald" ? { family: f.head, weight: headW, size: sizes.price } : { family: f.body, weight: 800, size: sizes.price * 0.92 }) : { family: f.body, weight: 700, size: sizes.price },
    desc: { family: f.body, weight: 400, size: sizes.desc },
    section: { family: L.sectionInHead ? f.head : f.body, weight: L.sectionWeight, size: sizes.section, tracking: L.sectionTracking, upper: true },
    itemGap: sizes.itemGap, sectionGap: sizes.sectionGap, headGap: sizes.headGap,
    leader: !!L.leader, rule: !!L.rule, tags: !!L.tags,
  };
}

/** Where a muted video may play on a design board (null when the design has no media area). */
export function designVideoBox(doc: LayoutDocument): ZoneBox | null {
  const design = designById(doc.design);
  if (!design) return null;
  if (design.composition === "showcase") {
    const band = (doc.featureTitle || doc.featureDetail || "").trim() ? 200 : 0;
    return { x: 1140, y: 0, w: W - 1140, h: H - band };
  }
  if (design.composition === "columns") return { x: 1344, y: 0, w: W - 1344, h: 640 };
  if (design.composition === "promo") return { x: 1260, y: 0, w: W - 1260, h: 713 };
  return null;
}

function showcase(parts: string[], doc: LayoutDocument, design: MenuDesign, c: DesignColors, f: { head: string; body: string }, art: DesignArt | undefined): DesignReport {
  const L = 1140; const x0 = 90; const top = 92;
  parts.push(rect(0, 0, W, H, c.paper));
  const photo = photoHref(doc, art);
  if (photo) {
    parts.push(`<image href="${esc(photo)}" x="${L}" y="0" width="${W - L}" height="${H}" preserveAspectRatio="${aspect(doc)}"/>`);
    parts.push(`<defs><linearGradient id="dg-fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0.44" stop-color="${c.paper}" stop-opacity="0"/><stop offset="0.86" stop-color="${c.paper}" stop-opacity="0.95"/><stop offset="1" stop-color="${c.paper}" stop-opacity="0.98"/></linearGradient></defs>`);
    parts.push(rect(L, 0, W - L, H, "url(#dg-fade)"));
  } else {
    parts.push(rect(L, 0, W - L, H, c.panel));
  }
  // Header
  const logoSize = logo(parts, safeDesignHref(art?.logoHref), x0, top, 104, c.paper);
  const tx = x0 + (logoSize ? logoSize + 28 : 0);
  const maxW = L - x0 - 90 - (logoSize ? logoSize + 28 : 0);
  const t = fitTitle(doc.title || "", maxW, 86, 52, f.head, design.look.headWeight);
  const titleBase = top + t.size * 0.84 + (logoSize ? Math.max(0, (104 - t.size * 1.6) / 2) : 0);
  if (t.value) parts.push(text(tx, titleBase, t.value, { size: t.size, family: f.head, weight: design.look.headWeight, fill: c.ink }));
  let headBottom = titleBase + t.size * 0.22;
  if (doc.subtitle) {
    const sub = ellipsize(doc.subtitle.toUpperCase(), 24, f.body, 700, maxW, 0.22);
    parts.push(text(tx, titleBase + 50, sub, { size: 24, family: f.body, weight: 700, fill: c.accent, tracking: 0.22 }));
    headBottom = titleBase + 58;
  }
  headBottom = Math.max(headBottom, logoSize ? top + logoSize : 0);
  parts.push(rect(x0, headBottom + 40, 180, 2, mix(c.accent, c.paper, 0.6)));
  const menuTop = headBottom + 84;
  const footerH = doc.footer ? 52 : 0;
  const colH = H - 70 - footerH - menuTop;
  const base = baseStyle(design, f, { name: 38, price: 38, desc: 25, section: 30, itemGap: 22, sectionGap: 44, headGap: 24 });
  const avail = L - x0 - 90;
  const result = fit(doc.sections, base, [{ cols: 1, colW: avail }, { cols: 2, colW: (avail - 64) / 2 }], colH, 1.25, 0.55, 0.9);
  paintColumns(parts, result, x0, menuTop, result.cols === 1 ? avail : (avail - 64) / 2, 64, c);
  if (doc.footer) parts.push(text(x0, H - 56, ellipsize(doc.footer, 24, f.head, 400, avail), { size: 24, family: f.head, weight: 400, fill: c.muted }));
  // Feature text on the photo's lower band (the video box ends above it).
  const title = (doc.featureTitle || "").trim(); const detail = (doc.featureDetail || "").trim();
  if (title || detail) {
    const fx = L + 64; const fw = W - L - 128;
    const onPanel = !photo;
    const ink = onPanel ? c.panelInk : c.ink;
    const lines = detail ? wrapText(detail, 40, f.head, 400, fw, 2) : [];
    const y = H - 60 - (lines.length - 1) * 50;
    lines.forEach((line, i) => parts.push(text(fx, y + i * 50, line, { size: 40, family: f.head, weight: 400, fill: ink })));
    if (title) parts.push(text(fx, (lines.length ? y : H - 60) - (lines.length ? 64 : 0), ellipsize(title.toUpperCase(), 22, f.body, 700, fw, 0.24), { size: 22, family: f.body, weight: 700, fill: onPanel ? c.panelInk : c.accent, tracking: 0.24 }));
  }
  return { dropped: result.dropped, scale: result.scale };
}

function columns(parts: string[], doc: LayoutDocument, design: MenuDesign, c: DesignColors, f: { head: string; body: string }, art: DesignArt | undefined): DesignReport {
  const L = 1344; const x0 = 84; const top = 80;
  parts.push(rect(0, 0, W, H, c.paper));
  const photo = photoHref(doc, art);
  if (photo) parts.push(`<image href="${esc(photo)}" x="${L}" y="0" width="${W - L}" height="640" preserveAspectRatio="${aspect(doc)}"/>`);
  else parts.push(rect(L, 0, W - L, 640, mix(c.panel, c.paper, 0.6)));
  parts.push(rect(L, 640, W - L, H - 640, c.panel));
  const logoSize = logo(parts, safeDesignHref(art?.logoHref), x0, top, 92, c.paper);
  const tx = x0 + (logoSize ? logoSize + 24 : 0);
  const maxW = L - x0 - 84 - (logoSize ? logoSize + 24 : 0);
  const t = fitTitle(doc.title || "", maxW, 68, 44, f.head, design.look.headWeight);
  const titleBase = top + t.size * 0.82 + (logoSize ? Math.max(0, (92 - t.size * 1.45) / 2) : 0);
  if (t.value) parts.push(text(tx, titleBase, t.value, { size: t.size, family: f.head, weight: design.look.headWeight, fill: c.ink }));
  let headBottom = titleBase + t.size * 0.22;
  if (doc.subtitle) {
    parts.push(text(tx, titleBase + 46, ellipsize(doc.subtitle, 26, f.body, 400, maxW), { size: 26, family: f.body, weight: 400, fill: c.muted }));
    headBottom = titleBase + 54;
  }
  headBottom = Math.max(headBottom, logoSize ? top + logoSize : 0);
  const menuTop = headBottom + 56;
  const footerH = doc.footer ? 62 : 0;
  const colH = H - 64 - footerH - menuTop;
  const avail = L - x0 - 84; const colW = (avail - 80) / 2;
  const base = baseStyle(design, f, { name: 36, price: 36, desc: 24, section: 30, itemGap: 20, sectionGap: 46, headGap: 22 });
  const result = fit(doc.sections, base, [{ cols: 2, colW }], colH, 1.3, 0.55);
  paintColumns(parts, result, x0, menuTop, colW, 80, c);
  if (doc.footer) {
    parts.push(rect(x0, H - 64 - 40, avail, 2, mix(c.muted, c.paper, 0.7)));
    parts.push(text(x0, H - 64, ellipsize(doc.footer, 22, f.body, 400, avail), { size: 22, family: f.body, weight: 400, fill: c.muted }));
  }
  const title = (doc.featureTitle || "").trim(); const detail = (doc.featureDetail || "").trim();
  if (title || detail) {
    const fx = L + 56; const fw = W - L - 112;
    const tl = title ? wrapText(title, 54, f.head, design.look.headWeight, fw, 2) : [];
    const dl = detail ? wrapText(detail, 28, f.body, 400, fw, 2) : [];
    const blockH = tl.length * 58 + (dl.length ? 16 + dl.length * 36 : 0);
    let y = 640 + (H - 640 - blockH) / 2;
    tl.forEach((line) => { parts.push(text(fx, y + 46, line, { size: 54, family: f.head, weight: design.look.headWeight, fill: c.panelInk })); y += 58; });
    if (dl.length) y += 16;
    dl.forEach((line) => { parts.push(text(fx, y + 27, line, { size: 28, family: f.body, weight: 400, fill: c.panelInk, opacity: 0.92 })); y += 36; });
  }
  return { dropped: result.dropped, scale: result.scale };
}

function promo(parts: string[], doc: LayoutDocument, design: MenuDesign, c: DesignColors, f: { head: string; body: string }, art: DesignArt | undefined): DesignReport {
  const L = 1260; const x0 = 80; const top = 70; const PH = 713;
  parts.push(rect(0, 0, W, H, c.paper));
  parts.push(rect(L, 0, W - L, H, c.panel));
  const photo = photoHref(doc, art);
  if (photo) {
    parts.push(`<image href="${esc(photo)}" x="${L}" y="0" width="${W - L}" height="${PH}" preserveAspectRatio="${aspect(doc)}"/>`);
    parts.push(`<defs><linearGradient id="dg-panel" x1="0" y1="0" x2="0" y2="1"><stop offset="0.55" stop-color="${c.panel}" stop-opacity="0"/><stop offset="1" stop-color="${c.panel}" stop-opacity="1"/></linearGradient></defs>`);
    parts.push(rect(L, 0, W - L, PH, "url(#dg-panel)"));
  }
  const logoSize = logo(parts, safeDesignHref(art?.logoHref), x0, top, 110, c.paper);
  const tx = x0 + (logoSize ? logoSize + 26 : 0);
  const maxW = L - x0 - 80 - (logoSize ? logoSize + 26 : 0);
  const upperTitle = (doc.title || "").toUpperCase();
  const t = fitTitle(upperTitle, maxW, 132, 72, f.head, design.look.headWeight, 0.01);
  const titleBase = top + t.size * 0.82;
  if (t.value) parts.push(text(tx, titleBase, t.value, { size: t.size, family: f.head, weight: design.look.headWeight, fill: c.ink, tracking: 0.01 }));
  let headBottom = titleBase + t.size * 0.12;
  if (doc.subtitle) {
    const chipText = ellipsize(doc.subtitle.toUpperCase(), 24, f.body, 800, maxW - 40, 0.08);
    const cw = textWidth(chipText, 24, f.body, 800, 0.08) + 28;
    const cy = titleBase + 22;
    parts.push(`<g transform="translate(${n(tx)} ${n(cy)}) skewX(-8)">${rect(0, 0, cw, 42, c.accent)}${text(14, 30, chipText, { size: 24, family: f.body, weight: 800, fill: bestInk(c.accent), tracking: 0.08 })}</g>`);
    headBottom = cy + 42;
  }
  headBottom = Math.max(headBottom, logoSize ? top + logoSize : 0);
  const menuTop = headBottom + 44;
  const footerH = doc.footer ? 46 : 0;
  const colH = H - 56 - footerH - menuTop;
  const avail = L - x0 - 80; const colW = (avail - 64) / 2;
  const base = baseStyle(design, f, { name: 38, price: 42, desc: 25, section: 62, itemGap: 22, sectionGap: 40, headGap: 18 });
  const result = fit(doc.sections, base, [{ cols: 2, colW }], colH, 1.25, 0.55);
  paintColumns(parts, result, x0, menuTop, colW, 64, c);
  if (doc.footer) parts.push(text(x0, H - 56, ellipsize(doc.footer.toUpperCase(), 22, f.body, 700, avail, 0.06), { size: 22, family: f.body, weight: 700, fill: c.muted, tracking: 0.06 }));
  // Feature panel: big headline, detail, and a price badge taken from the detail text.
  const title = (doc.featureTitle || "").trim(); const detail = (doc.featureDetail || "").trim();
  const price = (detail.match(/[$€£]\s?\d+(?:[.,]\d{1,2})?/) || [""])[0];
  const badgeInPanel = Boolean(doc.videoMediaId);
  const fx = L + 56; const fw = W - L - 112 - (badgeInPanel && price ? 210 : 0);
  if (title || detail) {
    const tl = title ? wrapText(title.toUpperCase(), 104, f.head, design.look.headWeight, fw, 2) : [];
    const dl = detail ? wrapText(detail, 30, f.body, 700, fw, 2) : [];
    const y = H - 64 - (dl.length ? (dl.length - 1) * 38 : 0);
    dl.forEach((line, i) => parts.push(text(fx, y + i * 38, line, { size: 30, family: f.body, weight: 700, fill: c.panelInk })));
    const ty = (dl.length ? y - 30 - 22 : H - 64) - (tl.length - 1) * 94;
    tl.forEach((line, i) => parts.push(text(fx, ty + i * 94, line, { size: 104, family: f.head, weight: design.look.headWeight, fill: c.panelInk })));
  }
  if (price) {
    const r = 95;
    const cx = W - 46 - r; const cy = badgeInPanel ? PH + 40 + r : 46 + r;
    const size = Math.min(58, (r * 1.55 * 1000) / Math.max(1, textWidth(price, 1000, f.head, design.look.headWeight)));
    parts.push(`<g transform="rotate(-10 ${n(cx)} ${n(cy)})"><circle cx="${n(cx)}" cy="${n(cy + 8)}" r="${r}" fill="#000000" fill-opacity="0.28"/><circle cx="${n(cx)}" cy="${n(cy)}" r="${r}" fill="${c.tag}"/>${text(cx, cy + size * 0.36, price, { size, family: f.head, weight: design.look.headWeight, fill: c.tagInk, anchor: "middle" })}</g>`);
  }
  return { dropped: result.dropped, scale: result.scale };
}

function list(parts: string[], doc: LayoutDocument, design: MenuDesign, c: DesignColors, f: { head: string; body: string }, art: DesignArt | undefined): DesignReport {
  const x0 = 80; const band = 200;
  parts.push(rect(0, 0, W, H, c.paper));
  parts.push(rect(0, 0, W, band, c.panel));
  parts.push(rect(0, band, W, 8, c.accent));
  const logoSize = logo(parts, safeDesignHref(art?.logoHref), x0, (band - 120) / 2, 120, c.panel);
  const tx = x0 + (logoSize ? logoSize + 30 : 0);
  const maxW = W - x0 - 80 - (logoSize ? logoSize + 30 : 0);
  const upper = design.look.head === "bebas-neue" || design.look.head === "oswald";
  const t = fitTitle(upper ? (doc.title || "").toUpperCase() : doc.title || "", maxW, 96, 56, f.head, design.look.headWeight);
  const hasSub = Boolean(doc.subtitle);
  const titleBase = hasSub ? 112 : band / 2 + t.size * 0.34;
  if (t.value) parts.push(text(tx, titleBase, t.value, { size: t.size, family: f.head, weight: design.look.headWeight, fill: c.panelInk }));
  if (hasSub) parts.push(text(tx, 160, ellipsize(doc.subtitle, 30, f.body, 400, maxW), { size: 30, family: f.body, weight: 400, fill: c.panelInk, opacity: 0.88 }));
  const menuTop = band + 8 + 60;
  const footerH = doc.footer ? 48 : 0;
  const colH = H - 56 - footerH - menuTop;
  const avail = W - x0 * 2; const gap = 72; const colW = (avail - gap * 2) / 3;
  const base = baseStyle(design, f, { name: 36, price: design.look.tags ? 38 : 36, desc: 24, section: design.look.head === "bebas-neue" ? 56 : 32, itemGap: 20, sectionGap: 44, headGap: 22 });
  const result = fit(doc.sections, base, [{ cols: 3, colW }], colH, 1.5, 0.55);
  paintColumns(parts, result, x0, menuTop, colW, gap, c);
  if (doc.footer) parts.push(text(x0, H - 52, ellipsize(doc.footer, 24, f.body, 400, avail), { size: 24, family: f.body, weight: 400, fill: c.muted }));
  return { dropped: result.dropped, scale: result.scale };
}

/** The full 1920×1080 board for a design document, plus how the text was fitted. */
export function designSvgWithReport(doc: LayoutDocument, art?: DesignArt): { svg: string; report: DesignReport } {
  const design = designById(doc.design)!;
  const c = designColors(doc, design);
  const f = fonts(doc, design);
  const parts: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`];
  const draw = { showcase, columns, promo, list }[design.composition];
  const report = draw(parts, doc, design, c, f, art);
  parts.push("</svg>");
  return { svg: parts.join(""), report };
}
export function designSvg(doc: LayoutDocument, art?: DesignArt): string {
  return designSvgWithReport(doc, art).svg;
}
