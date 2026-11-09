/** Layout Studio boards. Shared by the editor and the server. No database and no HTML from clients. */

import { MENU_LIMITS } from "@/lib/menu-templates";

export { MENU_LIMITS };

export const LAYOUT_VERSION = 1;
export const BOARD_W = 1920;
export const BOARD_H = 1080;

export type LayoutTemplate = "menu-promo-67" | "triple-column" | "split-50" | "menu-banner" | "signature";
export type ZoneBox = { x: number; y: number; w: number; h: number };
export type LayoutItem = { name: string; price: string; description: string };
export type LayoutSection = { name: string; items: LayoutItem[] };

export type LayoutDocument = {
  layoutVersion: 1;
  template: LayoutTemplate;
  split: number;
  title: string;
  subtitle: string;
  footer: string;
  sections: LayoutSection[];
  /** Same-account JPEG or PNG. Empty when the side is only the video poster. */
  imageMediaId: string | null;
  /** At most one. Same-account MP4. The PNG still draws a poster in this box. */
  videoMediaId: string | null;
};

export type LayoutFrame = {
  template: LayoutTemplate;
  split: number;
  menu: ZoneBox;
  /** Painted region for the still. Signature uses the full board as the background. */
  feature: ZoneBox;
  /**
   * Where a muted video may sit. Null when a video would cover menu text.
   * The three-column template has no safe video region: every column is menu text.
   */
  video: ZoneBox | null;
  columns: ZoneBox[];
};

const TEMPLATES: Record<LayoutTemplate, { min: number; max: number; def: number; name: string }> = {
  "menu-promo-67": { min: 0.55, max: 0.75, def: 0.67, name: "Menu and promotion" },
  "triple-column": { min: 0.25, max: 0.45, def: 1 / 3, name: "Three columns" },
  "split-50": { min: 0.4, max: 0.6, def: 0.5, name: "Split showcase" },
  "menu-banner": { min: 0.12, max: 0.28, def: 0.15, name: "Menu and banner" },
  signature: { min: 0.4, max: 0.7, def: 0.55, name: "Signature" },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function layoutStudioEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.LAYOUT_STUDIO === "1";
}

/** Local and Vercel preview only. Production stays closed. */
export function layoutStudioPreviewOpen(env: Record<string, string | undefined> = process.env): boolean {
  return env.VERCEL_ENV !== "production";
}

export function isLayoutTemplate(value: unknown): value is LayoutTemplate {
  return typeof value === "string" && value in TEMPLATES;
}

export function templateSpec(template: LayoutTemplate) {
  return TEMPLATES[template];
}

function clampSplit(template: LayoutTemplate, split: number) {
  const spec = TEMPLATES[template];
  if (!Number.isFinite(split)) return spec.def;
  return Math.min(spec.max, Math.max(spec.min, split));
}

function box(x: number, y: number, w: number, h: number): ZoneBox {
  return { x, y, w, h };
}

/** Integer boxes for one template. Menu columns plus one feature box cover the board. */
export function frameFor(template: LayoutTemplate, split: number): LayoutFrame {
  const ratio = clampSplit(template, split);
  if (template === "menu-banner") {
    const banner = Math.round(BOARD_H * ratio);
    const menu = box(0, 0, BOARD_W, BOARD_H - banner);
    const feature = box(0, BOARD_H - banner, BOARD_W, banner);
    return { template, split: ratio, menu, feature, video: feature, columns: [menu] };
  }
  if (template === "signature") {
    const overlay = Math.round(BOARD_W * ratio);
    const menu = box(0, 0, overlay, BOARD_H);
    // The still's background is the full board. The video stays in the strip
    // beside the menu card so it cannot cover the menu text.
    return {
      template, split: ratio, menu,
      feature: box(0, 0, BOARD_W, BOARD_H),
      video: box(overlay, 0, BOARD_W - overlay, BOARD_H),
      columns: [menu],
    };
  }
  if (template === "triple-column") {
    const first = Math.round(BOARD_W * ratio);
    const rest = BOARD_W - first;
    const second = Math.round(rest / 2);
    const columns = [box(0, 0, first, BOARD_H), box(first, 0, second, BOARD_H), box(first + second, 0, rest - second, BOARD_H)];
    return { template, split: ratio, menu: box(0, 0, BOARD_W, BOARD_H), feature: columns[2], video: null, columns };
  }
  const left = Math.round(BOARD_W * ratio);
  const menu = box(0, 0, left, BOARD_H);
  const feature = box(left, 0, BOARD_W - left, BOARD_H);
  return { template, split: ratio, menu, feature, video: feature, columns: [menu] };
}

