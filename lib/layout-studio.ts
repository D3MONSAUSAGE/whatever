/** Layout Studio boards. Shared by the editor and the server. No database and no HTML from clients. */

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
  feature: ZoneBox;
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
    return { template, split: ratio, menu, feature, columns: [menu] };
  }
  if (template === "signature") {
    const overlay = Math.round(BOARD_W * ratio);
    return {
      template, split: ratio,
      menu: box(0, 0, overlay, BOARD_H),
      feature: box(0, 0, BOARD_W, BOARD_H),
      columns: [box(0, 0, overlay, BOARD_H)],
    };
  }
  if (template === "triple-column") {
    const first = Math.round(BOARD_W * ratio);
    const rest = BOARD_W - first;
    const second = Math.round(rest / 2);
    const columns = [box(0, 0, first, BOARD_H), box(first, 0, second, BOARD_H), box(first + second, 0, rest - second, BOARD_H)];
    return { template, split: ratio, menu: box(0, 0, BOARD_W, BOARD_H), feature: columns[2], columns };
  }
  const left = Math.round(BOARD_W * ratio);
  const menu = box(0, 0, left, BOARD_H);
  const feature = box(left, 0, BOARD_W - left, BOARD_H);
  return { template, split: ratio, menu, feature, columns: [menu] };
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
  if (!Array.isArray(raw.sections) || raw.sections.length > 4) return { ok: false, error: "Use up to 4 sections." };
  const sections: LayoutSection[] = [];
  let total = 0;
  for (const section of raw.sections) {
    if (!section || typeof section !== "object") return { ok: false, error: "Check your sections." };
    const sec = section as Record<string, unknown>;
    const name = text(sec.name, 30);
    if (name == null) return { ok: false, error: "Check your sections." };
    if (!Array.isArray(sec.items) || sec.items.length > 8) return { ok: false, error: "Use up to 8 items in a column." };
    const items: LayoutItem[] = [];
    for (const item of sec.items) {
      if (!item || typeof item !== "object") return { ok: false, error: "Check your items." };
      const row = item as Record<string, unknown>;
      const itemName = text(row.name, 40);
      const price = text(row.price, 12);
      const description = text(row.description, 80);
      if (itemName == null || price == null || description == null) return { ok: false, error: "Check your items." };
      if (!itemName) continue;
      items.push({ name: itemName, price: price ?? "", description: description ?? "" });
    }
    total += items.length;
    if (name || items.length) sections.push({ name: name ?? "", items });
  }
  if (total > 18) return { ok: false, error: "Use up to 18 items." };
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
  return {
    layoutVersion: 1,
    fallbackUrl,
    video: { mediaId: doc.videoMediaId, url: videoUrl, box: frame.feature },
  };
}

function clip(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function itemRows(section: LayoutSection, x: number, y: number, width: number) {
  const rows: string[] = [];
  let top = y;
  if (section.name) {
    rows.push(`<text x="${x}" y="${top}" font-family="Inter" font-size="22" font-weight="700" fill="#1c1917" letter-spacing="1.5">${esc(section.name.toUpperCase())}</text>`);
    top += 18;
    rows.push(`<rect x="${x}" y="${top}" width="42" height="3" fill="#1f3a34"/>`);
    top += 36;
  }
  for (const item of section.items) {
    rows.push(`<text x="${x}" y="${top}" font-family="Inter" font-size="28" font-weight="650" fill="#1c1917">${esc(clip(item.name, 28))}</text>`);
    if (item.price) rows.push(`<text x="${x + width}" y="${top}" text-anchor="end" font-family="Inter" font-size="28" font-weight="650" fill="#1c1917">${esc(item.price)}</text>`);
    top += item.description ? 30 : 44;
    if (item.description) {
      rows.push(`<text x="${x}" y="${top}" font-family="Inter" font-size="18" fill="#57534e">${esc(clip(item.description, 42))}</text>`);
      top += 40;
    }
  }
  return rows.join("");
}

/** Complete board. The feature rectangle is always painted, including when a video will cover it. */
export function layoutSvg(doc: LayoutDocument): string {
  const frame = frameFor(doc.template, doc.split);
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${BOARD_W}" height="${BOARD_H}" viewBox="0 0 ${BOARD_W} ${BOARD_H}">`,
    `<rect width="${BOARD_W}" height="${BOARD_H}" fill="#1c1917"/>`,
  ];
  const feature = frame.feature;
  parts.push(`<rect x="${feature.x}" y="${feature.y}" width="${feature.w}" height="${feature.h}" fill="#1f3a34"/>`);
  if (doc.template !== "menu-banner") {
    const label = doc.videoMediaId ? "Playing on this screen" : "Today's feature";
    const labelX = doc.template === "signature" ? frame.menu.w + 48 : feature.x + 48;
    const labelY = feature.y + Math.round(feature.h / 2);
    parts.push(`<text x="${labelX}" y="${labelY}" font-family="Inter" font-size="36" font-weight="650" fill="#f6f1e7">${esc(label)}</text>`);
  }
  if (doc.template === "signature") {
    parts.push(`<rect x="${frame.menu.x}" y="80" width="${frame.menu.w}" height="${BOARD_H - 160}" fill="#f6f1e7"/>`);
  } else if (doc.template !== "menu-banner") {
    for (const column of frame.columns) parts.push(`<rect x="${column.x}" y="${column.y}" width="${column.w}" height="${column.h}" fill="#f6f1e7"/>`);
  } else {
    parts.push(`<rect x="0" y="0" width="${BOARD_W}" height="${frame.menu.h}" fill="#f6f1e7"/>`);
  }
  const menu = doc.template === "signature"
    ? { x: 64, y: 140, w: frame.menu.w - 128, h: BOARD_H - 280 }
    : doc.template === "menu-banner"
      ? { x: 72, y: 72, w: BOARD_W - 144, h: frame.menu.h - 120 }
      : { x: frame.columns[0].x + 48, y: 72, w: frame.columns[0].w - 96, h: BOARD_H - 140 };
  parts.push(`<text x="${menu.x}" y="${menu.y}" font-family="Inter" font-size="54" font-weight="700" fill="#1c1917">${esc(clip(doc.title || "Menu", 28))}</text>`);
  if (doc.subtitle) parts.push(`<text x="${menu.x}" y="${menu.y + 44}" font-family="Inter" font-size="22" fill="#57534e">${esc(clip(doc.subtitle, 48))}</text>`);
  if (doc.template === "triple-column") {
    frame.columns.forEach((column, index) => {
      const section = doc.sections[index];
      if (!section) return;
      parts.push(itemRows(section, column.x + 48, 180, column.w - 96));
    });
  } else {
    let y = menu.y + 100;
    for (const section of doc.sections) {
      parts.push(itemRows(section, menu.x, y, menu.w));
      y += 70 + section.items.length * 74;
    }
  }
  if (doc.footer) {
    const onBanner = doc.template === "menu-banner";
    const footerY = onBanner ? feature.y + Math.round(feature.h / 2) + 8 : doc.template === "signature" ? BOARD_H - 128 : BOARD_H - 56;
    const footerX = onBanner ? 72 : menu.x;
    const fill = onBanner ? "#f6f1e7" : "#57534e";
    parts.push(`<text x="${footerX}" y="${footerY}" font-family="Inter" font-size="20" fill="${fill}">${esc(clip(doc.footer, 60))}</text>`);
  }
  parts.push("</svg>");
  return parts.join("");
}
