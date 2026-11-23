/**
 * Premium template renderer. Pure, shared by the browser preview and the server PNG (resvg): both draw this SVG
 * with the same bundled font files, and text is measured from those files' advance widths
 * (lib/board-font-metrics.ts), so wrapping, sizing and alignment are identical on the TV and in the editor.
 *
 * Only documents with a `design` id reach this file; every older board keeps the original renderer.
 */
import { FONT_METRICS } from "@/lib/board-font-metrics";
import { boardFont, type BoardFontId } from "@/lib/board-fonts";
import { designById, designVariant, isPhotoDesign, type MenuDesign } from "@/lib/menu-designs";
import type { LayoutDocument, LayoutItem, LayoutSection, ZoneBox } from "@/lib/layout-studio";
import { boardCanvas, orientationOf } from "@/lib/board-orientation";
import {
  activeCustom, emptyClips, fixedRegion, setRegionCanvas, focusPlacement, itemRegion, sectionHeadingStyle, sectionRegion, snapWeight, READABLE_FLOORS,
  type ActiveCustom, type BoardRegion, type ClipArea, type RoleKey,
} from "@/lib/board-custom";

// Canvas of the board being drawn: 1920×1080, or 1080×1920 for a vertical board (set per render, like `run`).
let W = 1920;
let H = 1080;
function isPortrait() { return H > W; }
/** Run `draw` with the canvas of this document's orientation, restoring the previous one afterwards. */
function onCanvas<T>(doc: LayoutDocument, draw: () => T): T {
  const prev = [W, H];
  const canvas = boardCanvas(orientationOf(doc));
  W = canvas.width; H = canvas.height;
  const prevRegions = setRegionCanvas(canvas);
  try { return draw(); } finally { W = prev[0]; H = prev[1]; setRegionCanvas(prevRegions); }
}

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