export function boxesOverlap(a: ZoneBox, b: ZoneBox) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function text(value: unknown, max: number): string | null {
  if (value == null) return "";
  if (typeof value !== "string") return null;
  if (/[<>]/.test(value) || /script/i.test(value)) return null;
  const clean = value.replace(/\p{Cc}/gu, " ").replace(/\s+/g, " ").trim();
  return clean.length > max ? null : clean;
}

export function parseLayout(input: unknown): { ok: true; value: LayoutDocument } | { ok: false; error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "Choose a layout." };
  const raw = input as Record<string, unknown>;
  if (raw.layoutVersion !== 1) return { ok: false, error: "This layout version is not supported." };
  if (!isLayoutTemplate(raw.template)) return { ok: false, error: "Choose a layout." };
  const spec = TEMPLATES[raw.template];
  const split = typeof raw.split === "number" ? raw.split : spec.def;
  if (split < spec.min || split > spec.max) return { ok: false, error: "That proportion is outside this layout." };
  const title = text(raw.title, 40);
  const subtitle = text(raw.subtitle, 80);
  const footer = text(raw.footer, 80);
  if (title == null || subtitle == null || footer == null) return { ok: false, error: "Check the title and footer." };
  if (!Array.isArray(raw.sections) || raw.sections.length > MENU_LIMITS.sections) {
    return { ok: false, error: `Use up to ${MENU_LIMITS.sections} sections.` };
  }
  const sections: LayoutSection[] = [];
  let total = 0;
  for (const section of raw.sections) {
    if (!section || typeof section !== "object") return { ok: false, error: "Check your sections." };
    const sec = section as Record<string, unknown>;
    const name = text(sec.name, 30);
    if (name == null) return { ok: false, error: "Check your sections." };
    if (!Array.isArray(sec.items) || sec.items.length > MENU_LIMITS.itemsPerSection) {
      return { ok: false, error: `Use up to ${MENU_LIMITS.itemsPerSection} items per section.` };
    }
    const items: LayoutItem[] = [];
    for (const item of sec.items) {
      if (!item || typeof item !== "object") return { ok: false, error: "Check your items." };
      const row = item as Record<string, unknown>;
      const itemName = text(row.name, 40);
      const price = text(row.price, 12);
      const description = text(row.description, 80);
      if (itemName == null || price == null || description == null) return { ok: false, error: "Check your items." };
      // Blank rows are ignored, same as the existing menu editor. Named items are kept.
      if (!itemName) continue;
      items.push({ name: itemName, price: price ?? "", description: description ?? "" });
    }
    total += items.length;
    if (name || items.length) sections.push({ name: name ?? "", items });
  }
  if (total > MENU_LIMITS.items) return { ok: false, error: `Use up to ${MENU_LIMITS.items} items.` };
  const imageMediaId = raw.imageMediaId == null || raw.imageMediaId === "" ? null : String(raw.imageMediaId);
  const videoMediaId = raw.videoMediaId == null || raw.videoMediaId === "" ? null : String(raw.videoMediaId);
  if (imageMediaId && !UUID.test(imageMediaId)) return { ok: false, error: "Choose a photo from your library." };
  if (videoMediaId && !UUID.test(videoMediaId)) return { ok: false, error: "Choose a video from your library." };
  if (Array.isArray(raw.videos) && raw.videos.length > 1) return { ok: false, error: "A board can play one video." };
  return {
    ok: true,
    value: {
      layoutVersion: 1, template: raw.template, split, title: title ?? "", subtitle: subtitle ?? "", footer: footer ?? "",
      sections, imageMediaId, videoMediaId,
    },
  };
}

