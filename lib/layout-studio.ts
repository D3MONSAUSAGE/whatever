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

export type BoardPalette = "classic" | "fresh" | "bold";
export type TypeScale = "room" | "counter";

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
  /** Existing menu colorways. Absent documents stay Fresh. */
  palette: BoardPalette;
  primaryColor: string | null;
  accentColor: string | null;
  /** Room is the television size. Counter is slightly denser and still readable. */
  typeScale: TypeScale;
  /** Copy for the feature pane. Kept even when a video covers that pane. */
  featureTitle: string;
  featureDetail: string;
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
  if (/[<>]/.test(value)) return null;
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
  const featureTitle = text(raw.featureTitle, 40);
  const featureDetail = text(raw.featureDetail, 80);
  if (featureTitle == null || featureDetail == null) return { ok: false, error: "Check the feature text." };
  const palette = raw.palette === "classic" || raw.palette === "bold" || raw.palette === "fresh" ? raw.palette : "fresh";
  const typeScale = raw.typeScale === "counter" ? "counter" : "room";
  const primaryColor = hexColor(raw.primaryColor);
  const accentColor = hexColor(raw.accentColor);
  if (raw.primaryColor && !primaryColor) return { ok: false, error: "Use a color like #0066ff." };
  if (raw.accentColor && !accentColor) return { ok: false, error: "Use a color like #ffd34d." };
  return {
    ok: true,
    value: {
      layoutVersion: 1, template: raw.template, split, title: title ?? "", subtitle: subtitle ?? "", footer: footer ?? "",
      sections, imageMediaId, videoMediaId, palette, primaryColor, accentColor, typeScale,
      featureTitle: featureTitle ?? "", featureDetail: featureDetail ?? "",
    },
  };
}

function hexColor(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) return null;
  return value.toLowerCase();
}

function board(template: LayoutTemplate, fields: Omit<LayoutDocument, "layoutVersion" | "template" | "imageMediaId" | "videoMediaId">): LayoutDocument {
  return { layoutVersion: 1, template, imageMediaId: null, videoMediaId: null, ...fields };
}