function metricsFor(family: string, weight: number, italic = false) {
  // Italic faces are keyed "Family|weight|i"; a family without italics measures with its upright faces.
  const all = Object.keys(FONT_METRICS).filter((k) => k.startsWith(`${family}|`));
  const italics = all.filter((k) => k.endsWith("|i"));
  const keys = italic && italics.length ? italics : all.filter((k) => !k.endsWith("|i"));
  if (!keys.length) return FONT_METRICS["Inter|400"];
  let best = keys[0]; let gap = Infinity;
  for (const key of keys) {
    const w = Number(key.split("|")[1]);
    const d = Math.abs(w - weight) + (w < weight ? 0.5 : 0);
    if (d < gap) { gap = d; best = key; }
  }
  return FONT_METRICS[best];
}
export function textWidth(value: string, size: number, family: string, weight: number, tracking = 0, italic = false) {
  const m = metricsFor(family, weight, italic);
  let units = 0; let count = 0;
  for (const ch of value) { units += m[ch] ?? m.n ?? 550; count += 1; }
  return (units * size) / 1000 + tracking * size * count;
}
function ellipsize(value: string, size: number, family: string, weight: number, max: number, tracking = 0, italic = false) {
  if (textWidth(value, size, family, weight, tracking, italic) <= max) return value;
  const chars = [...value];
  while (chars.length > 1 && textWidth(`${chars.join("").trimEnd()}…`, size, family, weight, tracking, italic) > max) chars.pop();
  return `${chars.join("").trimEnd()}…`;
}
/** Greedy word wrap into at most maxLines; the last line ends in "…" only when the text truly does not fit. */
export function wrapText(value: string, size: number, family: string, weight: number, max: number, maxLines: number, tracking = 0, italic = false): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (let index = 0; index < words.length; index++) {
    const word = words[index];
    const next = line ? `${line} ${word}` : word;
    if (textWidth(next, size, family, weight, tracking, italic) <= max || !line) {
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
  return lines.slice(0, maxLines).map((l) => ellipsize(l, size, family, weight, max, tracking, italic));
}

/* ---------------- svg helpers ---------------- */

function esc(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}
const n = (v: number) => (Math.round(v * 10) / 10).toString();
type TextOpts = { size: number; family: string; weight: number; fill: string; anchor?: "start" | "end" | "middle"; tracking?: number; opacity?: number; transform?: string; italic?: boolean };
function text(x: number, y: number, value: string, o: TextOpts) {
  const ls = o.tracking ? ` letter-spacing="${n(o.tracking * o.size)}"` : "";
  const anchor = o.anchor && o.anchor !== "start" ? ` text-anchor="${o.anchor}"` : "";
  const op = o.opacity != null && o.opacity < 1 ? ` fill-opacity="${o.opacity}"` : "";
  const tf = o.transform ? ` transform="${o.transform}"` : "";
  const it = o.italic ? ` font-style="italic"` : "";
  return `<text x="${n(x)}" y="${n(y)}" font-family="${esc(o.family)}" font-size="${n(o.size)}" font-weight="${o.weight}"${it} fill="${o.fill}"${ls}${anchor}${op}${tf}>${esc(value)}</text>`;
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
  /** Item photo size (0 = text-only, the original layout). */
  thumb: number;
  /** Draw a tinted initial tile for items without a photo (photo templates); text templates leave the space clean. */
  placeholders?: boolean;
};
type PlacedItem = { lines: string[]; desc: string[]; price: string; priceW: number; h: number; photo?: string | null; initial?: string; src?: LayoutItem };
type PlacedSection = { name: string; items: PlacedItem[]; headH: number; h: number; thumbs?: boolean; src?: LayoutSection; head?: { size: number; weight: number } };

/* ---------------- guided customization (lib/board-custom.ts) ---------------- */

/**
 * State of the render in progress. `active` is null for boards without customization: every size, position and
 * weight then comes from exactly the same expressions as before. Regions and clip counts are only recorded, never drawn.
 */
type Run = {
  active: ActiveCustom | null;
  /** Scale the uncustomized board fitted its menu at (reference for "never smaller than the template"). */
  s0: number;
  regions: BoardRegion[];
  clips: Record<ClipArea, number>;
  sections: Map<object, number>;
  items: Map<object, [number, number]>;
  imageSize?: { w: number; h: number } | null;
  doc: LayoutDocument;
};
let run: Run | null = null;

function note(area: ClipArea, original: string, drawn: string | string[]) {
  if (!run) return;
  const last = Array.isArray(drawn) ? drawn[drawn.length - 1] ?? "" : drawn;
  if (last.endsWith("…") && !original.trim().endsWith("…")) run.clips[area] += 1;
}
function addRegion(region: BoardRegion | null) { if (run && region) run.regions.push(region); }
function roleScale(role: RoleKey) { return run?.active ? run.active.scale[role] : 1; }
/** Role weight: the template's, or the chosen weight snapped to the family's shipped faces. */
function roleWeight(role: RoleKey, family: string, def: number) {
  const choice = run?.active?.weight[role];
  return choice ? snapWeight(family, choice) : def;
}
/** A fixed-size text scaled by its role, never below min(readable floor, template size). */
function roleSize(role: RoleKey, def: number) {
  if (!run?.active) return def;
  return Math.max(Math.min(READABLE_FLOORS[role], def), def * run.active.scale[role]);
}
/** Left edge of the photo/video column: the template's, or the owner's featured media size. */
function mediaLeft(active: ActiveCustom | null, def: number) {
  return active && active.mediaSize != null ? Math.round(W * (1 - active.mediaSize)) : def;
}
/** Vertical boards: height of the photo/video band, the template's share of the board or the owner's media size. */
function mediaBand(active: ActiveCustom | null, defFraction: number) {
  return Math.round(H * (active && active.mediaSize != null ? active.mediaSize : defFraction));
}
function customStyle(st: Style): Style {
  const a = run?.active;
  if (!a) return st;
  const name = st.name.size * a.scale.itemName;
  return {
    ...st,
    name: { ...st.name, size: name, weight: roleWeight("itemName", st.name.family, st.name.weight) },
    price: { ...st.price, size: st.price.size * a.scale.price, weight: roleWeight("price", st.price.family, st.price.weight) },
    desc: { ...st.desc, size: st.desc.size * a.scale.description, weight: roleWeight("description", st.desc.family, st.desc.weight) },
    section: { ...st.section, size: st.section.size * a.scale.sectionHeading, weight: roleWeight("sectionHeading", st.section.family, st.section.weight) },
    itemGap: st.itemGap * a.itemGap, sectionGap: st.sectionGap * a.sectionGap,
    thumb: st.thumb && st.name.size ? Math.round(name * (st.thumb / st.name.size)) : 0,
  };
}
/** Heading size and weight for one section on a customized board (its own override wins). */
function sectionHead(section: LayoutSection, st: Style): { size: number; weight: number } | undefined {
  const a = run?.active;
  if (!a) return undefined;
  const hs = sectionHeadingStyle(a, section);
  const global = a.scale.sectionHeading || 1;
  return { size: (st.section.size * hs.scale) / global, weight: hs.weight ? snapWeight(st.section.family, hs.weight) : st.section.weight };
}
/** Title fit for the business name: role size and weight on customized boards, never below the readable floor. */
function titleFit(value: string, max: number, start: number, min: number, family: string, weight: number, tracking = 0, cap = Infinity) {
  if (!run?.active) return { ...fitTitle(value, max, start, min, family, weight, tracking), weight };
  const k = run.active.scale.businessName;
  const w = roleWeight("businessName", family, weight);
  const lo = Math.max(Math.min(READABLE_FLOORS.businessName, min), Math.min(cap, min * k));
  const hi = Math.max(lo, Math.min(cap, start * k));
  return { ...fitTitle(value, max, hi, lo, family, w, tracking), weight: w };
}
/** The featured photo: the template's placement, or the owner's focal point when it fills the box. */
function photoImage(href: string, box: { x: number; y: number; w: number; h: number }, doc: LayoutDocument) {
  const focus = run?.active?.focus;
  if (!focus || doc.imageFit === "contain") return `<image href="${esc(href)}" x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" preserveAspectRatio="${aspect(doc)}"/>`;
  const place = focusPlacement(box, focus, run?.imageSize);
  if (place.kind === "anchor") return `<image href="${esc(href)}" x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" preserveAspectRatio="${place.aspect}"/>`;
  const id = `fp${clipSeq++}`;
  return `<clipPath id="${id}"><rect x="${n(box.x)}" y="${n(box.y)}" width="${n(box.w)}" height="${n(box.h)}"/></clipPath><image href="${esc(href)}" x="${n(place.x)}" y="${n(place.y)}" width="${n(place.w)}" height="${n(place.h)}" preserveAspectRatio="none" clip-path="url(#${id})"/>`;
}

/** Where an item's photo comes from: the owner's photo, else the template's sample photo, else none. */
export type ItemPhotoResolver = (item: LayoutItem) => string | null;
type Column = { sections: PlacedSection[]; h: number };

function scaled(base: Style, s: number): Style {
  return {
    ...base,
    name: { ...base.name, size: base.name.size * s }, price: { ...base.price, size: base.price.size * s }, desc: { ...base.desc, size: base.desc.size * s },
    section: { ...base.section, size: base.section.size * s },
    itemGap: base.itemGap * s, sectionGap: base.sectionGap * s, headGap: base.headGap * s,
    thumb: base.thumb * s,
  };
}
function tagPad(st: Style) { return st.price.size * 0.32; }
function measureSection(section: LayoutSection, colW: number, st: Style, photoOf?: ItemPhotoResolver): PlacedSection {
  // Thumbnail layouts: a section with any item photo reserves the photo column for all its items, so names line up.
  const thumbs = st.thumb > 0 && !!photoOf && section.items.some((item) => item.name.trim() && (item.imageMediaId || item.stockPhoto));
  if (thumbs) return measureThumbSection(section, colW, st, photoOf!);
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
    items.push({ lines, desc, price, priceW, h, ...(run ? { src: item } : {}) });
  }
  const head = sectionHead(section, st);
  const hsz = head ? head.size : st.section.size;
  const headH = section.name ? hsz * 1.05 + (st.rule ? hsz * 0.45 + 2 : 0) + st.headGap : 0;
  return { name: section.name, items, headH, h: headH + items.reduce((a, i) => a + i.h, 0), ...(run ? { src: section } : {}), ...(head ? { head } : {}) };
}
function initialOf(name: string) { return ([...name.trim()][0] ?? "").toUpperCase(); }
function measureThumbSection(section: LayoutSection, colW: number, st: Style, photoOf: ItemPhotoResolver): PlacedSection {
  const items: PlacedItem[] = [];
  const gap = st.thumb * 0.22;
  const textW = colW - st.thumb - gap;
  for (const item of section.items) {
    if (!item.name.trim()) continue;
    const name = st.name.upper ? item.name.toUpperCase() : item.name;
    const price = item.price || "";
    const priceW = price ? textWidth(price, st.price.size, st.price.family, st.price.weight) + (st.tags ? tagPad(st) * 2 : 0) : 0;
    const room = Math.max(textW * 0.4, textW - priceW - (st.leader ? st.name.size * 1.1 : st.name.size * 0.6));
    // Beside a photo the text column is narrower, so a name may take a third line instead of being shortened.
    const lines = wrapText(name, st.name.size, st.name.family, st.name.weight, room, 3, st.name.upper ? 0.02 : 0);
    const desc = item.description ? wrapText(item.description, st.desc.size, st.desc.family, st.desc.weight, textW, 2) : [];
    const lineH = st.name.size * 1.17;
    const tagH = st.tags && price ? st.price.size * 1.25 : 0;
    const textH = Math.max(lines.length * lineH, tagH) + (desc.length ? st.desc.size * 0.32 + desc.length * st.desc.size * 1.32 : 0);
    const photo = photoOf(item);
    // Photo-less items stay text-height (no empty placeholder gap). Items in the same section still share the
    // thumbnail indent so names and prices line up beside photos.
    const h = (photo || st.placeholders ? Math.max(textH, st.thumb) : textH) + st.itemGap;
    items.push({ lines, desc, price, priceW, h, photo, initial: initialOf(item.name), ...(run ? { src: item } : {}) });
  }
  const head = sectionHead(section, st);
  const hsz = head ? head.size : st.section.size;
  const headH = section.name ? hsz * 1.05 + (st.rule ? hsz * 0.45 + 2 : 0) + st.headGap : 0;
  return { name: section.name, items, headH, h: headH + items.reduce((a, i) => a + i.h, 0), thumbs: true, ...(run ? { src: section } : {}), ...(head ? { head } : {}) };
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

/**
 * Last resort before leaving items off: let a long section continue at the top of the next column (no repeated
 * heading). Only used when whole sections can't fit at any size, so menus that fit today render exactly as before.
 */
function flowSplit(sections: PlacedSection[], cols: number, colH: number, st: Style): Column[] | null {
  const out: Column[] = [{ sections: [], h: 0 }];
  for (const section of sections) {
    let col = out[out.length - 1];
    let gap = col.sections.length ? st.sectionGap : 0;
    let frag: PlacedSection = { ...section, items: [], h: section.headH };
    if (col.h + gap + frag.h + (section.items[0]?.h ?? 0) > colH) {
      if (out.length === cols) return null;
      col = { sections: [], h: 0 }; out.push(col); gap = 0;
    }
    for (const item of section.items) {
      if (col.h + gap + frag.h + item.h > colH) {
        if (!frag.items.length || out.length === cols) return null;
        col.sections.push(frag); col.h += gap + frag.h;
        col = { sections: [], h: 0 }; out.push(col); gap = 0;
        frag = { ...section, name: "", items: [], headH: 0, h: 0 };
      }
      frag.items.push(item); frag.h += item.h;
    }
    col.sections.push(frag); col.h += gap + frag.h;
  }
  return out;
}

export type FitResult = { style: Style; columns: Column[]; cols: number; scale: number; dropped: number };
function fit(sectionsIn: LayoutSection[], base: Style, options: { cols: number; colW: number }[], colH: number, maxScale: number, minScale: number, preferFewerAbove = 0.9, photoOf?: ItemPhotoResolver): FitResult {
  const sections = sectionsIn.filter((s) => s.items.some((i) => i.name.trim()) || false);
  const wraps = (placed: PlacedSection[]) => placed.reduce((a, sec) => a + sec.items.reduce((b, it) => b + it.lines.length + it.desc.length, 0), 0);
  let best: FitResult | null = null;
  for (const opt of options) {
    // Lines at the design size: a short menu may grow, but only while names and descriptions don't wrap more.
    const designLines = wraps(sections.map((sec) => measureSection(sec, opt.colW, scaled(base, 1), photoOf)));
    for (let s = maxScale; s >= minScale - 1e-6; s -= 0.02) {
      const st = scaled(base, s);
      const placed = sections.map((sec) => measureSection(sec, opt.colW, st, photoOf));
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
  const last = options[options.length - 1];
  if (last.cols > 1) {
    for (let s = Math.min(1, maxScale); s >= minScale - 1e-6; s -= 0.02) {
      const st = scaled(base, s);
      const placed = sections.map((sec) => measureSection(sec, last.colW, st, photoOf));
      const cols = flowSplit(placed, last.cols, colH, st);
      if (cols) return { style: st, columns: cols, cols: last.cols, scale: s, dropped: 0 };
    }
  }
  // Too long even at the smallest size: draw what fits and report how many items were left off.
  const opt = options[options.length - 1];
  const st = scaled(base, minScale);
  const placed = sections.map((sec) => measureSection(sec, opt.colW, st, photoOf));
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

/**
 * fit() for a customized board: the owner's sizes, starting at the scale the template itself would use (so "Large" is
 * always larger than the default) and never shrinking any role below min(readable floor, the template's own size).
 * When even that does not fit, items are left off and the board reports it (publish is then refused).
 */
function fitC(sectionsIn: LayoutSection[], base: Style, options: { cols: number; colW: number }[], colH: number, maxScale: number, minScale: number, preferFewerAbove = 0.9, photoOf?: ItemPhotoResolver): FitResult {
  const a = run?.active;
  if (!a || !run) return fit(sectionsIn, base, options, colH, maxScale, minScale, preferFewerAbove, photoOf);
  const cb = customStyle(base);
  const s0 = run.s0;
  const need = (floor: number, def: number, custom: number) => (custom > 0 ? Math.min(floor, def * s0) / custom : 0);
  const headScales = sectionsIn.filter((s) => s.name).map((s) => sectionHeadingStyle(a, s).scale);
  const minHead = headScales.length ? Math.min(...headScales) : a.scale.sectionHeading;
  let lo = Math.max(
    minScale,
    need(READABLE_FLOORS.itemName, base.name.size, cb.name.size),
    need(READABLE_FLOORS.price, base.price.size, cb.price.size),
    need(READABLE_FLOORS.description, base.desc.size, cb.desc.size),
    need(READABLE_FLOORS.sectionHeading, base.section.size, base.section.size * minHead),
  );
  lo = Math.ceil(lo * 1000) / 1000;
  const hi = Math.max(lo, s0);
  return fit(sectionsIn, cb, options, colH, hi, lo, preferFewerAbove, photoOf);
}

function paintColumns(parts: string[], result: FitResult, x0: number, top: number, colW: number, gap: number, c: DesignColors) {
  const st = result.style;
  result.columns.forEach((col, ci) => {
    const x = x0 + ci * (colW + gap);
    let y = top;
    col.sections.forEach((sec, si) => {
      if (si > 0) y += st.sectionGap;
      if (sec.name) {
        const hs = sec.head ?? st.section;
        const label = st.section.upper ? sec.name.toUpperCase() : sec.name;
        const base = y + hs.size * 0.82;
        const shown = ellipsize(label, hs.size, st.section.family, hs.weight, colW, st.section.tracking);
        note("menu", label, shown);
        const si = sec.src && run ? run.sections.get(sec.src) : undefined;
        if (si != null && run) addRegion(sectionRegion(run.doc.sections[si] ?? sec.src!, si, { x, y, w: colW, h: hs.size * 1.05 }));
        parts.push(text(x, base, shown, { size: hs.size, family: st.section.family, weight: hs.weight, fill: c.accent, tracking: st.section.tracking }));
        y += hs.size * 1.05;
        if (st.rule) { y += hs.size * 0.45; parts.push(rect(x, y, colW, 2, mix(c.accent, c.paper, 0.55))); y += 2; }
        y += st.headGap;
      }
      for (const item of sec.items) {
        if (run && item.src) {
          const at = run.items.get(item.src);
          if (at) addRegion(itemRegion(item.src, at[0], at[1], { x, y, w: colW, h: item.h - st.itemGap }));
          note("menu", st.name.upper ? item.src.name.toUpperCase() : item.src.name, item.lines);
          if (item.src.description) note("menu", item.src.description, item.desc);
        }
        if (sec.thumbs) { paintThumbItem(parts, item, x, y, colW, st, c); y += item.h; continue; }
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

let clipSeq = 0;
/** A photo cropped (never stretched) into a rounded rectangle or circle; a tasteful initial tile when missing. */
function photoTile(parts: string[], href: string | null, x: number, y: number, w: number, h: number, radius: number, c: DesignColors, initial: string, bg: string, circle = false) {
  const id = `ip${clipSeq++}`;
  const shape = circle
    ? `<circle cx="${n(x + w / 2)}" cy="${n(y + h / 2)}" r="${n(Math.min(w, h) / 2)}"/>`
    : `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${n(radius)}"/>`;
  if (href) {
    parts.push(`<clipPath id="${id}">${shape}</clipPath>`);
    parts.push(`<image href="${esc(href)}" x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/>`);
    return;
  }
  const fill = mix(c.accent, bg, 0.84);
  parts.push(circle ? `<circle cx="${n(x + w / 2)}" cy="${n(y + h / 2)}" r="${n(Math.min(w, h) / 2)}" fill="${fill}"/>` : rect(x, y, w, h, fill, `rx="${n(radius)}"`));
  if (initial) {
    const size = Math.min(w, h) * 0.46;
    parts.push(text(x + w / 2, y + h / 2 + size * 0.35, initial, { size, family: "Noto Serif", weight: 700, fill: readableOn(c.accent, fill, 3).color, anchor: "middle" }));
  }
}
function paintThumbItem(parts: string[], item: PlacedItem, x: number, y: number, colW: number, st: Style, c: DesignColors) {
  const t = st.thumb; const gap = t * 0.22; const tx = x + t + gap; const textW = colW - t - gap;
  if (item.photo || st.placeholders) photoTile(parts, item.photo ?? null, x, y, t, t, t * 0.16, c, item.initial ?? "", c.paper);
  const lineH = st.name.size * 1.17;
  const tagH = st.tags && item.price ? st.price.size * 1.25 : 0;
  const textH = Math.max(item.lines.length * lineH, tagH) + (item.desc.length ? st.desc.size * 0.32 + item.desc.length * st.desc.size * 1.32 : 0);
  const top = y + ((item.photo || st.placeholders) ? Math.max(0, (t - textH) / 2) : 0);
  const first = top + (tagH > lineH ? (tagH - lineH) / 2 : 0) + st.name.size * 0.86;
  item.lines.forEach((line, li) => parts.push(text(tx, first + li * lineH, line, { size: st.name.size, family: st.name.family, weight: st.name.weight, fill: c.ink, tracking: st.name.upper ? 0.02 : 0 })));
  if (item.price) {
    if (st.tags) {
      const th = st.price.size * 1.25;
      const ty = top + Math.max(0, (Math.max(lineH, th) - th) / 2) + (tagH > lineH ? 0 : (lineH - th) / 2);
      parts.push(rect(tx + textW - item.priceW, ty, item.priceW, th, c.tag, `rx="${n(st.price.size * 0.22)}"`));
      parts.push(text(tx + textW - item.priceW / 2, ty + th / 2 + st.price.size * 0.36, item.price, { size: st.price.size, family: st.price.family, weight: st.price.weight, fill: c.tagInk, anchor: "middle" }));
    } else {
      parts.push(text(tx + textW, first, item.price, { size: st.price.size, family: st.price.family, weight: st.price.weight, fill: c.priceInk, anchor: "end" }));
    }
  }
  if (st.leader && item.price && item.lines.length === 1) {
    const nameEnd = tx + textWidth(item.lines[0], st.name.size, st.name.family, st.name.weight) + st.name.size * 0.4;
    const end = tx + textW - item.priceW - st.name.size * 0.4;
    if (end - nameEnd > st.name.size) {
      const ly = first - st.name.size * 0.08;
      parts.push(`<line x1="${n(nameEnd)}" y1="${n(ly)}" x2="${n(end)}" y2="${n(ly)}" stroke="${mix(c.muted, c.paper, 0.35)}" stroke-width="${n(Math.max(2, st.name.size * 0.075))}" stroke-dasharray="0.1 ${n(st.name.size * 0.24)}" stroke-linecap="round"/>`);
    }
  }
  if (item.desc.length) {
    const dy = top + Math.max(item.lines.length * lineH, tagH) + st.desc.size * 0.32;
    item.desc.forEach((line, di) => parts.push(text(tx, dy + st.desc.size * 0.95 + di * st.desc.size * 1.32, line, { size: st.desc.size, family: st.desc.family, weight: st.desc.weight, fill: c.muted })));
  }
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

export type DesignArt = {
  imageHref?: string | null; logoHref?: string | null; stockHref?: string | null;
  /** Owner item photos by media id (signed URLs in the editor, data URIs on the server). */
  itemImages?: Record<string, string>;
  /** Template sample photos by stock id (data URIs on the server; the editor uses /menu-templates/<id>.jpg). */
  stockHrefs?: Record<string, string>;
  /** Natural size of the featured photo, so a focal point places it exactly (preview and TV alike). */
  imageSize?: { w: number; h: number } | null;
};
export type DesignReport = {
  dropped: number; scale: number;
  /** Shortened ("…") texts per area, and the board's selectable regions (canvas px). Recorded only; never drawn. */
  clips?: Record<ClipArea, number>;
  regions?: BoardRegion[];
  /** True when item photos were left off so items that fit as text-only are not dropped. */
  photosSuppressed?: boolean;
};

function family(id: BoardFontId) { return boardFont(id).family; }
function fonts(doc: LayoutDocument, design: MenuDesign) {
  const head = family(doc.font ?? design.look.head);
  const body = family(doc.bodyFont ?? doc.font ?? design.look.body);
  return { head, body };
}
function photoHref(doc: LayoutDocument, art?: DesignArt) {
  return safeDesignHref(art?.imageHref) ?? (doc.stockPhoto ? safeDesignHref(art?.stockHref ?? `/menu-templates/${doc.stockPhoto}.jpg`) : null);
}
/**
 * Item photos show automatically whenever a dish has one (card/featured/photo-list templates, or any template where
 * an item has an owner photo). Stored `doc.photoStyle === "text"` is deprecated and ignored at render time so
 * uploaded photos never stay hidden.
 */
export function itemPhotosShown(doc: LayoutDocument, design: MenuDesign): boolean {
  if (design.composition === "cards" || design.composition === "featured" || design.photoStyle === "thumbs") return true;
  return hasOwnerItemPhoto(doc);
}
export function hasOwnerItemPhoto(doc: LayoutDocument): boolean {
  return doc.sections.some((section) => section.items.some((item) => Boolean(item.imageMediaId)));
}
export function itemPhotoResolver(art?: DesignArt): ItemPhotoResolver {
  return (item) => {
    if (item.imageMediaId) return safeDesignHref(art?.itemImages?.[item.imageMediaId]);
    if (item.stockPhoto) return safeDesignHref(art?.stockHrefs?.[item.stockPhoto] ?? `/menu-templates/${item.stockPhoto}.jpg`);
    return null;
  };
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
    thumb: 0,
  };
}
/** Same style with the thumbnail column switched on when this board shows item photos. */
function withThumbs(st: Style, on: boolean, placeholders = true, ratio = 2.3): Style { return on ? { ...st, thumb: Math.round(st.name.size * ratio), placeholders } : st; }

/** Default, then gradually more compact (down to a single-row thumb ≈ the name line) so photos don't drop items. */
const THUMB_RATIOS = [2.3, 1.8, 1.4, 1.15] as const;
type PhotoFit = FitResult & { photosSuppressed: boolean };
/**
 * Fit with item photos when they don't increase dropped items versus text-only. Tries shrinking thumbnails toward a
 * readable single-row size first; if they still don't fit, falls back to text-only and reports photosSuppressed.
 */
function fitPhotos(
  sections: LayoutSection[],
  base: Style,
  options: { cols: number; colW: number }[],
  colH: number,
  maxScale: number,
  minScale: number,
  preferFewerAbove: number,
  wantPhotos: boolean,
  placeholders: boolean,
  photoOf?: ItemPhotoResolver,
): PhotoFit {
  if (!wantPhotos || !photoOf) return { ...fitC(sections, base, options, colH, maxScale, minScale, preferFewerAbove), photosSuppressed: false };
  const text = fitC(sections, base, options, colH, maxScale, minScale, preferFewerAbove);
  for (const ratio of THUMB_RATIOS) {
    const tried = fitC(sections, withThumbs(base, true, placeholders, ratio), options, colH, maxScale, minScale, preferFewerAbove, photoOf);
    if (tried.dropped <= text.dropped) return { ...tried, photosSuppressed: false };
  }
  return { ...text, photosSuppressed: true };
}

/** Where a muted video may play on a design board (null when the design has no media area). */
export function designVideoBox(doc: LayoutDocument): ZoneBox | null {
  const design = designById(doc.design);
  if (!design) return null;
  if (orientationOf(doc) === "portrait") return onCanvas(doc, () => portraitVideoBox(doc, design));
  // The owner's featured media size moves the video exactly as it moves the photo (same mediaLeft as the renderer).
  const active = activeCustom(doc);
  if (design.composition === "showcase") {
    const band = (doc.featureTitle || doc.featureDetail || "").trim() ? 200 : 0;
    const L = mediaLeft(active, 1140);
    return { x: L, y: 0, w: W - L, h: H - band };
  }
  if (design.composition === "columns") { const L = mediaLeft(active, 1344); return { x: L, y: 0, w: W - L, h: 640 }; }
  if (design.composition === "promo") { const L = mediaLeft(active, 1260); return { x: L, y: 0, w: W - L, h: 713 }; }
  return null;
}

/** Vertical boards: the media band sits at the bottom, full width (same band the renderer paints). */
function portraitVideoBox(doc: LayoutDocument, design: MenuDesign): ZoneBox | null {
  const active = activeCustom(doc);
  if (design.composition === "showcase") {
    const band = (doc.featureTitle || doc.featureDetail || "").trim() ? 200 : 0;
    const MB = mediaBand(active, SHOWCASE_MEDIA);
    return { x: 0, y: H - MB, w: W, h: MB - band };
  }
  if (design.composition === "columns") { const MB = mediaBand(active, COLUMNS_MEDIA); return { x: 0, y: H - COLUMNS_PANEL - MB, w: W, h: MB }; }
  if (design.composition === "promo") { const PB = mediaBand(active, PROMO_MEDIA); return { x: 0, y: H - PROMO_PANEL - PB, w: W, h: PB }; }
  return null;
}
const SHOWCASE_MEDIA = 780 / 1920;
const COLUMNS_MEDIA = 576 / 1920;
const COLUMNS_PANEL = 240;
// Vertical promo: a slightly shorter photo band than the horizontal column share, so the menu keeps its room.
const PROMO_MEDIA = 0.28;
const PROMO_PANEL = 270;
const FEATURED_PANEL = 0.4;

function showcase(parts: string[], doc: LayoutDocument, design: MenuDesign, c: DesignColors, f: { head: string; body: string }, art: DesignArt | undefined): DesignReport {
  if (isPortrait()) return showcasePortrait(parts, doc, design, c, f, art);
  const L = mediaLeft(run?.active ?? null, 1140); const x0 = 90; const top = 92;
  parts.push(rect(0, 0, W, H, c.paper));
  const photo = photoHref(doc, art);
  if (photo) {
    parts.push(photoImage(photo, { x: L, y: 0, w: W - L, h: H }, doc));
    parts.push(`<defs><linearGradient id="dg-fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0.44" stop-color="${c.paper}" stop-opacity="0"/><stop offset="0.86" stop-color="${c.paper}" stop-opacity="0.95"/><stop offset="1" stop-color="${c.paper}" stop-opacity="0.98"/></linearGradient></defs>`);
    parts.push(rect(L, 0, W - L, H, "url(#dg-fade)"));
  } else {
    parts.push(rect(L, 0, W - L, H, c.panel));
  }
  // Header
  const logoSize = logo(parts, safeDesignHref(art?.logoHref), x0, top, 104, c.paper);
  const tx = x0 + (logoSize ? logoSize + 28 : 0);
  const maxW = L - x0 - 90 - (logoSize ? logoSize + 28 : 0);
  const t = titleFit(doc.title || "", maxW, 86, 52, f.head, design.look.headWeight);
  note("businessName", doc.title || "", t.value);
  const titleBase = top + t.size * 0.84 + (logoSize ? Math.max(0, (104 - t.size * 1.6) / 2) : 0);
  if (t.value) parts.push(text(tx, titleBase, t.value, { size: t.size, family: f.head, weight: t.weight, fill: c.ink }));
  let headBottom = titleBase + t.size * 0.22;
  if (doc.subtitle) {
    const sub = ellipsize(doc.subtitle.toUpperCase(), 24, f.body, 700, maxW, 0.22);
    parts.push(text(tx, titleBase + 50, sub, { size: 24, family: f.body, weight: 700, fill: c.accent, tracking: 0.22 }));
    headBottom = titleBase + 58;
  }
  headBottom = Math.max(headBottom, logoSize ? top + logoSize : 0);
  addRegion(fixedRegion("businessName", { x: x0, y: top, w: L - x0 - 90, h: headBottom - top + 8 }));
  parts.push(rect(x0, headBottom + 40, 180, 2, mix(c.accent, c.paper, 0.6)));
  const menuTop = headBottom + 84;
  const footerH = doc.footer ? 52 : 0;
  const colH = H - 70 - footerH - menuTop;
  const shown = itemPhotosShown(doc, design);
  const avail = L - x0 - 90;
  const result = fitPhotos(doc.sections, baseStyle(design, f, { name: 38, price: 38, desc: 25, section: 30, itemGap: 22, sectionGap: 44, headGap: 24 }), [{ cols: 1, colW: avail }, { cols: 2, colW: (avail - 64) / 2 }], colH, 1.25, 0.55, 0.9, shown, isPhotoDesign(design), shown ? itemPhotoResolver(art) : undefined);
  paintColumns(parts, result, x0, menuTop, result.cols === 1 ? avail : (avail - 64) / 2, 64, c);
  if (doc.footer) parts.push(text(x0, H - 56, ellipsize(doc.footer, 24, f.head, 400, avail), { size: 24, family: f.head, weight: 400, fill: c.muted }));
  // Feature text on the photo's lower band (the video box ends above it).
  const title = (doc.featureTitle || "").trim(); const detail = (doc.featureDetail || "").trim();
  addRegion(fixedRegion("featuredMedia", { x: L, y: 0, w: W - L, h: H - (title || detail ? 200 : 0) }));
  if (title || detail) {
    const fx = L + 64; const fw = W - L - 128;
    const onPanel = !photo;
    const ink = onPanel ? c.panelInk : c.ink;
    const ds = roleSize("featuredText", 40); const ts = roleSize("featuredText", 22); const dw = roleWeight("featuredText", f.head, 400);
    const lines = detail ? wrapText(detail, ds, f.head, dw, fw, 2) : [];
    note("featuredText", detail, lines);
    const y = H - 60 - (lines.length - 1) * (50 * ds / 40);
    lines.forEach((line, i) => parts.push(text(fx, y + i * (50 * ds / 40), line, { size: ds, family: f.head, weight: dw, fill: ink })));
    const label = title ? ellipsize(title.toUpperCase(), ts, f.body, 700, fw, 0.24) : "";
    note("featuredText", title.toUpperCase(), label);
    if (title) parts.push(text(fx, (lines.length ? y : H - 60) - (lines.length ? 64 * ds / 40 : 0), label, { size: ts, family: f.body, weight: 700, fill: onPanel ? c.panelInk : c.accent, tracking: 0.24 }));
    addRegion(fixedRegion("featuredText", { x: L, y: H - 200, w: W - L, h: 200 }));
  }
  return { dropped: result.dropped, scale: result.scale, photosSuppressed: result.photosSuppressed };
}

function columns(parts: string[], doc: LayoutDocument, design: MenuDesign, c: DesignColors, f: { head: string; body: string }, art: DesignArt | undefined): DesignReport {
  if (isPortrait()) return columnsPortrait(parts, doc, design, c, f, art);
  const L = mediaLeft(run?.active ?? null, 1344); const x0 = 84; const top = 80;
  parts.push(rect(0, 0, W, H, c.paper));
  const photo = photoHref(doc, art);
  if (photo) parts.push(photoImage(photo, { x: L, y: 0, w: W - L, h: 640 }, doc));
  else parts.push(rect(L, 0, W - L, 640, mix(c.panel, c.paper, 0.6)));
  parts.push(rect(L, 640, W - L, H - 640, c.panel));
  const logoSize = logo(parts, safeDesignHref(art?.logoHref), x0, top, 92, c.paper);
  const tx = x0 + (logoSize ? logoSize + 24 : 0);
  const maxW = L - x0 - 84 - (logoSize ? logoSize + 24 : 0);
  const t = titleFit(doc.title || "", maxW, 68, 44, f.head, design.look.headWeight);
  note("businessName", doc.title || "", t.value);
  const titleBase = top + t.size * 0.82 + (logoSize ? Math.max(0, (92 - t.size * 1.45) / 2) : 0);
  if (t.value) parts.push(text(tx, titleBase, t.value, { size: t.size, family: f.head, weight: t.weight, fill: c.ink }));
  let headBottom = titleBase + t.size * 0.22;
  if (doc.subtitle) {
    parts.push(text(tx, titleBase + 46, ellipsize(doc.subtitle, 26, f.body, 400, maxW), { size: 26, family: f.body, weight: 400, fill: c.muted }));
    headBottom = titleBase + 54;
  }
  headBottom = Math.max(headBottom, logoSize ? top + logoSize : 0);
  addRegion(fixedRegion("businessName", { x: x0, y: top, w: L - x0 - 84, h: headBottom - top + 8 }));
  const menuTop = headBottom + 56;
  const footerH = doc.footer ? 62 : 0;
  const colH = H - 64 - footerH - menuTop;
  const avail = L - x0 - 84; const colW = (avail - 80) / 2;
  const shown = itemPhotosShown(doc, design);
  const result = fitPhotos(doc.sections, baseStyle(design, f, { name: 36, price: 36, desc: 24, section: 30, itemGap: 20, sectionGap: 46, headGap: 22 }), [{ cols: 2, colW }], colH, 1.3, 0.55, 0.9, shown, isPhotoDesign(design), shown ? itemPhotoResolver(art) : undefined);
  paintColumns(parts, result, x0, menuTop, colW, 80, c);
  if (doc.footer) {
    parts.push(rect(x0, H - 64 - 40, avail, 2, mix(c.muted, c.paper, 0.7)));
    parts.push(text(x0, H - 64, ellipsize(doc.footer, 22, f.body, 400, avail), { size: 22, family: f.body, weight: 400, fill: c.muted }));
  }
  const title = (doc.featureTitle || "").trim(); const detail = (doc.featureDetail || "").trim();
  addRegion(fixedRegion("featuredMedia", { x: L, y: 0, w: W - L, h: 640 }));
  if (title || detail) {
    const fx = L + 56; const fw = W - L - 112;
    const ts = roleSize("featuredText", 54); const ds = roleSize("featuredText", 28); const kt = ts / 54; const kd = ds / 28;
    const tw = roleWeight("featuredText", f.head, design.look.headWeight);
    const tl = title ? wrapText(title, ts, f.head, tw, fw, 2) : [];
    const dl = detail ? wrapText(detail, ds, f.body, 400, fw, 2) : [];
    note("featuredText", title, tl); note("featuredText", detail, dl);
    const blockH = tl.length * 58 * kt + (dl.length ? 16 + dl.length * 36 * kd : 0);
    let y = 640 + (H - 640 - blockH) / 2;
    tl.forEach((line) => { parts.push(text(fx, y + 46 * kt, line, { size: ts, family: f.head, weight: tw, fill: c.panelInk })); y += 58 * kt; });
    if (dl.length) y += 16;
    dl.forEach((line) => { parts.push(text(fx, y + 27 * kd, line, { size: ds, family: f.body, weight: 400, fill: c.panelInk, opacity: 0.92 })); y += 36 * kd; });
    addRegion(fixedRegion("featuredText", { x: L, y: 640, w: W - L, h: H - 640 }));
  }
  return { dropped: result.dropped, scale: result.scale, photosSuppressed: result.photosSuppressed };
}

function promo(parts: string[], doc: LayoutDocument, design: MenuDesign, c: DesignColors, f: { head: string; body: string }, art: DesignArt | undefined): DesignReport {
  if (isPortrait()) return promoPortrait(parts, doc, design, c, f, art);
  const L = mediaLeft(run?.active ?? null, 1260); const x0 = 80; const top = 70; const PH = 713;
  parts.push(rect(0, 0, W, H, c.paper));
  parts.push(rect(L, 0, W - L, H, c.panel));
  const photo = photoHref(doc, art);
  if (photo) {
    parts.push(photoImage(photo, { x: L, y: 0, w: W - L, h: PH }, doc));
    parts.push(`<defs><linearGradient id="dg-panel" x1="0" y1="0" x2="0" y2="1"><stop offset="0.55" stop-color="${c.panel}" stop-opacity="0"/><stop offset="1" stop-color="${c.panel}" stop-opacity="1"/></linearGradient></defs>`);
    parts.push(rect(L, 0, W - L, PH, "url(#dg-panel)"));
  }
  const logoSize = logo(parts, safeDesignHref(art?.logoHref), x0, top, 110, c.paper);
  const tx = x0 + (logoSize ? logoSize + 26 : 0);
  const maxW = L - x0 - 80 - (logoSize ? logoSize + 26 : 0);
  const upperTitle = (doc.title || "").toUpperCase();
  const t = titleFit(upperTitle, maxW, 132, 72, f.head, design.look.headWeight, 0.01, 150);
  note("businessName", upperTitle, t.value);
  const titleBase = top + t.size * 0.82;
  if (t.value) parts.push(text(tx, titleBase, t.value, { size: t.size, family: f.head, weight: t.weight, fill: c.ink, tracking: 0.01 }));
  let headBottom = titleBase + t.size * 0.12;
  if (doc.subtitle) {
    const chipText = ellipsize(doc.subtitle.toUpperCase(), 24, f.body, 800, maxW - 40, 0.08);
    const cw = textWidth(chipText, 24, f.body, 800, 0.08) + 28;
    const cy = titleBase + 22;
    parts.push(`<g transform="translate(${n(tx)} ${n(cy)}) skewX(-8)">${rect(0, 0, cw, 42, c.accent)}${text(14, 30, chipText, { size: 24, family: f.body, weight: 800, fill: bestInk(c.accent), tracking: 0.08 })}</g>`);
    headBottom = cy + 42;
  }
  headBottom = Math.max(headBottom, logoSize ? top + logoSize : 0);
  addRegion(fixedRegion("businessName", { x: x0, y: top, w: L - x0 - 80, h: headBottom - top + 8 }));
  const menuTop = headBottom + 44;
  const footerH = doc.footer ? 46 : 0;
  const colH = H - 56 - footerH - menuTop;
  const avail = L - x0 - 80; const colW = (avail - 64) / 2;
  const shown = itemPhotosShown(doc, design);
  const result = fitPhotos(doc.sections, baseStyle(design, f, { name: 38, price: 42, desc: 25, section: 62, itemGap: 22, sectionGap: 40, headGap: 18 }), [{ cols: 2, colW }], colH, 1.25, 0.55, 0.9, shown, isPhotoDesign(design), shown ? itemPhotoResolver(art) : undefined);
  paintColumns(parts, result, x0, menuTop, colW, 64, c);
  if (doc.footer) parts.push(text(x0, H - 56, ellipsize(doc.footer.toUpperCase(), 22, f.body, 700, avail, 0.06), { size: 22, family: f.body, weight: 700, fill: c.muted, tracking: 0.06 }));
  // Feature panel: big headline, detail, and a price badge taken from the detail text.
  const title = (doc.featureTitle || "").trim(); const detail = (doc.featureDetail || "").trim();
  const price = (detail.match(/[$€£]\s?\d+(?:[.,]\d{1,2})?/) || [""])[0];
  const badgeInPanel = Boolean(doc.videoMediaId);
  const fx = L + 56; const fw = W - L - 112 - (badgeInPanel && price ? 210 : 0);
  addRegion(fixedRegion("featuredMedia", { x: L, y: 0, w: W - L, h: PH }));
  if (title || detail) {
    const ts = roleSize("featuredText", 104); const ds = roleSize("featuredText", 30); const kt = ts / 104; const kd = ds / 30;
    const tw = roleWeight("featuredText", f.head, design.look.headWeight);
    const tl = title ? wrapText(title.toUpperCase(), ts, f.head, tw, fw, 2) : [];
    const dl = detail ? wrapText(detail, ds, f.body, 700, fw, 2) : [];
    note("featuredText", title.toUpperCase(), tl); note("featuredText", detail, dl);
    const y = H - 64 - (dl.length ? (dl.length - 1) * 38 * kd : 0);
    dl.forEach((line, i) => parts.push(text(fx, y + i * 38 * kd, line, { size: ds, family: f.body, weight: 700, fill: c.panelInk })));
    const ty = (dl.length ? y - 30 * kd - 22 : H - 64) - (tl.length - 1) * 94 * kt;
    tl.forEach((line, i) => parts.push(text(fx, ty + i * 94 * kt, line, { size: ts, family: f.head, weight: tw, fill: c.panelInk })));
    addRegion(fixedRegion("featuredText", { x: L, y: PH, w: W - L, h: H - PH }));
  }
  if (price) {
    const r = 95;
    const cx = W - 46 - r; const cy = badgeInPanel ? PH + 40 + r : 46 + r;
    const size = Math.min(58, (r * 1.55 * 1000) / Math.max(1, textWidth(price, 1000, f.head, design.look.headWeight)));
    parts.push(`<g transform="rotate(-10 ${n(cx)} ${n(cy)})"><circle cx="${n(cx)}" cy="${n(cy + 8)}" r="${r}" fill="#000000" fill-opacity="0.28"/><circle cx="${n(cx)}" cy="${n(cy)}" r="${r}" fill="${c.tag}"/>${text(cx, cy + size * 0.36, price, { size, family: f.head, weight: design.look.headWeight, fill: c.tagInk, anchor: "middle" })}</g>`);
  }
  return { dropped: result.dropped, scale: result.scale, photosSuppressed: result.photosSuppressed };
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
  const listTitle = upper ? (doc.title || "").toUpperCase() : doc.title || "";
  const t = titleFit(listTitle, maxW, 96, 56, f.head, design.look.headWeight, 0, 110);
  note("businessName", listTitle, t.value);
  addRegion(fixedRegion("businessName", { x: 0, y: 0, w: W, h: band }));
  const hasSub = Boolean(doc.subtitle);
  const titleBase = hasSub ? 112 : band / 2 + t.size * 0.34;
  if (t.value) parts.push(text(tx, titleBase, t.value, { size: t.size, family: f.head, weight: t.weight, fill: c.panelInk }));
  if (hasSub) parts.push(text(tx, 160, ellipsize(doc.subtitle, 30, f.body, 400, maxW), { size: 30, family: f.body, weight: 400, fill: c.panelInk, opacity: 0.88 }));
  const menuTop = band + 8 + 60;
  const footerH = doc.footer ? 48 : 0;
  const colH = H - 56 - footerH - menuTop;
  const avail = W - x0 * 2; const gap = isPortrait() ? 56 : 72; const colW = (avail - gap * 2) / 3;
  const shown = itemPhotosShown(doc, design);
  // Vertical boards: one full-width column, or two across the 1080px width for long menus (never three skinny ones).
  const options = isPortrait() ? [{ cols: 1, colW: avail }, { cols: 2, colW: (avail - gap) / 2 }] : [{ cols: 3, colW }];
  const result = fitPhotos(doc.sections, baseStyle(design, f, { name: 36, price: design.look.tags ? 38 : 36, desc: 24, section: design.look.head === "bebas-neue" ? 56 : 32, itemGap: 20, sectionGap: 44, headGap: 22 }), options, colH, 1.5, 0.55, 0.9, shown, false, shown ? itemPhotoResolver(art) : undefined);
  paintColumns(parts, result, x0, menuTop, isPortrait() ? (result.cols === 1 ? avail : (avail - gap) / 2) : colW, gap, c);
  if (doc.footer) parts.push(text(x0, H - 52, ellipsize(doc.footer, 24, f.body, 400, avail), { size: 24, family: f.body, weight: 400, fill: c.muted }));
  return { dropped: result.dropped, scale: result.scale, photosSuppressed: result.photosSuppressed };
}

/** Header band shared by the list and photo templates. Returns the y where content starts. */
function bandHeader(parts: string[], doc: LayoutDocument, design: MenuDesign, c: DesignColors, f: { head: string; body: string }, art: DesignArt | undefined, band: number, x0: number) {
  parts.push(rect(0, 0, W, H, c.paper));
  parts.push(rect(0, 0, W, band, c.panel));
  parts.push(rect(0, band, W, 8, c.accent));
  const logoSize = logo(parts, safeDesignHref(art?.logoHref), x0, (band - Math.min(120, band - 50)) / 2, Math.min(120, band - 50), c.panel);
  const tx = x0 + (logoSize ? logoSize + 30 : 0);
  const maxW = W - x0 * 2 - (logoSize ? logoSize + 30 : 0);
  const upper = design.look.head === "bebas-neue" || design.look.head === "oswald";
  const bandTitle = upper ? (doc.title || "").toUpperCase() : doc.title || "";
  const t = titleFit(bandTitle, maxW, 88, 52, f.head, design.look.headWeight, 0, 100);
  note("businessName", bandTitle, t.value);
  addRegion(fixedRegion("businessName", { x: 0, y: 0, w: W, h: band }));
  const hasSub = Boolean(doc.subtitle);
  const titleBase = hasSub ? band * 0.52 : band / 2 + t.size * 0.34;
  if (t.value) parts.push(text(tx, titleBase, t.value, { size: t.size, family: f.head, weight: t.weight, fill: c.panelInk }));
  if (hasSub) parts.push(text(tx, band * 0.8, ellipsize(doc.subtitle, 28, f.body, 400, maxW), { size: 28, family: f.body, weight: 400, fill: c.panelInk, opacity: 0.88 }));
  return band + 8;
}

type Flat = { item: LayoutItem; section: string };
function flatItems(doc: LayoutDocument): Flat[] {
  return doc.sections.flatMap((section) => section.items.filter((item) => item.name.trim()).map((item) => ({ item, section: section.name })));
}
/** Card grid capacity: photo cards stay legible up to 15 per screen. */
export const CARD_CAPACITY = 15;
function cardGrid(count: number): [number, number] {
  if (isPortrait()) {
    // Vertical boards: at most three cards across, more rows.
    if (count <= 2) return [1, Math.max(1, count)];
    if (count <= 4) return [2, 2];
    if (count <= 6) return [2, 3];
    if (count <= 9) return [3, 3];
    if (count <= 12) return [3, 4];
    return [3, 5];
  }
  if (count <= 3) return [Math.max(1, count), 1];
  if (count === 4) return [4, 1];
  if (count <= 6) return [3, 2];
  if (count <= 8) return [4, 2];
  if (count <= 10) return [5, 2];
  if (count <= 12) return [4, 3];
  return [5, 3];
}

function cards(parts: string[], doc: LayoutDocument, design: MenuDesign, c: DesignColors, f: { head: string; body: string }, art: DesignArt | undefined): DesignReport {
  const x0 = 64;
  const top = bandHeader(parts, doc, design, c, f, art, 168, x0) + 36;
  const footerH = doc.footer ? 46 : 0;
  const bottom = H - 44 - footerH;
  const all = flatItems(doc);
  const shownItems = all.slice(0, CARD_CAPACITY);
  const [cols, rows] = cardGrid(shownItems.length);
  const gap = 26;
  const cardW = (W - x0 * 2 - (cols - 1) * gap) / cols;
  const cardH = (bottom - top - (rows - 1) * gap) / rows;
  const circle = design.look.photoShape === "circle";
  const dark = luminance(c.paper) < 0.25;
  const cardBg = circle ? c.paper : dark ? mix(c.paper, "#ffffff", 0.07) : "#ffffff";
  const condensed = design.look.head === "bebas-neue" || design.look.head === "oswald";
  const photoOf = itemPhotoResolver(art);
  const multiSection = new Set(all.map((x) => x.section)).size > 1;
  const nameSize0 = Math.max(22, Math.min(condensed ? 50 : 38, cardW * (condensed ? 0.1 : 0.075))) * (rows === 3 ? 0.9 : 1);
  const nameSize = run?.active ? Math.max(Math.min(READABLE_FLOORS.itemName, nameSize0), nameSize0 * roleScale("itemName")) : nameSize0;
  shownItems.forEach(({ item, section }, i) => {
    const x = x0 + (i % cols) * (cardW + gap);
    const y = top + Math.floor(i / cols) * (cardH + gap);
    if (!circle) parts.push(rect(x, y, cardW, cardH, cardBg, `rx="20"${dark ? "" : ` stroke="${mix(c.ink, c.paper, 0.86)}" stroke-width="2"`}`));
    let photoBottom: number;
    if (circle) {
      const d = Math.min(cardW * 0.66, cardH * 0.52);
      photoTile(parts, photoOf(item), x + (cardW - d) / 2, y + 6, d, d, d / 2, c, initialOf(item.name), cardBg, true);
      parts.push(`<circle cx="${n(x + cardW / 2)}" cy="${n(y + 6 + d / 2)}" r="${n(d / 2 + 5)}" fill="none" stroke="${mix(c.accent, c.paper, 0.55)}" stroke-width="3"/>`);
      photoBottom = y + 6 + d + 18;
    } else {
      const ph = cardH * (rows === 1 ? 0.58 : rows === 2 ? 0.5 : 0.46);
      photoTile(parts, photoOf(item), x + 10, y + 10, cardW - 20, ph - 10, 14, c, initialOf(item.name), cardBg);
      photoBottom = y + ph + 16;
    }
    const tx = circle ? x + cardW / 2 : x + 20;
    const tw = cardW - 40;
    const anchor = circle ? "middle" as const : undefined;
    const ink = dark ? c.ink : readableOn(c.ink, cardBg, 4.5).color;
    const muted = readableOn(c.muted, cardBg, 4.5).color;
    const accent = readableOn(c.accent, cardBg, 3).color;
    const priceSize0 = nameSize0 * (condensed ? 1 : 0.95);
    const priceFloor = run?.active ? Math.min(READABLE_FLOORS.price, priceSize0) : 0;
    const priceSize = run?.active ? Math.max(priceFloor, priceSize0 * roleScale("price")) : priceSize0;
    const priceFam0 = design.look.tags ? { family: condensed ? f.head : f.body, weight: condensed ? design.look.headWeight : 800 } : { family: circle ? f.head : f.body, weight: circle ? design.look.headWeight : 800 };
    const priceFam = { family: priceFam0.family, weight: roleWeight("price", priceFam0.family, priceFam0.weight) };
    const priceW = item.price ? textWidth(item.price, priceSize, priceFam.family, priceFam.weight) + (design.look.tags ? priceSize * 0.64 : 0) : 0;
    // Rectangular cards put the price on the name row (right), so the description has room; round cards centre it below.
    const priceBelow = circle;
    const priceH = item.price && priceBelow ? (design.look.tags ? priceSize * 1.3 : priceSize * 1.1) : 0;
    const room = y + cardH - 14 - priceH - photoBottom;
    let ns = nameSize;
    // The section label is not a customizable role on cards: it keeps the template size when names are resized.
    const labelSize = Math.max(14, (run?.active ? nameSize0 : ns) * 0.42);
    const nameFam0 = condensed ? { family: f.head, weight: design.look.headWeight } : { family: f.body, weight: 800 };
    const nameFam = { family: nameFam0.family, weight: roleWeight("itemName", nameFam0.family, nameFam0.weight) };
    const nameText = condensed ? item.name.toUpperCase() : item.name;
    const nameW = () => (priceBelow ? tw : Math.max(tw * 0.45, tw - priceW - 14));
    let lines = wrapText(nameText, ns, nameFam.family, nameFam.weight, nameW(), 2);
    const descSize = Math.max(15, ns * 0.5 * (run?.active ? run.active.scale.description / run.active.scale.itemName : 1));
    let desc = item.description ? wrapText(item.description, descSize, f.body, 400, tw, 2) : [];
    const need = () => (multiSection ? labelSize * 1.5 : 0) + lines.length * ns * 1.1 + (desc.length ? 6 + desc.length * descSize * 1.3 : 0);
    if (need() > room && desc.length > 1) desc = wrapText(item.description, descSize, f.body, 400, tw, 1);
    if (need() > room) desc = [];
    // Customized names stop at the readable floor (or the template's own size if smaller); what still does not fit is reported.
    const nsMin = run?.active ? Math.max(18, Math.min(READABLE_FLOORS.itemName, nameSize0)) : 18;
    while (need() > room && ns > nsMin) { ns -= 2; lines = wrapText(nameText, ns, nameFam.family, nameFam.weight, nameW(), 2); }
    let ty = photoBottom;
    if (multiSection && section) {
      parts.push(text(tx, ty + labelSize, ellipsize(section.toUpperCase(), labelSize, f.body, 700, tw, 0.14), { size: labelSize, family: f.body, weight: 700, fill: accent, tracking: 0.14, anchor }));
      ty += labelSize * 1.5;
    }
    const nameTop = ty;
    if (run) {
      const at = run.items.get(item);
      if (at) addRegion(itemRegion(item, at[0], at[1], { x, y, w: cardW, h: cardH }));
      note("menu", nameText, lines);
      if (item.description) note("menu", item.description, desc.length ? desc : ["…"]);
    }
    lines.forEach((line) => { ty += ns * 1.02; parts.push(text(tx, ty, line, { size: ns, family: nameFam.family, weight: nameFam.weight, fill: ink, anchor })); ty += ns * 0.08; });
    if (desc.length) {
      ty += 6;
      desc.forEach((line) => { ty += descSize * 1.05; parts.push(text(tx, ty, line, { size: descSize, family: f.body, weight: 400, fill: muted, anchor })); ty += descSize * 0.25; });
    }
    if (item.price) {
      const ps = priceBelow ? priceSize : Math.max(Math.min(priceSize, ns * 1.05), priceFloor);
      const th = ps * 1.25;
      const pw = textWidth(item.price, ps, priceFam.family, priceFam.weight) + (design.look.tags ? ps * 0.64 : 0);
      // Price box: below the text on round cards, at the right of the first name line on rectangular cards.
      const px = priceBelow ? x + (cardW - pw) / 2 : x + cardW - 20 - pw;
      // Vertical boards have tall cards: a round card's price sits right under its text instead of at the card's foot.
      const pyTop = priceBelow ? (isPortrait() ? Math.min(y + cardH - 18 - th, ty + 14) : y + cardH - 18 - th) : nameTop + (ns * 1.1 - th) / 2;
      if (design.look.tags) {
        parts.push(rect(px, pyTop, pw, th, c.tag, `rx="${n(ps * 0.22)}"`));
        parts.push(text(px + pw / 2, pyTop + th / 2 + ps * 0.36, item.price, { size: ps, family: priceFam.family, weight: priceFam.weight, fill: c.tagInk, anchor: "middle" }));
      } else {
        parts.push(text(priceBelow ? x + cardW / 2 : x + cardW - 20, pyTop + th / 2 + ps * 0.36, item.price, { size: ps, family: priceFam.family, weight: priceFam.weight, fill: accent, anchor: priceBelow ? "middle" : "end" }));
      }
    }
  });
  if (doc.footer) parts.push(text(x0, H - 40, ellipsize(doc.footer, 24, f.body, 400, W - x0 * 2), { size: 24, family: f.body, weight: 400, fill: c.muted }));
  return { dropped: all.length - shownItems.length, scale: rows === 3 ? 0.8 : 1 };
}

/** Items featured on the right: owner-uploaded photos first, then template sample photos (up to 3), else the first two. */
export function featuredItems(doc: LayoutDocument): LayoutItem[] {
  const all = flatItems(doc).map((x) => x.item);
  const owner = all.filter((item) => Boolean(item.imageMediaId));
  const sample = all.filter((item) => !item.imageMediaId && Boolean(item.stockPhoto));
  const withPhotos = [...owner, ...sample].slice(0, 3);
  return withPhotos.length ? withPhotos : all.slice(0, 2);
}

function featured(parts: string[], doc: LayoutDocument, design: MenuDesign, c: DesignColors, f: { head: string; body: string }, art: DesignArt | undefined): DesignReport {
  if (isPortrait()) return featuredPortrait(parts, doc, design, c, f, art);
  const L = 1100; const x0 = 84; const top = 84;
  parts.push(rect(0, 0, W, H, c.paper));
  parts.push(rect(L, 0, W - L, H, c.panel));
  const logoSize = logo(parts, safeDesignHref(art?.logoHref), x0, top, 96, c.paper);
  const tx = x0 + (logoSize ? logoSize + 26 : 0);
  const maxW = L - x0 - 72 - (logoSize ? logoSize + 26 : 0);
  const t = titleFit(doc.title || "", maxW, 78, 48, f.head, design.look.headWeight);
  note("businessName", doc.title || "", t.value);
  const titleBase = top + t.size * 0.84 + (logoSize ? Math.max(0, (96 - t.size * 1.6) / 2) : 0);
  if (t.value) parts.push(text(tx, titleBase, t.value, { size: t.size, family: f.head, weight: t.weight, fill: c.ink }));
  let headBottom = titleBase + t.size * 0.22;
  if (doc.subtitle) {
    parts.push(text(tx, titleBase + 46, ellipsize(doc.subtitle.toUpperCase(), 22, f.body, 700, maxW, 0.2), { size: 22, family: f.body, weight: 700, fill: c.accent, tracking: 0.2 }));
    headBottom = titleBase + 54;
  }
  headBottom = Math.max(headBottom, logoSize ? top + logoSize : 0);
  addRegion(fixedRegion("businessName", { x: x0, y: top, w: L - x0 - 72, h: headBottom - top + 8 }));
  parts.push(rect(x0, headBottom + 34, 160, 2, mix(c.accent, c.paper, 0.6)));
  const menuTop = headBottom + 72;
  const footerH = doc.footer ? 50 : 0;
  const colH = H - 64 - footerH - menuTop;
  const picks = featuredItems(doc);
  const rest = doc.sections.map((section) => ({ ...section, items: section.items.filter((item) => !picks.includes(item)) }));
  if (run) rest.forEach((section, i) => run!.sections.set(section, i));
  const avail = L - x0 - 72;
  const restHasOwnerPhoto = rest.some((section) => section.items.some((item) => Boolean(item.imageMediaId)));
  const result = fitPhotos(rest, baseStyle(design, f, { name: 34, price: 34, desc: 22, section: 26, itemGap: 20, sectionGap: 38, headGap: 20 }), [{ cols: 1, colW: avail }, { cols: 2, colW: (avail - 56) / 2 }], colH, 1.2, 0.55, 0.92, restHasOwnerPhoto, false, restHasOwnerPhoto ? itemPhotoResolver(art) : undefined);
  paintColumns(parts, result, x0, menuTop, result.cols === 1 ? avail : (avail - 56) / 2, 56, c);
  if (doc.footer) parts.push(text(x0, H - 52, ellipsize(doc.footer, 22, f.head, 400, avail), { size: 22, family: f.head, weight: 400, fill: c.muted }));
  // Featured dishes: large photo, name, description and price; the photo never covers the text.
  featuredCards(parts, picks, { x: L, y: 0, w: W - L, h: H }, design, c, f, art);
  return { dropped: result.dropped, scale: result.scale, photosSuppressed: result.photosSuppressed };
}

/** The featured dish cards, stacked in the panel box (right column on horizontal boards, bottom band on vertical). */
function featuredCards(parts: string[], picks: LayoutItem[], panel: { x: number; y: number; w: number; h: number }, design: MenuDesign, c: DesignColors, f: { head: string; body: string }, art: DesignArt | undefined) {
  const L = panel.x; const R = panel.x + panel.w;
  const pad = 56; const k = picks.length; const gapY = 34;
  const cardH = (panel.h - pad * 2 - (k - 1) * gapY) / Math.max(1, k);
  const photoOf = itemPhotoResolver(art);
  const ink = c.panelInk;
  const accent = readableOn(c.accent, c.panel, 3).color;
  picks.forEach((item, i) => {
    const y = panel.y + pad + i * (cardH + gapY);
    const at = run?.items.get(item);
    if (at) addRegion(itemRegion(item, at[0], at[1], { x: L, y, w: panel.w, h: cardH }));
    const side = Math.min(cardH, k === 1 ? 520 : 300);
    const px = L + pad;
    photoTile(parts, photoOf(item), px, y + (cardH - side) / 2, side, side, 18, c, initialOf(item.name), c.panel);
    const fx = px + side + 36; const fw = R - pad - fx;
    const ns = k === 1 ? 52 : 40;
    const lines = wrapText(item.name, ns, f.head, design.look.headWeight, fw, 2);
    const desc = item.description ? wrapText(item.description, 22, f.body, 400, fw, k === 3 ? 2 : 3) : [];
    const blockH = lines.length * ns * 1.12 + (desc.length ? 10 + desc.length * 30 : 0) + (item.price ? 56 : 0);
    let ty = y + Math.max(0, (cardH - blockH) / 2);
    lines.forEach((line) => { ty += ns; parts.push(text(fx, ty, line, { size: ns, family: f.head, weight: design.look.headWeight, fill: ink })); ty += ns * 0.12; });
    if (desc.length) { ty += 10; desc.forEach((line) => { ty += 24; parts.push(text(fx, ty, line, { size: 22, family: f.body, weight: 400, fill: ink, opacity: 0.85 })); ty += 6; }); }
    if (item.price) { ty += 48; parts.push(text(fx, ty, item.price, { size: 36, family: f.body, weight: 800, fill: accent })); }
  });
}

/* ---------------- vertical (9:16) compositions ----------------
 * The same template, fonts, colours, sizes and fitting on a 1080×1920 canvas. Only the arrangement changes: the
 * right-hand photo/video/feature column becomes a full-width band at the bottom, and the menu uses the full width
 * above it (one column, or two when that fits more). Horizontal boards never reach these functions.
 */

/** Business name (with logo and subtitle) across the top, as the template draws it. Returns the header's bottom. */
function portraitHeader(parts: string[], doc: LayoutDocument, design: MenuDesign, c: DesignColors, f: { head: string; body: string }, art: DesignArt | undefined,
  o: { x0: number; top: number; logo: number; start: number; min: number; upper?: boolean; tracking?: number; cap?: number; sub: "accent" | "muted" | "chip" }) {
  const logoSize = logo(parts, safeDesignHref(art?.logoHref), o.x0, o.top, o.logo, c.paper);
  const tx = o.x0 + (logoSize ? logoSize + 26 : 0);
  const maxW = W - o.x0 * 2 - (logoSize ? logoSize + 26 : 0);
  const value = o.upper ? (doc.title || "").toUpperCase() : doc.title || "";
  const t = titleFit(value, maxW, o.start, o.min, f.head, design.look.headWeight, o.tracking ?? 0, o.cap ?? Infinity);
  note("businessName", value, t.value);
  const titleBase = o.top + t.size * 0.84 + (logoSize ? Math.max(0, (o.logo - t.size * 1.6) / 2) : 0);
  if (t.value) parts.push(text(tx, titleBase, t.value, { size: t.size, family: f.head, weight: t.weight, fill: c.ink, ...(o.tracking ? { tracking: o.tracking } : {}) }));
  let headBottom = titleBase + t.size * 0.22;
  if (doc.subtitle) {
    if (o.sub === "chip") {
      const chipText = ellipsize(doc.subtitle.toUpperCase(), 24, f.body, 800, maxW - 40, 0.08);
      const cw = textWidth(chipText, 24, f.body, 800, 0.08) + 28;
      const cy = titleBase + 22;
      parts.push(`<g transform="translate(${n(tx)} ${n(cy)}) skewX(-8)">${rect(0, 0, cw, 42, c.accent)}${text(14, 30, chipText, { size: 24, family: f.body, weight: 800, fill: bestInk(c.accent), tracking: 0.08 })}</g>`);
      headBottom = cy + 42;
    } else if (o.sub === "accent") {
      parts.push(text(tx, titleBase + 50, ellipsize(doc.subtitle.toUpperCase(), 24, f.body, 700, maxW, 0.22), { size: 24, family: f.body, weight: 700, fill: c.accent, tracking: 0.22 }));
      headBottom = titleBase + 58;
    } else {
      parts.push(text(tx, titleBase + 46, ellipsize(doc.subtitle, 26, f.body, 400, maxW), { size: 26, family: f.body, weight: 400, fill: c.muted }));
      headBottom = titleBase + 54;
    }
  }
  headBottom = Math.max(headBottom, logoSize ? o.top + logoSize : 0);
  addRegion(fixedRegion("businessName", { x: o.x0, y: o.top, w: W - o.x0 * 2, h: headBottom - o.top + 8 }));
  return headBottom;
}

/** Menu in the area above the band: one column, or two when that fits more (the fitter picks, nothing is dropped silently). */
function portraitMenu(parts: string[], doc: LayoutDocument, design: MenuDesign, c: DesignColors, f: { head: string; body: string }, art: DesignArt | undefined,
  sections: LayoutSection[], box: { x0: number; top: number; bottom: number }, sizes: Parameters<typeof baseStyle>[2], gap: number, maxScale: number, photos: { want: boolean; placeholders: boolean }) {
  const avail = W - box.x0 * 2;
  const colW2 = (avail - gap) / 2;
  const result = fitPhotos(sections, baseStyle(design, f, sizes), [{ cols: 1, colW: avail }, { cols: 2, colW: colW2 }], box.bottom - box.top, maxScale, 0.55, 0.9, photos.want, photos.placeholders, photos.want ? itemPhotoResolver(art) : undefined);
  paintColumns(parts, result, box.x0, box.top, result.cols === 1 ? avail : colW2, gap, c);
  return result;
}

function showcasePortrait(parts: string[], doc: LayoutDocument, design: MenuDesign, c: DesignColors, f: { head: string; body: string }, art: DesignArt | undefined): DesignReport {
  const MB = mediaBand(run?.active ?? null, SHOWCASE_MEDIA); const T = H - MB; const x0 = 72; const top = 84;
  parts.push(rect(0, 0, W, H, c.paper));
  const photo = photoHref(doc, art);
  if (photo) {
    parts.push(photoImage(photo, { x: 0, y: T, w: W, h: MB }, doc));
    parts.push(`<defs><linearGradient id="dg-fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0.44" stop-color="${c.paper}" stop-opacity="0"/><stop offset="0.86" stop-color="${c.paper}" stop-opacity="0.95"/><stop offset="1" stop-color="${c.paper}" stop-opacity="0.98"/></linearGradient></defs>`);
    parts.push(rect(0, T, W, MB, "url(#dg-fade)"));
  } else {
    parts.push(rect(0, T, W, MB, c.panel));
  }
  const headBottom = portraitHeader(parts, doc, design, c, f, art, { x0, top, logo: 104, start: 86, min: 52, sub: "accent" });
  parts.push(rect(x0, headBottom + 40, 180, 2, mix(c.accent, c.paper, 0.6)));
  const menuTop = headBottom + 84;
  const footerH = doc.footer ? 52 : 0;
  const shown = itemPhotosShown(doc, design);
  const result = portraitMenu(parts, doc, design, c, f, art, doc.sections, { x0, top: menuTop, bottom: T - 56 - footerH }, { name: 38, price: 38, desc: 25, section: 30, itemGap: 22, sectionGap: 44, headGap: 24 }, 64, 1.25, { want: shown, placeholders: isPhotoDesign(design) });
  if (doc.footer) parts.push(text(x0, T - 44, ellipsize(doc.footer, 24, f.head, 400, W - x0 * 2), { size: 24, family: f.head, weight: 400, fill: c.muted }));
  const title = (doc.featureTitle || "").trim(); const detail = (doc.featureDetail || "").trim();
  addRegion(fixedRegion("featuredMedia", { x: 0, y: T, w: W, h: MB - (title || detail ? 200 : 0) }));
  if (title || detail) {
    const fx = 64; const fw = W - 128;
    const ink = photo ? c.ink : c.panelInk;
    const ds = roleSize("featuredText", 40); const ts = roleSize("featuredText", 22); const dw = roleWeight("featuredText", f.head, 400);
    const lines = detail ? wrapText(detail, ds, f.head, dw, fw, 2) : [];
    note("featuredText", detail, lines);
    const y = H - 60 - (lines.length - 1) * (50 * ds / 40);
    lines.forEach((line, i) => parts.push(text(fx, y + i * (50 * ds / 40), line, { size: ds, family: f.head, weight: dw, fill: ink })));
    const label = title ? ellipsize(title.toUpperCase(), ts, f.body, 700, fw, 0.24) : "";
    note("featuredText", title.toUpperCase(), label);
    if (title) parts.push(text(fx, (lines.length ? y : H - 60) - (lines.length ? 64 * ds / 40 : 0), label, { size: ts, family: f.body, weight: 700, fill: photo ? c.accent : c.panelInk, tracking: 0.24 }));
    addRegion(fixedRegion("featuredText", { x: 0, y: H - 200, w: W, h: 200 }));
  }
  return { dropped: result.dropped, scale: result.scale, photosSuppressed: result.photosSuppressed };
}

function columnsPortrait(parts: string[], doc: LayoutDocument, design: MenuDesign, c: DesignColors, f: { head: string; body: string }, art: DesignArt | undefined): DesignReport {
  const MB = mediaBand(run?.active ?? null, COLUMNS_MEDIA); const PT = H - COLUMNS_PANEL; const T = PT - MB; const x0 = 72; const top = 80;
  parts.push(rect(0, 0, W, H, c.paper));
  const photo = photoHref(doc, art);
  if (photo) parts.push(photoImage(photo, { x: 0, y: T, w: W, h: MB }, doc));
  else parts.push(rect(0, T, W, MB, mix(c.panel, c.paper, 0.6)));
  parts.push(rect(0, PT, W, COLUMNS_PANEL, c.panel));
  const headBottom = portraitHeader(parts, doc, design, c, f, art, { x0, top, logo: 92, start: 68, min: 44, sub: "muted" });
  const menuTop = headBottom + 56;
  const footerH = doc.footer ? 62 : 0;
  const shown = itemPhotosShown(doc, design);
  const result = portraitMenu(parts, doc, design, c, f, art, doc.sections, { x0, top: menuTop, bottom: T - 48 - footerH }, { name: 36, price: 36, desc: 24, section: 30, itemGap: 20, sectionGap: 46, headGap: 22 }, 64, 1.3, { want: shown, placeholders: isPhotoDesign(design) });
  if (doc.footer) {
    parts.push(rect(x0, T - 48 - 40, W - x0 * 2, 2, mix(c.muted, c.paper, 0.7)));
    parts.push(text(x0, T - 48, ellipsize(doc.footer, 22, f.body, 400, W - x0 * 2), { size: 22, family: f.body, weight: 400, fill: c.muted }));
  }
  const title = (doc.featureTitle || "").trim(); const detail = (doc.featureDetail || "").trim();
  addRegion(fixedRegion("featuredMedia", { x: 0, y: T, w: W, h: MB }));
  if (title || detail) {
    const fx = 56; const fw = W - 112;
    const ts = roleSize("featuredText", 54); const ds = roleSize("featuredText", 28); const kt = ts / 54; const kd = ds / 28;
    const tw = roleWeight("featuredText", f.head, design.look.headWeight);
    const tl = title ? wrapText(title, ts, f.head, tw, fw, 2) : [];
    const dl = detail ? wrapText(detail, ds, f.body, 400, fw, 2) : [];
    note("featuredText", title, tl); note("featuredText", detail, dl);
    const blockH = tl.length * 58 * kt + (dl.length ? 16 + dl.length * 36 * kd : 0);
    let y = PT + (COLUMNS_PANEL - blockH) / 2;
    tl.forEach((line) => { parts.push(text(fx, y + 46 * kt, line, { size: ts, family: f.head, weight: tw, fill: c.panelInk })); y += 58 * kt; });
    if (dl.length) y += 16;
    dl.forEach((line) => { parts.push(text(fx, y + 27 * kd, line, { size: ds, family: f.body, weight: 400, fill: c.panelInk, opacity: 0.92 })); y += 36 * kd; });
    addRegion(fixedRegion("featuredText", { x: 0, y: PT, w: W, h: COLUMNS_PANEL }));
  }
  return { dropped: result.dropped, scale: result.scale, photosSuppressed: result.photosSuppressed };
}

function promoPortrait(parts: string[], doc: LayoutDocument, design: MenuDesign, c: DesignColors, f: { head: string; body: string }, art: DesignArt | undefined): DesignReport {
  const PB = mediaBand(run?.active ?? null, PROMO_MEDIA); const PT = H - PROMO_PANEL; const T = PT - PB; const x0 = 72; const top = 70;
  parts.push(rect(0, 0, W, H, c.paper));
  parts.push(rect(0, T, W, H - T, c.panel));
  const photo = photoHref(doc, art);
  if (photo) {
    parts.push(photoImage(photo, { x: 0, y: T, w: W, h: PB }, doc));
    parts.push(`<defs><linearGradient id="dg-panel" x1="0" y1="0" x2="0" y2="1"><stop offset="0.55" stop-color="${c.panel}" stop-opacity="0"/><stop offset="1" stop-color="${c.panel}" stop-opacity="1"/></linearGradient></defs>`);
    parts.push(rect(0, T, W, PB, "url(#dg-panel)"));
  }
  const headBottom = portraitHeader(parts, doc, design, c, f, art, { x0, top, logo: 110, start: 132, min: 72, upper: true, tracking: 0.01, cap: 150, sub: "chip" });
  const menuTop = headBottom + 44;
  const footerH = doc.footer ? 46 : 0;
  const shown = itemPhotosShown(doc, design);
  const result = portraitMenu(parts, doc, design, c, f, art, doc.sections, { x0, top: menuTop, bottom: T - 40 - footerH }, { name: 38, price: 42, desc: 25, section: 62, itemGap: 22, sectionGap: 40, headGap: 18 }, 64, 1.25, { want: shown, placeholders: isPhotoDesign(design) });
  if (doc.footer) parts.push(text(x0, T - 40, ellipsize(doc.footer.toUpperCase(), 22, f.body, 700, W - x0 * 2, 0.06), { size: 22, family: f.body, weight: 700, fill: c.muted, tracking: 0.06 }));
  const title = (doc.featureTitle || "").trim(); const detail = (doc.featureDetail || "").trim();
  const price = (detail.match(/[$€£]\s?\d+(?:[.,]\d{1,2})?/) || [""])[0];
  const badgeInPanel = Boolean(doc.videoMediaId);
  const fx = 56; const fw = W - 112 - (badgeInPanel && price ? 210 : 0);
  addRegion(fixedRegion("featuredMedia", { x: 0, y: T, w: W, h: PB }));
  if (title || detail) {
    const ts = roleSize("featuredText", 104); const ds = roleSize("featuredText", 30); const kt = ts / 104; const kd = ds / 30;
    const tw = roleWeight("featuredText", f.head, design.look.headWeight);
    const tl = title ? wrapText(title.toUpperCase(), ts, f.head, tw, fw, 2) : [];
    const dl = detail ? wrapText(detail, ds, f.body, 700, fw, 2) : [];
    note("featuredText", title.toUpperCase(), tl); note("featuredText", detail, dl);
    const y = H - 56 - (dl.length ? (dl.length - 1) * 38 * kd : 0);
    dl.forEach((line, i) => parts.push(text(fx, y + i * 38 * kd, line, { size: ds, family: f.body, weight: 700, fill: c.panelInk })));
    const ty = (dl.length ? y - 30 * kd - 22 : H - 56) - (tl.length - 1) * 94 * kt;
    tl.forEach((line, i) => parts.push(text(fx, ty + i * 94 * kt, line, { size: ts, family: f.head, weight: tw, fill: c.panelInk })));
    addRegion(fixedRegion("featuredText", { x: 0, y: PT, w: W, h: PROMO_PANEL }));
  }
  if (price) {
    const r = 95;
    const cx = W - 46 - r; const cy = badgeInPanel ? PT + 10 + r : T + 46 + r;
    const size = Math.min(58, (r * 1.55 * 1000) / Math.max(1, textWidth(price, 1000, f.head, design.look.headWeight)));
    parts.push(`<g transform="rotate(-10 ${n(cx)} ${n(cy)})"><circle cx="${n(cx)}" cy="${n(cy + 8)}" r="${r}" fill="#000000" fill-opacity="0.28"/><circle cx="${n(cx)}" cy="${n(cy)}" r="${r}" fill="${c.tag}"/>${text(cx, cy + size * 0.36, price, { size, family: f.head, weight: design.look.headWeight, fill: c.tagInk, anchor: "middle" })}</g>`);
  }
  return { dropped: result.dropped, scale: result.scale, photosSuppressed: result.photosSuppressed };
}

function featuredPortrait(parts: string[], doc: LayoutDocument, design: MenuDesign, c: DesignColors, f: { head: string; body: string }, art: DesignArt | undefined): DesignReport {
  const picks = featuredItems(doc);
  const FP = Math.round(H * FEATURED_PANEL * (picks.length >= 3 ? 1 : picks.length === 2 ? 0.8 : 0.6)); const T = H - FP; const x0 = 72; const top = 84;
  parts.push(rect(0, 0, W, H, c.paper));
  parts.push(rect(0, T, W, FP, c.panel));
  const headBottom = portraitHeader(parts, doc, design, c, f, art, { x0, top, logo: 96, start: 78, min: 48, sub: "accent" });
  parts.push(rect(x0, headBottom + 34, 160, 2, mix(c.accent, c.paper, 0.6)));
  const menuTop = headBottom + 72;
  const footerH = doc.footer ? 50 : 0;
  const rest = doc.sections.map((section) => ({ ...section, items: section.items.filter((item) => !picks.includes(item)) }));
  if (run) rest.forEach((section, i) => run!.sections.set(section, i));
  const restHasOwnerPhoto = rest.some((section) => section.items.some((item) => Boolean(item.imageMediaId)));
  const result = portraitMenu(parts, doc, design, c, f, art, rest, { x0, top: menuTop, bottom: T - 48 - footerH }, { name: 34, price: 34, desc: 22, section: 26, itemGap: 20, sectionGap: 38, headGap: 20 }, 56, 1.2, { want: restHasOwnerPhoto, placeholders: false });
  if (doc.footer) parts.push(text(x0, T - 44, ellipsize(doc.footer, 22, f.head, 400, W - x0 * 2), { size: 22, family: f.head, weight: 400, fill: c.muted }));
  featuredCards(parts, picks, { x: 0, y: T, w: W, h: FP }, design, c, f, art);
  return { dropped: result.dropped, scale: result.scale, photosSuppressed: result.photosSuppressed };
}

/** The full board (1920×1080, or 1080×1920 when vertical) for a design document, plus how the text was fitted. */
export function designSvgWithReport(doc: LayoutDocument, art?: DesignArt): { svg: string; report: DesignReport } {
  const active = activeCustom(doc);
  // A customized board starts from the scale the template itself fits the menu at (see fitC).
  const s0 = active ? renderDesign(doc, art, null, 1).report.scale : 1;
  return renderDesign(doc, art, active, s0);
}
function renderDesign(doc: LayoutDocument, art: DesignArt | undefined, active: ActiveCustom | null, s0: number): { svg: string; report: DesignReport } {
  return onCanvas(doc, () => renderDesignOn(doc, art, active, s0));
}
function renderDesignOn(doc: LayoutDocument, art: DesignArt | undefined, active: ActiveCustom | null, s0: number): { svg: string; report: DesignReport } {
  const design = designById(doc.design)!;
  const c = designColors(doc, design);
  const f = fonts(doc, design);
  const parts: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`];
  clipSeq = 0;
  const sections = new Map<object, number>();
  const items = new Map<object, [number, number]>();
  doc.sections.forEach((section, si) => { sections.set(section, si); section.items.forEach((item, ii) => items.set(item, [si, ii])); });
  const previous = run;
  run = { active, s0, regions: [], clips: emptyClips(), sections, items, imageSize: art?.imageSize ?? null, doc };
  try {
    const draw = { showcase, columns, promo, list, cards, featured }[design.composition];
    const report = draw(parts, doc, design, c, f, art);
    parts.push("</svg>");
    return { svg: parts.join(""), report: { ...report, clips: run.clips, regions: run.regions } };
  } finally {
    run = previous;
  }
}
export function designSvg(doc: LayoutDocument, art?: DesignArt): string {
  return designSvgWithReport(doc, art).svg;
}