export function sampleLayout(template: LayoutTemplate = "menu-promo-67"): LayoutDocument {
  const samples: Record<LayoutTemplate, LayoutDocument> = {
    "menu-promo-67": {
      layoutVersion: 1, template, split: 0.67, title: "Casa Mesa", subtitle: "Lunch, served until 3",
      footer: "Ask about the daily special", imageMediaId: null, videoMediaId: null,
      sections: [
        { name: "Plates", items: [
          { name: "Pollo asado", price: "$14", description: "Citrus chicken, rice, salsa" },
          { name: "Carne asada", price: "$16", description: "Grilled steak and beans" },
          { name: "Market fish", price: "$18", description: "Today's catch, lime butter" },
        ] },
        { name: "Sides", items: [
          { name: "Street corn", price: "$5", description: "Chile, crema, cheese" },
          { name: "Greens", price: "$6", description: "Herb vinaigrette" },
        ] },
      ],
    },
    "triple-column": {
      layoutVersion: 1, template, split: 1 / 3, title: "Northbeam Coffee", subtitle: "Open from 7",
      footer: "Oat and almond milk at no charge", imageMediaId: null, videoMediaId: null,
      sections: [
        { name: "Coffee", items: [
          { name: "Drip", price: "$3", description: "Rotating single origin" },
          { name: "Cortado", price: "$4", description: "" },
        ] },
        { name: "Tea", items: [
          { name: "Jasmine", price: "$3.50", description: "Loose leaf" },
          { name: "Chai", price: "$4.50", description: "Steamed milk" },
        ] },
        { name: "Bakery", items: [
          { name: "Morning bun", price: "$4", description: "Orange zest" },
          { name: "Quiche", price: "$7", description: "Seasonal vegetables" },
        ] },
      ],
    },
    "split-50": {
      layoutVersion: 1, template, split: 0.5, title: "Harbor Gym", subtitle: "Today's floor",
      footer: "Towels at the desk", imageMediaId: null, videoMediaId: null,
      sections: [
        { name: "Classes", items: [
          { name: "Strength", price: "6:30", description: "Studio A" },
          { name: "Conditioning", price: "12:00", description: "Studio B" },
          { name: "Mobility", price: "5:30", description: "All levels" },
        ] },
      ],
    },
    "menu-banner": {
      layoutVersion: 1, template, split: 0.15, title: "Field & Vine", subtitle: "Groceries and lunch",
      footer: "Members save 10% after 4", imageMediaId: null, videoMediaId: null,
      sections: [
        { name: "Counter", items: [
          { name: "Soup and salad", price: "$11", description: "Rotates daily" },
          { name: "Grain bowl", price: "$13", description: "Greens, grains, tahini" },
        ] },
      ],
    },
    signature: {
      layoutVersion: 1, template, split: 0.55, title: "Evening service", subtitle: "From 5 PM",
      footer: "Reserve the patio", imageMediaId: null, videoMediaId: null,
      sections: [
        { name: "First", items: [
          { name: "Beet salad", price: "$12", description: "Citrus, pistachio" },
          { name: "Broth", price: "$10", description: "Ginger and greens" },
        ] },
        { name: "Mains", items: [
          { name: "Roast chicken", price: "$24", description: "Pan juices, potatoes" },
          { name: "Pasta", price: "$21", description: "Brown butter and sage" },
        ] },
      ],
    },
  };
  return samples[template];
}