export function sampleLayout(template: LayoutTemplate = "menu-promo-67"): LayoutDocument {
  const samples: Record<LayoutTemplate, LayoutDocument> = {
    "menu-promo-67": board(template, {
      split: 0.67, palette: "fresh", primaryColor: null, accentColor: null, typeScale: "room",
      title: "Casa Mesa", subtitle: "Lunch, served until 3", footer: "Ask about the daily special",
      featureTitle: "Today", featureDetail: "Lunch special",
      sections: [
        { name: "Plates", items: [
          { name: "Pollo asado", price: "$14", description: "Citrus chicken, rice, salsa" },
          { name: "Carne asada", price: "$16", description: "Grilled steak and beans" },
          { name: "Market fish", price: "$18", description: "Today's catch, lime butter" },
          { name: "Veggie bowl", price: "$13", description: "Squash, beans, crema" },
        ] },
        { name: "Sides", items: [
          { name: "Street corn", price: "$5", description: "Chile, crema, cheese" },
          { name: "Greens", price: "$6", description: "Herb vinaigrette" },
          { name: "Rice and beans", price: "$4", description: "Garlic and cumin" },
          { name: "Plantains", price: "$5", description: "Lime and salt" },
        ] },
      ],
    }),
    "triple-column": board(template, {
      split: 1 / 3, palette: "fresh", primaryColor: null, accentColor: null, typeScale: "room",
      title: "Northbeam Coffee", subtitle: "Open from 7", footer: "Oat and almond milk at no charge",
      featureTitle: "", featureDetail: "",
      sections: [
        { name: "Coffee", items: [
          { name: "Drip", price: "$3", description: "Rotating single origin" },
          { name: "Cortado", price: "$4", description: "Equal espresso and milk" },
          { name: "Cappuccino", price: "$4.50", description: "Dry or wet" },
          { name: "Cold brew", price: "$4.50", description: "Twelve hour steep" },
          { name: "Mocha", price: "$5", description: "Dark chocolate" },
        ] },
        { name: "Tea", items: [
          { name: "Jasmine", price: "$3.50", description: "Loose leaf" },
          { name: "Chai", price: "$4.50", description: "Steamed milk" },
          { name: "Earl grey", price: "$3.50", description: "Bergamot" },
          { name: "Mint", price: "$3", description: "Fresh leaves" },
          { name: "London fog", price: "$5", description: "Vanilla and bergamot" },
        ] },
        { name: "Bakery", items: [
          { name: "Morning bun", price: "$4", description: "Orange zest" },
          { name: "Quiche", price: "$7", description: "Seasonal vegetables" },
          { name: "Banana bread", price: "$4", description: "Toasted walnut" },
          { name: "Oat cookie", price: "$3", description: "Brown butter" },
          { name: "Fruit cup", price: "$5", description: "Citrus and mint" },
        ] },
      ],
    }),
    "split-50": board(template, {
      split: 0.5, palette: "bold", primaryColor: null, accentColor: null, typeScale: "room",
      title: "Harbor Gym", subtitle: "Today's floor", footer: "Towels at the desk",
      featureTitle: "Noon ride", featureDetail: "Studio B · bikes leave at 12:15",
      sections: [
        { name: "Morning", items: [
          { name: "Strength", price: "6:30", description: "Studio A" },
          { name: "Conditioning", price: "9:00", description: "Studio B" },
          { name: "Mobility", price: "10:30", description: "All levels" },
        ] },
        { name: "Evening", items: [
          { name: "Lift", price: "5:30", description: "Studio A" },
          { name: "Row", price: "6:15", description: "Studio B" },
          { name: "Restore", price: "7:30", description: "Low impact" },
        ] },
      ],
    }),
    "menu-banner": board(template, {
      split: 0.18, palette: "classic", primaryColor: null, accentColor: null, typeScale: "room",
      title: "Field & Vine", subtitle: "Groceries and lunch", footer: "Members save 10% after 4",
      featureTitle: "", featureDetail: "",
      sections: [
        { name: "Counter", items: [
          { name: "Soup and salad", price: "$11", description: "Rotates daily" },
          { name: "Grain bowl", price: "$13", description: "Greens, grains, tahini" },
          { name: "Half sandwich", price: "$9", description: "Chicken or veggie" },
          { name: "Chili", price: "$8", description: "Cup or bowl" },
        ] },
        { name: "Market", items: [
          { name: "Citrus bag", price: "$6", description: "Picked this morning" },
          { name: "Sourdough", price: "$7", description: "Baked at dawn" },
          { name: "Olive oil", price: "$14", description: "House blend" },
          { name: "Flowers", price: "$12", description: "Mixed bunch" },
        ] },
      ],
    }),
    signature: board(template, {
      split: 0.55, palette: "classic", primaryColor: null, accentColor: null, typeScale: "room",
      title: "Evening service", subtitle: "From 5 PM", footer: "Reserve the patio",
      featureTitle: "Patio", featureDetail: "Tables held until 5:30",
      sections: [
        { name: "First", items: [
          { name: "Beet salad", price: "$12", description: "Citrus, pistachio" },
          { name: "Broth", price: "$10", description: "Ginger and greens" },
          { name: "Crudo", price: "$16", description: "Citrus and olive oil" },
        ] },
        { name: "Mains", items: [
          { name: "Roast chicken", price: "$24", description: "Pan juices, potatoes" },
          { name: "Pasta", price: "$21", description: "Brown butter and sage" },
          { name: "Market fish", price: "$28", description: "Charred lemon" },
        ] },
      ],
    }),
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

function measure(value: string, size: number) {
  let units = 0;
  for (const ch of value) {
    if (/[ilI.,:;'!|]/.test(ch)) units += 0.28;
    else if (/[mwMW@]/.test(ch)) units += 0.86;
    else if (/[A-Z0-9$&]/.test(ch)) units += 0.66;
    else if (ch === " ") units += 0.27;
    else units += 0.56;
  }
  return units * size * 1.05;
}

function fitWidth(value: string, size: number, max: number) {
  if (measure(value, size) <= max) return value;
  const chars = [...value];
  while (chars.length > 1 && measure(`${chars.join("")}…`, size) > max) chars.pop();
  return `${chars.join("").trimEnd()}…`;
}

type BoardColors = {
  paper: string; ink: string; muted: string; section: string; price: string; priceBg: string | null;
  feature: string; featureInk: string; band: string | null;
};

const PALETTES: Record<BoardPalette, BoardColors> = {
  classic: { paper: "#0b1220", ink: "#ffffff", muted: "#9fb0c8", section: "#4d94ff", price: "#ffffff", priceBg: null, feature: "#13203a", featureInk: "#ffffff", band: null },
  fresh: { paper: "#f6f9fe", ink: "#0b1220", muted: "#5b6b82", section: "#0066ff", price: "#0b1220", priceBg: null, feature: "#0066ff", featureInk: "#ffffff", band: "#0066ff" },
  bold: { paper: "#0066ff", ink: "#ffffff", muted: "#cfe0ff", section: "#ffd34d", price: "#0b1220", priceBg: "#ffd34d", feature: "#0047b3", featureInk: "#ffffff", band: null },
};

function colorsFor(doc: LayoutDocument): BoardColors {
  const base = PALETTES[doc.palette] ?? PALETTES.fresh;
  if (!doc.primaryColor) return base;
  return { ...base, section: doc.accentColor || doc.primaryColor, feature: doc.primaryColor, band: base.band ? doc.primaryColor : null };
}

function face(family: string | undefined) {
  return family === "BoardFace" ? "BoardFace" : "Inter";
}

function paintItems(parts: string[], sections: LayoutSection[], x: number, top: number, width: number, bottom: number, colors: BoardColors, scale: TypeScale, family: string) {
  let units = 0;
  for (const section of sections) {
    units += section.name ? 1.35 : 0;
    for (const item of section.items) units += item.description ? 1.85 : 1.2;
    units += 0.3;
  }
  const room = Math.max(80, bottom - top);
  let unit = room / Math.max(units, 1);
  if (scale === "counter") unit *= 0.88;
  unit = Math.min(72, unit);
  const nameSize = Math.round(Math.min(40, Math.max(22, unit * 0.5)));
  const descSize = Math.max(16, Math.round(nameSize * 0.5));
  let y = top;
  for (const section of sections) {
    if (section.name) {
      y += unit * 0.72;
      parts.push(`<text x="${x}" y="${y.toFixed(1)}" font-family="${family}" font-size="${Math.max(18, nameSize - 6)}" font-weight="800" fill="${colors.section}">${esc(fitWidth(section.name.toUpperCase(), nameSize - 6, width))}</text>`);
      y += unit * 0.28;
    }
    for (const item of section.items) {
      y += unit * 0.78;
      const price = item.price || "";
      const priceW = price ? measure(price, nameSize) + (colors.priceBg ? 28 : 0) : 0;
      const name = fitWidth(item.name, nameSize, Math.max(40, width - priceW - 24));
      if (price && colors.priceBg) {
        parts.push(`<rect x="${(x + width - priceW).toFixed(1)}" y="${(y - nameSize).toFixed(1)}" width="${priceW.toFixed(1)}" height="${(nameSize * 1.35).toFixed(1)}" rx="8" fill="${colors.priceBg}"/>`);
      }
      if (price) parts.push(`<text x="${(x + width - (colors.priceBg ? 12 : 0)).toFixed(1)}" y="${y.toFixed(1)}" text-anchor="end" font-family="${family}" font-size="${nameSize}" font-weight="700" fill="${colors.price}">${esc(price)}</text>`);
      parts.push(`<text x="${x}" y="${y.toFixed(1)}" font-family="${family}" font-size="${nameSize}" font-weight="700" fill="${colors.ink}">${esc(name)}</text>`);
      if (item.description) {
        y += unit * 0.48;
        parts.push(`<text x="${x}" y="${y.toFixed(1)}" font-family="${family}" font-size="${descSize}" fill="${colors.muted}">${esc(fitWidth(item.description, descSize, width))}</text>`);
      }
    }
    y += unit * 0.2;
  }
}

export type LayoutArt = { imageHref?: string | null; fontFamily?: "Inter" | "BoardFace" };

/** Complete board. Menu text stays out of the video box. The still does not say a video is playing. */
export function layoutSvg(doc: LayoutDocument, art?: LayoutArt): string {
  const frame = frameFor(doc.template, doc.split);
  const colors = colorsFor(doc);
  const family = face(art?.fontFamily);
  const href = safeImageHref(art?.imageHref);
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${BOARD_W}" height="${BOARD_H}" viewBox="0 0 ${BOARD_W} ${BOARD_H}">`,
    `<rect width="${BOARD_W}" height="${BOARD_H}" fill="${colors.feature}"/>`,
  ];
  const feature = frame.video ?? frame.feature;
  if (doc.template === "triple-column") {
    frame.columns.forEach((column, index) => {
      if (href && index === frame.columns.length - 1) return;
      parts.push(`<rect x="${column.x}" y="${column.y}" width="${column.w}" height="${column.h}" fill="${colors.paper}"/>`);
    });
    const photo = frame.columns[frame.columns.length - 1];
    if (href) {
      const photoTop = photo.y + Math.round(photo.h * 0.5);
      parts.push(`<image href="${esc(href)}" x="${photo.x}" y="${photoTop}" width="${photo.w}" height="${photo.h - (photoTop - photo.y)}" preserveAspectRatio="xMidYMid slice"/>`);
    } else {
      parts.push(`<rect x="${photo.x}" y="${photo.y}" width="${photo.w}" height="${photo.h}" fill="${colors.paper}"/>`);
    }
  } else if (href && doc.template !== "menu-banner") {
    const box = doc.template === "signature" ? frame.feature : feature;
    parts.push(`<image href="${esc(href)}" x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" preserveAspectRatio="xMidYMid slice"/>`);
  }
  if (doc.template === "signature") {
    parts.push(`<rect x="48" y="48" width="${frame.menu.w - 96}" height="${BOARD_H - 96}" fill="${colors.paper}"/>`);
  } else if (doc.template === "menu-banner") {
    parts.push(`<rect x="0" y="0" width="${BOARD_W}" height="${frame.menu.h}" fill="${colors.paper}"/>`);
  } else if (doc.template !== "triple-column") {
    parts.push(`<rect x="${frame.menu.x}" y="${frame.menu.y}" width="${frame.menu.w}" height="${frame.menu.h}" fill="${colors.paper}"/>`);
  }
  if (colors.band && doc.template !== "signature") {
    const bandW = doc.template === "menu-banner" || doc.template === "triple-column" ? BOARD_W : frame.menu.w;
    parts.push(`<rect x="0" y="0" width="${bandW}" height="132" fill="${colors.band}"/>`);
  }
  const menu = doc.template === "signature"
    ? { x: 88, y: 110, w: frame.menu.w - 176, bottom: BOARD_H - 110 }
    : doc.template === "menu-banner"
      ? { x: 72, y: colors.band ? 156 : 72, w: BOARD_W - 144, bottom: frame.menu.h - 72 }
      : doc.template === "triple-column"
        ? { x: 48, y: colors.band ? 156 : 72, w: frame.columns[0].w - 80, bottom: BOARD_H - 64 }
        : { x: frame.menu.x + 48, y: colors.band ? 168 : 88, w: frame.menu.w - 96, bottom: BOARD_H - 72 };
  let titleSize = 64;
  while (titleSize > 34 && measure(doc.title || "Menu", titleSize) > menu.w) titleSize -= 2;
  const title = fitWidth(doc.title || "Menu", titleSize, menu.w);
  const titleFill = colors.band && doc.template !== "signature" ? colors.featureInk : colors.ink;
  parts.push(`<text x="${menu.x}" y="${colors.band && doc.template !== "signature" ? 86 : menu.y}" font-family="${family}" font-size="${titleSize}" font-weight="800" fill="${titleFill}">${esc(title)}</text>`);
  if (doc.subtitle) {
    const onBand = Boolean(colors.band && doc.template !== "signature");
    parts.push(`<text x="${menu.x}" y="${onBand ? 118 : menu.y + 40}" font-family="${family}" font-size="22" fill="${onBand ? colors.featureInk : colors.muted}">${esc(fitWidth(doc.subtitle, 22, menu.w))}</text>`);
  }
  const textTop = colors.band && doc.template !== "signature" ? 180 : menu.y + (doc.subtitle ? 72 : 36);
  if (doc.template === "triple-column") {
    frame.columns.forEach((column, index) => {
      const section = doc.sections[index];
      if (!section) return;
      const photo = href && index === frame.columns.length - 1;
      const bottom = photo ? column.y + Math.round(column.h * 0.48) : BOARD_H - 64;
      paintItems(parts, [section], column.x + 36, 176, column.w - 72, bottom, colors, doc.typeScale, family);
    });
  } else {
    paintItems(parts, doc.sections, menu.x, textTop, menu.w, menu.bottom, colors, doc.typeScale, family);
  }
  if (doc.footer && doc.template === "menu-banner") {
    parts.push(`<text x="72" y="${frame.menu.h - 28}" font-family="${family}" font-size="28" font-weight="700" fill="${colors.ink}">${esc(fitWidth(doc.footer, 28, BOARD_W - 144))}</text>`);
  } else if (doc.footer) {
    const footerY = doc.template === "signature" ? BOARD_H - 78 : BOARD_H - 40;
    parts.push(`<text x="${menu.x}" y="${footerY}" font-family="${family}" font-size="22" fill="${colors.muted}">${esc(fitWidth(doc.footer, 22, menu.w))}</text>`);
  }
  if (feature.h >= 280 && doc.template !== "triple-column") {
    const bandY = feature.y + feature.h - 170;
    const head = doc.featureTitle || "Featured";
    const hx = feature.x + 40;
    parts.push(`<rect x="${feature.x}" y="${bandY}" width="${feature.w}" height="170" fill="${colors.feature}"/>`);
    parts.push(`<text x="${hx}" y="${bandY + 62}" font-family="${family}" font-size="40" font-weight="800" fill="${colors.featureInk}">${esc(fitWidth(head, 40, feature.w - 80))}</text>`);
    if (doc.featureDetail) {
      parts.push(`<text x="${hx}" y="${bandY + 132}" font-family="${family}" font-size="22" fill="${colors.featureInk}">${esc(fitWidth(doc.featureDetail, 22, feature.w - 80))}</text>`);
    }
  }
  parts.push("</svg>");
  return parts.join("");
}
