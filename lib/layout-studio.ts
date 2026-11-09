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
export type BoardFont = "inter" | "noto-serif";

export type LayoutDocument = {
  layoutVersion: 1;
  template: LayoutTemplate;
  split: number;
  title: string;
  subtitle: string;
  footer: string;
  sections: LayoutSection[];
  /** Same-account JPEG, PNG, or WebP. Empty when the side is only the video poster. */
  imageMediaId: string | null;
  /** At most one. Same-account MP4. The PNG still draws a poster in this box. */
  videoMediaId: string | null;
  /** Existing menu colorways. Absent documents stay Fresh. */
  palette: BoardPalette;
  primaryColor: string | null;
  accentColor: string | null;
  /** Room is the television size. Counter is slightly denser and still readable. */
  typeScale: TypeScale;
  /** Bundled face used for both the preview and the published PNG. */
  font: BoardFont;
  /** Menu item text. Null keeps the palette ink. A title on a color band stays light. */
  textColor: string | null;
  /** Menu paper. Null keeps the palette. The feature pane uses primaryColor. */
  backgroundColor: string | null;
  /** Copy for the feature pane. Kept even when a video covers that pane. */
  featureTitle: string;
  featureDetail: string;
  /** Triple column shares. Null keeps the single first-column split. */
  columnWidths: [number, number, number] | null;
  /** How an assigned photo fills its box. Cover matches the previous boards. */
  imageFit: "cover" | "contain";
  imageAnchor: "center" | "top" | "bottom" | "left" | "right";
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

export type ZoneCapability = { id: string; label: string; text: boolean; image: boolean; video: boolean };

/** What each tappable zone can hold. Video is only where it cannot cover the menu. */
export function zoneCapabilities(template: LayoutTemplate): ZoneCapability[] {
  const text = { text: true, image: false, video: false };
  const media = { text: true, image: true, video: true };
  const photo = { text: false, image: true, video: false };
  if (template === "triple-column") {
    return [
      { id: "column-0", label: "Column 1", ...text },
      { id: "column-1", label: "Column 2", ...text },
      { id: "column-2", label: "Column 3", ...text },
      { id: "photo", label: "Board photo", ...photo },
    ];
  }
  if (template === "signature") {
    return [
      { id: "menu", label: "Menu", ...text },
      { id: "feature", label: "Video", text: true, image: false, video: true },
      { id: "background", label: "Background", ...photo },
    ];
  }
  if (template === "menu-banner") return [{ id: "menu", label: "Menu", ...text }, { id: "feature", label: "Banner", ...media }];
  if (template === "split-50") return [{ id: "menu", label: "Menu", ...text }, { id: "feature", label: "Right side", ...media }];
  return [{ id: "menu", label: "Menu", ...text }, { id: "feature", label: "Promotion", ...media }];
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
export function frameFor(template: LayoutTemplate, split: number, columnWidths?: [number, number, number] | null): LayoutFrame {
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
    const widths = normalizedColumns(columnWidths);
    const first = widths ? Math.round(BOARD_W * widths[0]) : Math.round(BOARD_W * ratio);
    const second = widths ? Math.round(BOARD_W * widths[1]) : Math.round((BOARD_W - first) / 2);
    const third = BOARD_W - first - second;
    const columns = [box(0, 0, first, BOARD_H), box(first, 0, second, BOARD_H), box(first + second, 0, third, BOARD_H)];
    return { template, split: ratio, menu: box(0, 0, BOARD_W, BOARD_H), feature: columns[2], video: null, columns };
  }
  const left = Math.round(BOARD_W * ratio);
  const menu = box(0, 0, left, BOARD_H);
  const feature = box(left, 0, BOARD_W - left, BOARD_H);
  return { template, split: ratio, menu, feature, video: feature, columns: [menu] };
}

/** Bottom promo band on Menu and promotion and Split showcase. Empty copy gets no band. */
export const PROMO_BAND = 170;

export function promoBandHeight(doc: { template: LayoutTemplate; featureTitle?: string; featureDetail?: string }): number {
  if (doc.template !== "menu-promo-67" && doc.template !== "split-50") return 0;
  if (!(doc.featureTitle || "").trim() && !(doc.featureDetail || "").trim()) return 0;
  return PROMO_BAND;
}

/** The rectangle the video and its fallback photo share. The promo band stays below it. */
export function mediaVideoBox(doc: LayoutDocument): ZoneBox | null {
  const frame = frameFor(doc.template, doc.split, doc.columnWidths);
  if (!frame.video) return null;
  const band = promoBandHeight(doc);
  if (band <= 0 || band >= frame.video.h - 80) return frame.video;
  return { x: frame.video.x, y: frame.video.y, w: frame.video.w, h: frame.video.h - band };
}

export function boxesOverlap(a: ZoneBox, b: ZoneBox) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** The player's numeric guard. A 1919×1080 box at 0,0 passes. Menu overlap is not checked here. */
export function clientAcceptsZoneBox(box: ZoneBox) {
  if (box.w < 1 || box.h < 1 || box.x < 0 || box.y < 0) return false;
  if (box.x + box.w > BOARD_W || box.y + box.h > BOARD_H) return false;
  if (box.w >= BOARD_W && box.h >= BOARD_H) return false;
  return true;
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
  const font = raw.font === "noto-serif" || raw.font === "inter" ? raw.font : raw.font == null || raw.font === "" ? "inter" : null;
  if (font == null) return { ok: false, error: "Choose Inter or Noto Serif." };
  const primaryColor = hexColor(raw.primaryColor);
  const accentColor = hexColor(raw.accentColor);
  const textColor = hexColor(raw.textColor);
  const backgroundColor = hexColor(raw.backgroundColor);
  const columnWidths = readColumnWidths(raw.columnWidths);
  if (raw.columnWidths != null && raw.columnWidths !== "" && !columnWidths) return { ok: false, error: "Set three column widths that add up to the full board." };
  const imageFit = raw.imageFit === "contain" ? "contain" : "cover";
  const imageAnchor = raw.imageAnchor === "top" || raw.imageAnchor === "bottom" || raw.imageAnchor === "left" || raw.imageAnchor === "right" ? raw.imageAnchor : "center";
  if (raw.primaryColor && !primaryColor) return { ok: false, error: "Use a color like #0066ff." };
  if (raw.accentColor && !accentColor) return { ok: false, error: "Use a color like #ffd34d." };
  if (raw.textColor && !textColor) return { ok: false, error: "Use a color like #112233." };
  if (raw.backgroundColor && !backgroundColor) return { ok: false, error: "Use a color like #f6f9fe." };
  return {
    ok: true,
    value: {
      layoutVersion: 1, template: raw.template, split, title: title ?? "", subtitle: subtitle ?? "", footer: footer ?? "",
      sections, imageMediaId, videoMediaId, palette, primaryColor, accentColor, typeScale, font,
      textColor, backgroundColor,
      featureTitle: featureTitle ?? "", featureDetail: featureDetail ?? "",
      columnWidths, imageFit, imageAnchor,
    },
  };
}

function readColumnWidths(value: unknown): [number, number, number] | null {
  if (value == null || value === "") return null;
  if (!Array.isArray(value) || value.length !== 3) return null;
  const nums = value.map((item) => typeof item === "number" ? item : Number.NaN);
  if (nums.some((item) => !Number.isFinite(item) || item < 0.2 || item > 0.6)) return null;
  const sum = nums[0] + nums[1] + nums[2];
  if (sum < 0.98 || sum > 1.02) return null;
  return [nums[0] / sum, nums[1] / sum, nums[2] / sum];
}

function hexColor(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) return null;
  return value.toLowerCase();
}