export function esc(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Player acknowledgement. A video zone is not "shown" until it plays, or until playback fails and the full still remains. */
export type PaintPhase = "legacy" | "still" | "video-pending" | "video-playing" | "fallback";

export function paintAfterStill(hasVideoZone: boolean): { phase: PaintPhase; ack: boolean } {
  if (!hasVideoZone) return { phase: "legacy", ack: true };
  return { phase: "video-pending", ack: false };
}

export function paintAfterVideoPlaying(): { phase: PaintPhase; ack: boolean } {
  return { phase: "video-playing", ack: true };
}

export function paintAfterVideoFailed(stillOnScreen: boolean): { phase: PaintPhase; ack: boolean } {
  if (!stillOnScreen) return { phase: "video-pending", ack: false };
  return { phase: "fallback", ack: true };
}

export type CompositionVideo = { mediaId: string; url: string; box: ZoneBox };
export type PlayerComposition = { layoutVersion: 1; fallbackUrl: string; video?: CompositionVideo };

/** Additive player field. Omitted entirely when there is no video to play. */
export function playerComposition(doc: LayoutDocument, fallbackUrl: string, videoUrl: string | null): PlayerComposition | null {
  if (!doc.videoMediaId || !videoUrl) return null;
  const frame = frameFor(doc.template, doc.split);
  if (!frame.video) return null;
  return {
    layoutVersion: 1,
    fallbackUrl,
    video: { mediaId: doc.videoMediaId, url: videoUrl, box: frame.video },
  };
}

/** A photo href the renderer may paint. Anything else is ignored, not executed. */
export function safeImageHref(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/^data:image\/(png|jpeg);base64,[a-z0-9+/=\s]+$/i.test(value)) return value.replace(/\s/g, "");
  if (/^https:\/\/[^\s"'<>]+$/i.test(value)) return value;
  return null;
}

function clip(value: string, max: number) {
  const chars = Math.max(4, max);
  return value.length > chars ? `${value.slice(0, chars - 1)}…` : value;
}

const PAPER = "#f3ecdf";
const INK = "#1a1614";
const MUTED = "#5c534c";
const FEATURE = "#1c3330";
const FEATURE_INK = "#f3ecdf";

function itemBlock(section: LayoutSection, x: number, top: number, width: number, bottom: number) {
  const rows: string[] = [];
  let y = top;
  if (section.name) {
    rows.push(`<text x="${x}" y="${y}" font-family="Inter" font-size="18" font-weight="700" fill="${FEATURE}" letter-spacing="1.6">${esc(section.name.toUpperCase())}</text>`);
    y += 14;
    rows.push(`<rect x="${x}" y="${y}" width="36" height="3" fill="${FEATURE}"/>`);
    y += 28;
  }
  const count = section.items.length;
  const room = Math.max(count, 1);
  const rowH = Math.max(34, Math.min(76, Math.floor((bottom - y) / room)));
  const nameSize = rowH >= 64 ? 28 : rowH >= 46 ? 22 : 16;
  const showDesc = rowH >= 48 && section.items.some((item) => item.description);
  for (const item of section.items) {
    rows.push(`<text x="${x}" y="${y}" font-family="Inter" font-size="${nameSize}" font-weight="700" fill="${INK}">${esc(clip(item.name, Math.floor(width / (nameSize * 0.55))))}</text>`);
    if (item.price) rows.push(`<text x="${x + width}" y="${y}" text-anchor="end" font-family="Inter" font-size="${nameSize}" font-weight="700" fill="${INK}">${esc(item.price)}</text>`);
    if (showDesc && item.description) {
      rows.push(`<text x="${x}" y="${y + nameSize - 4}" font-family="Inter" font-size="15" fill="${MUTED}">${esc(clip(item.description, Math.floor(width / 8)))}</text>`);
    }
    y += rowH;
  }
  return rows.join("");
}

export type LayoutArt = { imageHref?: string | null };

/** Complete board. Menu text is never placed in the video box. The still does not claim a video is playing. */
export function layoutSvg(doc: LayoutDocument, art?: LayoutArt): string {
  const frame = frameFor(doc.template, doc.split);
  const href = safeImageHref(art?.imageHref);
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${BOARD_W}" height="${BOARD_H}" viewBox="0 0 ${BOARD_W} ${BOARD_H}">`,
    `<rect width="${BOARD_W}" height="${BOARD_H}" fill="${FEATURE}"/>`,
  ];
  const feature = frame.feature;
  const imageBox = doc.template === "signature" ? feature : (frame.video ?? feature);
  if (href) {
    parts.push(`<image href="${esc(href)}" x="${imageBox.x}" y="${imageBox.y}" width="${imageBox.w}" height="${imageBox.h}" preserveAspectRatio="xMidYMid slice"/>`);
  } else if (doc.template !== "triple-column") {
    const labelX = doc.template === "signature" ? frame.menu.w + 48 : imageBox.x + 40;
    const labelY = imageBox.y + Math.round(imageBox.h / 2);
    parts.push(`<text x="${labelX}" y="${labelY}" font-family="Inter" font-size="34" font-weight="700" fill="${FEATURE_INK}">${esc("Featured")}</text>`);
  }
  if (doc.template === "signature") {
    parts.push(`<rect x="48" y="56" width="${frame.menu.w - 96}" height="${BOARD_H - 112}" fill="${PAPER}"/>`);
  } else if (doc.template === "menu-banner") {
    parts.push(`<rect x="0" y="0" width="${BOARD_W}" height="${frame.menu.h}" fill="${PAPER}"/>`);
  } else {
    for (const column of frame.columns) parts.push(`<rect x="${column.x}" y="${column.y}" width="${column.w}" height="${column.h}" fill="${PAPER}"/>`);
  }
  const menu = doc.template === "signature"
    ? { x: 88, y: 120, w: frame.menu.w - 176, bottom: BOARD_H - 120 }
    : doc.template === "menu-banner"
      ? { x: 72, y: 88, w: BOARD_W - 144, bottom: frame.menu.h - 48 }
      : { x: frame.columns[0].x + 48, y: 88, w: frame.columns[0].w - 96, bottom: BOARD_H - 72 };
  parts.push(`<text x="${menu.x}" y="${menu.y}" font-family="Inter" font-size="52" font-weight="700" fill="${INK}">${esc(clip(doc.title || "Menu", 26))}</text>`);
  if (doc.subtitle) parts.push(`<text x="${menu.x}" y="${menu.y + 40}" font-family="Inter" font-size="20" fill="${MUTED}">${esc(clip(doc.subtitle, 52))}</text>`);
  if (doc.template === "triple-column") {
    frame.columns.forEach((column, index) => {
      const section = doc.sections[index];
      if (!section) return;
      parts.push(itemBlock(section, column.x + 40, 168, column.w - 80, BOARD_H - 72));
    });
  } else {
    let y = menu.y + 88;
    const each = Math.max(120, Math.floor((menu.bottom - y) / Math.max(doc.sections.length, 1)));
    for (const section of doc.sections) {
      parts.push(itemBlock(section, menu.x, y, menu.w, y + each - 12));
      y += each;
    }
  }
  if (doc.footer && doc.template !== "menu-banner") {
    const footerY = doc.template === "signature" ? BOARD_H - 88 : BOARD_H - 44;
    parts.push(`<text x="${menu.x}" y="${footerY}" font-family="Inter" font-size="18" fill="${MUTED}">${esc(clip(doc.footer, 64))}</text>`);
  }
  if (doc.template === "menu-banner" && doc.footer) {
    parts.push(`<text x="72" y="${feature.y + Math.round(feature.h / 2)}" font-family="Inter" font-size="32" font-weight="700" fill="${FEATURE_INK}">${esc(clip(doc.footer, 48))}</text>`);
  }
  parts.push("</svg>");
  return parts.join("");
}