function normalizedColumns(value: [number, number, number] | null | undefined): [number, number, number] | null {
  if (!value) return null;
  const sum = value[0] + value[1] + value[2];
  if (!(sum > 0)) return null;
  return [value[0] / sum, value[1] / sum, value[2] / sum];
}

function board(template: LayoutTemplate, fields: Omit<LayoutDocument, "layoutVersion" | "template" | "imageMediaId" | "videoMediaId" | "font" | "textColor" | "backgroundColor" | "columnWidths" | "imageFit" | "imageAnchor">): LayoutDocument {
  return {
    layoutVersion: 1, template, imageMediaId: null, videoMediaId: null, font: "inter",
    textColor: null, backgroundColor: null, columnWidths: null, imageFit: "cover", imageAnchor: "center", ...fields,
  };
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
      featureTitle: "Today's counter", featureDetail: "Groceries until 7",
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
  // The box always comes from the template and its proportions. A box on the document is ignored.
  const box = mediaVideoBox(doc);
  if (!box) return null;
  return {
    layoutVersion: 1,
    fallbackUrl,
    video: { mediaId: doc.videoMediaId, url: videoUrl, box },
  };
}

/** A photo href the renderer may paint. Anything else is ignored, not executed. */
export function safeImageHref(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=\s]+$/i.test(value)) return value.replace(/\s/g, "");
  if (/^https:\/\/[^\s"'<>]+$/i.test(value)) return value;
  return null;
}

/** Server-owned photo fit. Cover is the previous slice behavior. */
export function imageAspect(doc: { imageFit?: "cover" | "contain"; imageAnchor?: string }) {
  const fit = doc.imageFit === "contain" ? "meet" : "slice";
  const anchor = doc.imageAnchor;
  const x = anchor === "left" ? "xMin" : anchor === "right" ? "xMax" : "xMid";
  const y = anchor === "top" ? "YMin" : anchor === "bottom" ? "YMax" : "YMid";
  return `${x}${y} ${fit}`;
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

function mixHex(hex: string, toward: string, amount: number) {
  const pick = (value: string) => [1, 3, 5].map((index) => Number.parseInt(value.slice(index, index + 2), 16));
  const from = pick(hex);
  const to = pick(toward);
  return `#${from.map((channel, index) => Math.round(channel + (to[index] - channel) * amount).toString(16).padStart(2, "0")).join("")}`;
}

function colorsFor(doc: LayoutDocument): BoardColors {
  const base = PALETTES[doc.palette] ?? PALETTES.fresh;
  const next = { ...base };
  if (doc.primaryColor) {
    next.section = doc.accentColor || doc.primaryColor;
    next.feature = doc.primaryColor;
    next.band = base.band ? doc.primaryColor : null;
  } else if (doc.accentColor) {
    next.section = doc.accentColor;
  }
  if (doc.backgroundColor) next.paper = doc.backgroundColor;
  if (doc.textColor) {
    next.ink = doc.textColor;
    if (!next.priceBg) next.price = doc.textColor;
  }
  return next;
}

/** One 1920×1080 board, contained and centered in the screen. The still and the zone use this same frame. */
export function containedBoard(screenW: number, screenH: number) {
  const sw = screenW > 0 ? screenW : 1280;
  const sh = screenH > 0 ? screenH : 720;
  const scale = Math.min(sw / BOARD_W, sh / BOARD_H);
  const width = BOARD_W * scale;
  const height = BOARD_H * scale;
  return { scale, left: (sw - width) / 2, top: (sh - height) / 2, width, height };
}

/** Zone box in screen pixels. It stays inside containedBoard and does not use the clip's own aspect. */
export function zoneOnBoard(screenW: number, screenH: number, box: ZoneBox) {
  const frame = containedBoard(screenW, screenH);
  return {
    left: frame.left + box.x * frame.scale,
    top: frame.top + box.y * frame.scale,
    width: box.w * frame.scale,
    height: box.h * frame.scale,
  };
}

/** CSS for the one video element. Contain letterboxes inside the server box. It does not cover the menu. */
export function zoneVideoStyle(box: ZoneBox) {
  return {
    position: "absolute" as const,
    left: `${(box.x / BOARD_W) * 100}%`,
    top: `${(box.y / BOARD_H) * 100}%`,
    width: `${(box.w / BOARD_W) * 100}%`,
    height: `${(box.h / BOARD_H) * 100}%`,
    objectFit: "cover" as const,
    background: "transparent",
  };
}

export function fontFamily(font: BoardFont | undefined) {
  return font === "noto-serif" ? "Noto Serif" : "Inter";
}

function itemUnit(sections: LayoutSection[], top: number, bottom: number, scale: TypeScale, spread = false) {
  let units = 0;
  let travel = 0;
  for (const section of sections) {
    units += section.name ? 1.35 : 0;
    travel += section.name ? 1 : 0;
    for (const item of section.items) {
      units += item.description ? 1.85 : 1.2;
      travel += item.description ? 1.26 : 0.78;
    }
    units += 0.3;
    travel += 0.2;
  }
  const room = Math.max(80, bottom - top);
  let unit = room / Math.max(units, 1);
  if (scale === "counter") unit *= 0.88;
  unit = Math.min(72, unit);
  if (spread && travel > 0) {
    const used = travel * unit;
    if (used < room * 0.72) unit = Math.min(72, unit * Math.min(1.8, (room * 0.88) / used));
  }
  return unit;
}

function paintItems(parts: string[], sections: LayoutSection[], x: number, top: number, width: number, bottom: number, colors: BoardColors, scale: TypeScale, family: string, spread = false, unitOverride?: number) {
  const unit = unitOverride ?? itemUnit(sections, top, bottom, scale, spread);
  const nameSize = Math.round(Math.min(40, Math.max(12, unit * 0.5)));
  const descSize = Math.max(10, Math.round(nameSize * 0.55));
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

export type LayoutArt = { imageHref?: string | null };

/** Complete board. Menu text stays out of the video box. The still does not say a video is playing. */
export function layoutSvg(doc: LayoutDocument, art?: LayoutArt): string {
  const frame = frameFor(doc.template, doc.split, doc.columnWidths);
  const colors = colorsFor(doc);
  const family = fontFamily(doc.font);
  const href = safeImageHref(art?.imageHref);
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${BOARD_W}" height="${BOARD_H}" viewBox="0 0 ${BOARD_W} ${BOARD_H}">`,
    `<rect width="${BOARD_W}" height="${BOARD_H}" fill="${colors.feature}"/>`,
  ];
  const feature = frame.video ?? frame.feature;
  const media = mediaVideoBox(doc) ?? feature;
  if (doc.template === "triple-column") {
    if (href) {
      parts.push(`<image href="${esc(href)}" x="0" y="0" width="${BOARD_W}" height="${BOARD_H}" preserveAspectRatio="${imageAspect(doc)}"/>`);
      parts.push(`<rect x="0" y="0" width="${BOARD_W}" height="${BOARD_H}" fill="${colors.paper}" fill-opacity="0.9"/>`);
    } else {
      frame.columns.forEach((column) => {
        parts.push(`<rect x="${column.x}" y="${column.y}" width="${column.w}" height="${column.h}" fill="${colors.paper}"/>`);
      });
    }
  } else if (href && doc.template !== "menu-banner") {
    const box = doc.template === "signature" ? frame.feature : media;
    parts.push(`<image href="${esc(href)}" x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" preserveAspectRatio="${imageAspect(doc)}"/>`);
  }
  if (doc.template === "signature") {
    // Opaque card over the full-bleed background. Text stays on this card, not on the photo.
    parts.push(`<rect x="48" y="48" width="${frame.menu.w - 96}" height="${BOARD_H - 96}" fill="${colors.paper}"/>`);
  } else if (doc.template === "menu-banner") {
    parts.push(`<rect x="0" y="0" width="${BOARD_W}" height="${frame.menu.h}" fill="${colors.paper}"/>`);
    if (href) parts.push(`<image href="${esc(href)}" x="${feature.x}" y="${feature.y}" width="${feature.w}" height="${feature.h}" preserveAspectRatio="${imageAspect(doc)}"/>`);
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
    const textTop = 176;
    const textBottom = BOARD_H - 64;
    const shared = Math.min(...frame.columns.map((_, index) => itemUnit(doc.sections[index] ? [doc.sections[index]] : [], textTop, textBottom, doc.typeScale)));
    frame.columns.forEach((column, index) => {
      const section = doc.sections[index];
      if (!section) return;
      paintItems(parts, [section], column.x + 36, textTop, column.w - 72, textBottom, colors, doc.typeScale, family, false, shared);
    });
  } else {
    paintItems(parts, doc.sections, menu.x, textTop, menu.w, menu.bottom, colors, doc.typeScale, family, doc.template === "menu-banner");
  }
  if (doc.footer && doc.template === "menu-banner") {
    parts.push(`<text x="72" y="${frame.menu.h - 28}" font-family="${family}" font-size="28" font-weight="700" fill="${colors.ink}">${esc(fitWidth(doc.footer, 28, BOARD_W - 144))}</text>`);
  } else if (doc.footer) {
    const footerY = doc.template === "signature" ? BOARD_H - 78 : BOARD_H - 40;
    parts.push(`<text x="${menu.x}" y="${footerY}" font-family="${family}" font-size="22" fill="${colors.muted}">${esc(fitWidth(doc.footer, 22, menu.w))}</text>`);
  }
  if (doc.template === "menu-banner") {
    const head = doc.featureTitle || "Today";
    const detail = doc.featureDetail || "";
    const hx = 72;
    const headSize = Math.max(28, Math.min(44, Math.round(feature.h * 0.28)));
    const headY = feature.y + Math.round(feature.h * (detail ? 0.46 : 0.62));
    if (!href) {
      parts.push(`<rect x="${feature.x}" y="${feature.y}" width="10" height="${feature.h}" fill="${colors.featureInk}"/>`);
      parts.push(`<text x="${hx}" y="${headY}" font-family="${family}" font-size="${headSize}" font-weight="800" fill="${colors.featureInk}">${esc(fitWidth(head, headSize, feature.w - 120))}</text>`);
      if (detail) parts.push(`<text x="${hx}" y="${Math.min(feature.y + feature.h - 24, headY + headSize)}" font-family="${family}" font-size="${Math.max(16, headSize - 12)}" fill="${colors.featureInk}">${esc(fitWidth(detail, headSize - 12, feature.w - 120))}</text>`);
    } else {
      const bandH = Math.min(84, Math.max(48, Math.round(feature.h * 0.42)));
      const bandY = feature.y + feature.h - bandH;
      parts.push(`<rect x="${feature.x}" y="${bandY}" width="${feature.w}" height="${bandH}" fill="${colors.feature}"/>`);
      parts.push(`<text x="${hx}" y="${bandY + Math.round(bandH * 0.42)}" font-family="${family}" font-size="${Math.min(32, headSize)}" font-weight="800" fill="${colors.featureInk}">${esc(fitWidth(head, headSize, feature.w - 120))}</text>`);
      if (detail) parts.push(`<text x="${hx}" y="${bandY + bandH - 16}" font-family="${family}" font-size="16" fill="${colors.featureInk}">${esc(fitWidth(detail, 16, feature.w - 120))}</text>`);
    }
  } else if ((doc.template === "menu-promo-67" || doc.template === "split-50") && promoBandHeight(doc) > 0) {
    const band = promoBandHeight(doc);
    const bandY = feature.y + feature.h - band;
    const hx = feature.x + 48;
    const title = (doc.featureTitle || "").trim();
    const detail = (doc.featureDetail || "").trim();
    parts.push(`<rect x="${feature.x}" y="${bandY}" width="${feature.w}" height="${band}" fill="${colors.feature}"/>`);
    if (title) parts.push(`<text x="${hx}" y="${bandY + 62}" font-family="${family}" font-size="40" font-weight="800" fill="${colors.featureInk}">${esc(fitWidth(title, 40, feature.w - 80))}</text>`);
    if (detail) parts.push(`<text x="${hx}" y="${bandY + 122}" font-family="${family}" font-size="22" fill="${colors.featureInk}">${esc(fitWidth(detail, 22, feature.w - 80))}</text>`);
  } else if (feature.h >= 280 && doc.template !== "triple-column" && ((doc.featureTitle || "").trim() || (doc.featureDetail || "").trim())) {
    const head = (doc.featureTitle || "").trim();
    const hx = feature.x + 48;
    if (!href) {
      const cap = Math.min(240, Math.round(feature.h * 0.26));
      const ink = colors.featureInk;
      const shade = mixHex(colors.feature, "#061018", 0.42);
      parts.push(`<rect x="${feature.x}" y="${feature.y}" width="8" height="${feature.h}" fill="${ink}"/>`);
      parts.push(`<rect x="${feature.x}" y="${feature.y}" width="${feature.w}" height="${cap}" fill="${shade}"/>`);
      parts.push(`<rect x="${feature.x}" y="${feature.y + feature.h - cap}" width="${feature.w}" height="${cap}" fill="${shade}"/>`);
      const headY = feature.y + Math.round(cap * 0.62);
      parts.push(`<text x="${hx}" y="${headY}" font-family="${family}" font-size="52" font-weight="800" fill="${ink}">${esc(fitWidth(head, 52, feature.w - 96))}</text>`);
      if (doc.featureDetail) {
        parts.push(`<text x="${hx}" y="${headY + 72}" font-family="${family}" font-size="24" fill="${ink}">${esc(fitWidth(doc.featureDetail, 24, feature.w - 96))}</text>`);
      }
    } else {
      const bandY = feature.y + feature.h - 170;
      parts.push(`<rect x="${feature.x}" y="${bandY}" width="${feature.w}" height="170" fill="${colors.feature}"/>`);
      parts.push(`<text x="${hx}" y="${bandY + 62}" font-family="${family}" font-size="40" font-weight="800" fill="${colors.featureInk}">${esc(fitWidth(head, 40, feature.w - 80))}</text>`);
      if (doc.featureDetail) {
        parts.push(`<text x="${hx}" y="${bandY + 132}" font-family="${family}" font-size="22" fill="${colors.featureInk}">${esc(fitWidth(doc.featureDetail, 22, feature.w - 80))}</text>`);
      }
    }
  }
  parts.push("</svg>");
  return parts.join("");
}
