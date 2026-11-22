/** Layout Studio boards. Shared by the editor and the server. No database and no HTML from clients. */

import { boardFont, FONT_CHOICE_ERROR, isBoardFont, widthScaleForFamily, type BoardFontId } from "@/lib/board-fonts";
import { MENU_LIMITS } from "@/lib/menu-templates";
import { sectionShows, shownSections } from "@/lib/menu-fields";
import { isDesignId, isStockPhoto, type StockPhotoId } from "@/lib/menu-designs";
import { designSvg, designSvgWithReport, designVideoBox, safeDesignHref, type DesignArt } from "@/lib/menu-design-svg";
import {
  activeCustom, emptyClips, fixedRegion, focusPlacement, itemRegion, parseCustom, parseHeadingOverride, sectionHeadingStyle, sectionRegion, snapWeight,
  LAYOUT_MEDIA, READABLE_FLOORS, type ActiveCustom, type BoardRegion, type ClipArea, type LayoutCustom, type RoleKey, type RoleTypography,
} from "@/lib/board-custom";

export { MENU_LIMITS };

export const LAYOUT_VERSION = 1;
export const BOARD_W = 1920;
export const BOARD_H = 1080;

export type LayoutTemplate = "menu-promo-67" | "triple-column" | "split-50" | "menu-banner" | "signature" | "two-menu-promo" | "two-column";
export type ZoneBox = { x: number; y: number; w: number; h: number };
export type LayoutItem = {
  name: string; price: string; description: string;
  /** Optional food photo for this item (same-account JPEG/PNG/WebP). Travels with the item when it moves. */
  imageMediaId?: string;
  /** Sample photo from a photo template, used until the owner adds their own. */
  stockPhoto?: StockPhotoId;
  /** Optional stable id from a client ([A-Za-z0-9_-], up to 40). Used for preview region ids; never drawn. */
  id?: string;
};
export type LayoutSection = {
  name: string; items: LayoutItem[];
  /** Optional stable id from a client ([A-Za-z0-9_-], up to 40). Used for preview region ids; never drawn. */
  id?: string;
  /** "This section only" heading size/weight (lib/board-custom.ts). Wins over custom.roles.sectionHeading. */
  headingOverride?: RoleTypography;
};

export type BoardPalette = "classic" | "fresh" | "bold";
export type TypeScale = "room" | "counter";
export type BoardFont = BoardFontId;

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
  /** Bundled face used for both the preview and the published PNG (headings, and body text unless bodyFont is set). */
  font: BoardFont;
  /**
   * E6-F2: body face (item names, prices, descriptions, subtitle, footer, feature detail). Set only on new boards
   * seeded from a Brand Kit with a different body font; absent = `font`, so existing boards render as before.
   */
  bodyFont?: BoardFont;
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
  /**
   * Premium template (lib/menu-designs.ts). Absent on every board made before templates, which keep the original
   * renderer unchanged. Present: lib/menu-design-svg.ts draws the board (same SVG in the editor and the PNG).
   */
  design?: string;
  /** Colour style id inside the design. */
  variant?: string;
  /** A bundled stock photo used until the owner picks their own (imageMediaId wins). */
  stockPhoto?: StockPhotoId;
  /** Same-account logo (from the Brand Kit or uploaded) drawn in a design board's header. */
  logoMediaId?: string | null;
  /**
   * How item photos show on a design board: "thumbs" (small photos beside items) or "text" (hidden; the photos stay
   * on the items). Absent = the design's own default. Card templates always show item photos.
   */
  photoStyle?: "thumbs" | "text";
  /**
   * Guided customization (lib/board-custom.ts). Absent on every board made before it, which draw exactly as before.
   * Reset = delete the key. v > 1 is preserved but not applied.
   */
  custom?: LayoutCustom;
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
  "two-menu-promo": { min: 0.28, max: 0.42, def: 0.35, name: "Two-column menu + promo" },
  "two-column": { min: 0.4, max: 0.6, def: 0.5, name: "Two-column menu" },
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
  if (template === "two-menu-promo") {
    return [
      { id: "column-0", label: "Menu column 1", ...text },
      { id: "column-1", label: "Menu column 2", ...text },
      { id: "feature", label: "Promotion", ...media },
    ];
  }
  if (template === "two-column") {
    return [
      { id: "column-0", label: "Menu column 1", ...text },
      { id: "column-1", label: "Menu column 2", ...text },
      { id: "photo", label: "Board photo", ...photo },
    ];
  }
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
  if (template === "two-menu-promo") {
    // Additive template: two independently editable menu columns (~35/35) and a promo image/video (~30) on one 16:9 board.
    const widths = normalizedColumns(columnWidths) ?? ([0.35, 0.35, 0.30] as [number, number, number]);
    const first = Math.round(BOARD_W * widths[0]);
    const second = Math.round(BOARD_W * widths[1]);
    const third = BOARD_W - first - second;
    const columns = [box(0, 0, first, BOARD_H), box(first, 0, second, BOARD_H), box(first + second, 0, third, BOARD_H)];
    const menu = box(0, 0, first + second, BOARD_H);
    const feature = columns[2];
    return { template, split: ratio, menu, feature, video: feature, columns };
  }
  if (template === "two-column") {
    // Additive: two independently editable menu-text columns on one 16:9 board. No video region (it would cover a column).
    const widths = normalizedColumns(columnWidths) ?? ([0.5, 0.5, 0] as [number, number, number]);
    const first = Math.round(BOARD_W * (widths[0] / (widths[0] + widths[1] || 1)));
    const second = BOARD_W - first;
    const columns = [box(0, 0, first, BOARD_H), box(first, 0, second, BOARD_H)];
    return { template, split: ratio, menu: box(0, 0, BOARD_W, BOARD_H), feature: columns[1], video: null, columns };
  }
  const left = Math.round(BOARD_W * ratio);
  const menu = box(0, 0, left, BOARD_H);
  const feature = box(left, 0, BOARD_W - left, BOARD_H);
  return { template, split: ratio, menu, feature, video: feature, columns: [menu] };
}

/** Bottom promo band on Menu and promotion and Split showcase. Empty copy gets no band. */
export const PROMO_BAND = 170;

export function promoBandHeight(doc: { template: LayoutTemplate; featureTitle?: string; featureDetail?: string }): number {
  if (doc.template !== "menu-promo-67" && doc.template !== "split-50" && doc.template !== "two-menu-promo") return 0;
  if (!(doc.featureTitle || "").trim() && !(doc.featureDetail || "").trim()) return 0;
  return PROMO_BAND;
}

/** The rectangle the video and its fallback photo share. The promo band stays below it. */
export function mediaVideoBox(doc: LayoutDocument): ZoneBox | null {
  if (doc.design && isDesignId(doc.design)) return designVideoBox(doc);
  const frame = frameFor(doc.template, effectiveSplit(doc), doc.columnWidths);
  if (!frame.video) return null;
  const band = promoBandHeight(doc);
  if (band <= 0 || band >= frame.video.h - 80) return frame.video;
  return { x: frame.video.x, y: frame.video.y, w: frame.video.w, h: frame.video.h - band };
}

/** The split an original layout draws with: the owner's featured media size when set (kept in sync on save), else `split`. */
export function effectiveSplit(doc: LayoutDocument): number {
  const media = LAYOUT_MEDIA[doc.template];
  if (!media || (doc.design && isDesignId(doc.design))) return doc.split;
  const active = activeCustom(doc);
  if (!active || active.mediaSize == null) return doc.split;
  return Math.round(media.toSplit(Math.min(media.max, Math.max(media.min, active.mediaSize))) * 10000) / 10000;
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
  // Emptied sections and blank rows are dropped and do not count toward the limits (QA B1-04).
  // The raw arrays still have a generous hard cap so a request cannot be unbounded.
  if (!Array.isArray(raw.sections) || raw.sections.length > MENU_LIMITS.sections * 3) {
    return { ok: false, error: `Use up to ${MENU_LIMITS.sections} sections.` };
  }
  const sections: LayoutSection[] = [];
  let total = 0;
  for (const section of raw.sections) {
    if (!section || typeof section !== "object") return { ok: false, error: "Check your sections." };
    const sec = section as Record<string, unknown>;
    const name = text(sec.name, 30);
    if (name == null) return { ok: false, error: "Check your sections." };
    if (!Array.isArray(sec.items) || sec.items.length > MENU_LIMITS.itemsPerSection * 3) {
      return { ok: false, error: `Use up to ${MENU_LIMITS.itemsPerSection} items per section.` };
    }
    const sectionExtras: Partial<LayoutSection> = {};
    // Optional client ids are kept only when valid (same as item photos). An invalid id is dropped, not a 400.
    if (clientId(sec.id)) sectionExtras.id = sec.id as string;

    if (sec.headingOverride != null) {
      const override = parseHeadingOverride(sec.headingOverride);
      if (!override.ok) return override;
      if (override.value) sectionExtras.headingOverride = override.value;
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
      // Item photos are optional and only kept when valid, so items without them parse exactly as before.
      const photo = typeof row.imageMediaId === "string" && UUID.test(row.imageMediaId) ? { imageMediaId: row.imageMediaId.toLowerCase() } : {};
      const stock = isStockPhoto(row.stockPhoto) ? { stockPhoto: row.stockPhoto } : {};
      const itemId = clientId(row.id) ? { id: row.id as string } : {};
      items.push({ name: itemName, price: price ?? "", description: description ?? "", ...photo, ...stock, ...itemId });
    }
    if (items.length > MENU_LIMITS.itemsPerSection) return { ok: false, error: `Use up to ${MENU_LIMITS.itemsPerSection} items per section.` };
    total += items.length;
    if (name || items.length) sections.push({ name: name ?? "", items, ...sectionExtras });
  }
  if (sections.length > MENU_LIMITS.sections) return { ok: false, error: `Use up to ${MENU_LIMITS.sections} sections.` };
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
  const font = isBoardFont(raw.font) ? raw.font : raw.font == null || raw.font === "" ? "inter" : null;
  if (font == null) return { ok: false, error: FONT_CHOICE_ERROR };
  if (raw.bodyFont != null && raw.bodyFont !== "" && !isBoardFont(raw.bodyFont)) return { ok: false, error: FONT_CHOICE_ERROR };
  const bodyFont = isBoardFont(raw.bodyFont) && raw.bodyFont !== font ? raw.bodyFont : undefined;
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
  const design = designFields(raw);
  const custom = parseCustom(raw.custom, { template: raw.template, design: design.design });
  if (!custom.ok) return custom;
  // Original layouts: a customized media size is the split older apps already understand, so both stay in sync.
  const layoutMedia = !design.design ? LAYOUT_MEDIA[raw.template] : undefined;
  const syncedSplit = layoutMedia && custom.value && custom.value.v === 1 && typeof custom.value.mediaSize === "number"
    ? Math.round(layoutMedia.toSplit(custom.value.mediaSize) * 10000) / 10000 : split;
  return {
    ok: true,
    value: {
      layoutVersion: 1, template: raw.template, split: syncedSplit, title: title ?? "", subtitle: subtitle ?? "", footer: footer ?? "",
      sections, imageMediaId, videoMediaId, palette, primaryColor, accentColor, typeScale, font,
      ...(bodyFont ? { bodyFont } : {}),
      textColor, backgroundColor,
      featureTitle: featureTitle ?? "", featureDetail: featureDetail ?? "",
      columnWidths, imageFit, imageAnchor,
      // Item photo display applies to every board (templates and original layouts). Absent = shown when present.
      ...(raw.photoStyle === "thumbs" || raw.photoStyle === "text" ? { photoStyle: raw.photoStyle } : {}),
      ...design,
      ...(custom.value ? { custom: custom.value } : {}),
    },
  };
}

function clientId(value: unknown): boolean {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(value);
}

/** Premium template fields. Only added when present and valid, so older documents parse exactly as before. */
function designFields(raw: Record<string, unknown>): Partial<LayoutDocument> {
  if (!isDesignId(raw.design)) return {};
  const out: Partial<LayoutDocument> = { design: raw.design as string };
  if (typeof raw.variant === "string" && /^[a-z0-9-]{1,32}$/.test(raw.variant)) out.variant = raw.variant;
  if (isStockPhoto(raw.stockPhoto)) out.stockPhoto = raw.stockPhoto;
  if (typeof raw.logoMediaId === "string" && UUID.test(raw.logoMediaId)) out.logoMediaId = raw.logoMediaId.toLowerCase();
  return out;
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
      title: "Your restaurant", subtitle: "Today's specials", footer: "Ask your server about allergens",
      featureTitle: "Chef's special", featureDetail: "Add your special and its price here",
      sections: [
        { name: "Starters", items: [
          { name: "Soup of the day", price: "$7", description: "Ask your server" },
          { name: "House salad", price: "$9", description: "Greens, vinaigrette" },
          { name: "Garlic bread", price: "$6", description: "Toasted, herb butter" },
        ] },
        { name: "Mains", items: [
          { name: "Grilled chicken", price: "$16", description: "Rice, seasonal vegetables" },
          { name: "Burger", price: "$15", description: "Cheddar, fries" },
          { name: "Pasta", price: "$14", description: "Tomato, basil" },
        ] },
      ],
    }),
    "menu-banner": board(template, {
      // New boards start with a taller banner (25% of the board) so a photo is not a thin sliver (QA B1-06).
      split: 0.25, palette: "classic", primaryColor: null, accentColor: null, typeScale: "room",
      title: "Your restaurant", subtitle: "Lunch and dinner", footer: "Ask about today's specials",
      featureTitle: "Happy hour", featureDetail: "Add your times and deal here",
      sections: [
        { name: "Plates", items: [
          { name: "Soup and salad", price: "$11", description: "Rotates daily" },
          { name: "Grain bowl", price: "$13", description: "Greens, grains, tahini" },
          { name: "Half sandwich", price: "$9", description: "Chicken or veggie" },
          { name: "Chili", price: "$8", description: "Cup or bowl" },
        ] },
        { name: "Drinks", items: [
          { name: "Lemonade", price: "$4", description: "Fresh squeezed" },
          { name: "Iced tea", price: "$3", description: "Unsweetened" },
          { name: "Coffee", price: "$3", description: "Free refills" },
          { name: "Soda", price: "$3", description: "Fountain" },
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
    "two-menu-promo": {
      ...board(template, {
        split: 0.35, palette: "fresh", primaryColor: null, accentColor: null, typeScale: "room",
        title: "Casa Mesa", subtitle: "Lunch and dinner, one kitchen", footer: "Ask about the daily special",
        featureTitle: "Tonight", featureDetail: "Chef's tasting, 5 to 9",
        sections: [
          { name: "Lunch", items: [
            { name: "Chicken torta", price: "$14", description: "Citrus chicken, pickled onion" },
            { name: "Market salad", price: "$12", description: "Greens, seeds, lime" },
            { name: "Pozole", price: "$13", description: "Pork, radish, oregano" },
            { name: "Fish tacos", price: "$15", description: "Two, cabbage, crema" },
            { name: "Cubana", price: "$14", description: "Ham, cheese, black bean" },
            { name: "Soup of the day", price: "$8", description: "Ask your server" },
          ] },
          { name: "Dinner", items: [
            { name: "Carne asada", price: "$26", description: "Grilled steak, salsa roja" },
            { name: "Chile relleno", price: "$22", description: "Cheese, walnut sauce" },
            { name: "Catch of the day", price: "$28", description: "Citrus and herbs" },
            { name: "Mushroom asado", price: "$21", description: "Roasted squash, mole" },
            { name: "Short rib", price: "$29", description: "Slow cooked, plantain" },
            { name: "Side of rice", price: "$6", description: "Garlic and cumin" },
          ] },
        ],
      }),
      columnWidths: [0.35, 0.35, 0.30],
    },
    "two-column": board(template, {
      split: 0.5, palette: "fresh", primaryColor: null, accentColor: null, typeScale: "room",
      title: "Casa Mesa", subtitle: "Open daily", footer: "Ask about the daily special",
      featureTitle: "", featureDetail: "",
      sections: [
        { name: "Lunch", items: [
          { name: "Chicken torta", price: "$14", description: "Citrus chicken, pickled onion" },
          { name: "Market salad", price: "$12", description: "Greens, seeds, lime" },
          { name: "Pozole", price: "$13", description: "Pork, radish, oregano" },
          { name: "Fish tacos", price: "$15", description: "Two, cabbage, crema" },
          { name: "Cubana", price: "$14", description: "Ham, cheese, black bean" },
        ] },
        { name: "Dinner", items: [
          { name: "Carne asada", price: "$26", description: "Grilled steak, salsa roja" },
          { name: "Chile relleno", price: "$22", description: "Cheese, walnut sauce" },
          { name: "Catch of the day", price: "$28", description: "Citrus and herbs" },
          { name: "Mushroom asado", price: "$21", description: "Roasted squash, mole" },
          { name: "Short rib", price: "$29", description: "Slow cooked, plantain" },
        ] },
      ],
    }),
  };
  return samples[template];
}

/** Apply saved Brand Kit colours to a NEW board document only.
 *  Leaves the document unchanged when it already has colours, or when no kit colours are available.
 *  Callers must not run this on an existing saved board. */
export type BrandSeed = {
  primaryColor?: string | null;
  accentColor?: string | null;
  textColor?: string | null;
  backgroundColor?: string | null;
  headingFont?: string | null;
  bodyFont?: string | null;
  displayName?: string | null;
  phone?: string | null;
  website?: string | null;
} | null | undefined;

/**
 * Seed a fresh Layout document with the account brand. Used only for new
 * boards (no menuId). A document that already has a primary or accent colour
 * is treated as already branded and is left untouched.
 * `font` takes the heading font (or the body font when only that is set); a different body font goes in
 * `bodyFont` (E6-F2), so item text uses the body font instead of the heading font.
 * Title and footer are filled only when the kit has a display name or contact.
 */
export function seedBrand(doc: LayoutDocument, kit: BrandSeed): LayoutDocument {
  if (doc.primaryColor || doc.accentColor) return doc;
  const primaryColor = kit?.primaryColor || null;
  const accentColor = kit?.accentColor || null;
  const textColor = kit?.textColor || null;
  const backgroundColor = kit?.backgroundColor || null;
  const heading = isBoardFont(kit?.headingFont) ? kit.headingFont : null;
  const body = isBoardFont(kit?.bodyFont) ? kit.bodyFont : null;
  const font = heading ?? body ?? null;
  const bodyFont = heading && body && body !== heading ? body : null;
  const title = clipSeedText(kit?.displayName, MENU_LIMITS.title);
  const footer = clipSeedText(seedFooter(kit), MENU_LIMITS.footer);
  if (!primaryColor && !accentColor && !textColor && !backgroundColor && !font && !title && !footer) return doc;
  return {
    ...doc,
    ...(primaryColor ? { primaryColor } : {}),
    ...(accentColor ? { accentColor } : {}),
    ...(textColor ? { textColor } : {}),
    ...(backgroundColor ? { backgroundColor } : {}),
    ...(font ? { font } : {}),
    ...(bodyFont ? { bodyFont } : {}),
    ...(title ? { title } : {}),
    ...(footer ? { footer } : {}),
  };
}

function clipSeedText(value: string | null | undefined, max: number): string | null {
  if (!value) return null;
  const clean = value.replace(/\p{Cc}/gu, " ").replace(/\s+/g, " ").trim();
  if (!clean) return null;
  return clean.length > max ? clean.slice(0, max).trimEnd() : clean;
}

function seedFooter(kit: BrandSeed): string | null {
  if (!kit) return null;
  const parts = [kit.phone, kit.website].map((p) => (typeof p === "string" ? p.replace(/\p{Cc}/gu, " ").replace(/\s+/g, " ").trim() : "")).filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
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
  // Bundled sample photos (public/menu-templates), the same paths template boards accept.
  if (/^\/menu-templates\/[a-z]+\.jpg$/.test(value)) return value;
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

function measure(value: string, size: number, family = "Inter") {
  let units = 0;
  for (const ch of value) {
    if (/[ilI.,:;'!|]/.test(ch)) units += 0.28;
    else if (/[mwMW@]/.test(ch)) units += 0.86;
    else if (/[A-Z0-9$&]/.test(ch)) units += 0.66;
    else if (ch === " ") units += 0.27;
    else units += 0.56;
  }
  return units * size * 1.05 * widthScaleForFamily(family);
}

/**
 * MB1-F1: while set, item names that fitWidth shortens are recorded here so the editor can say so.
 * Recording never changes what is drawn; the TV render calls layoutSvg and is unaffected.
 */
let clippedItemNames: string[] | null = null;

/**
 * Guided customization on original layouts. `active` is null for uncustomized boards, which keep every expression
 * exactly as before; regions, clip counts and dropped items are only recorded, never drawn.
 */
type LayoutRun = {
  active: ActiveCustom | null;
  regions: BoardRegion[];
  clips: Record<ClipArea, number>;
  items: Map<object, [number, number]>;
  dropped: number;
  doc: LayoutDocument;
};
let lrun: LayoutRun | null = null;
function lnote(area: ClipArea, original: string, drawn: string) {
  if (lrun && drawn.endsWith("…") && !original.trim().endsWith("…")) lrun.clips[area] += 1;
}
function lregion(region: BoardRegion | null) { if (lrun && region) lrun.regions.push(region); }
function lroleSize(role: RoleKey, def: number) {
  if (!lrun?.active) return def;
  return Math.round(Math.max(Math.min(READABLE_FLOORS[role], def), def * lrun.active.scale[role]));
}
function lroleWeight(role: RoleKey, family: string, def: number) {
  const choice = lrun?.active?.weight[role];
  return choice ? snapWeight(family, choice) : def;
}
function sectionIndexOf(section: LayoutSection): number | null {
  const first = section.items[0];
  const at = first && lrun ? lrun.items.get(first) : undefined;
  return at ? at[0] : null;
}

function fitWidth(value: string, size: number, max: number, family = "Inter") {
  if (measure(value, size, family) <= max) return value;
  const chars = [...value];
  while (chars.length > 1 && measure(`${chars.join("")}…`, size, family) > max) chars.pop();
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
  return boardFont(font).family;
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

type Families = { heading: string; body: string };

/** Item photos on an original layout: compact thumbnails beside the items that have one. */
type ItemPhotos = { images: Record<string, string>; fill: string; next: () => string };

/**
 * Item photos show automatically on original layouts whenever an item has an owner photo.
 * Deprecated `photoStyle: "text"` is ignored at render time (kept accepted by parseLayout for older clients).
 */
export function layoutItemPhotosShown(doc: Pick<LayoutDocument, "sections" | "photoStyle">): boolean {
  return doc.sections.some((section) => section.items.some((item) => Boolean(item.imageMediaId)));
}

function paintItems(parts: string[], sections: LayoutSection[], x0: number, top: number, width0: number, bottom: number, colors: BoardColors, scale: TypeScale, families: Families, spread = false, unitOverride?: number, minDescSize = 10, photos?: ItemPhotos | null) {
  if (lrun?.active) return paintItemsCustom(parts, sections, x0, top, width0, bottom, colors, scale, families, spread, unitOverride, minDescSize, photos, lrun.active);
  const family = families.heading;
  const body = families.body;
  const unit = unitOverride ?? itemUnit(sections, top, bottom, scale, spread);
  const nameSize = Math.round(Math.min(40, Math.max(12, unit * 0.5)));
  // Boards up to 12 items keep the 10px floor (unchanged renders); long two-column menus use 14px.
  const descSize = Math.max(minDescSize, Math.round(nameSize * 0.55));
  let y = top;
  for (const section of sections) {
    // Only sections with an item photo make room for thumbnails, so their names stay aligned.
    const thumbs = Boolean(photos) && section.items.some((item) => Boolean(item.imageMediaId));
    let x = x0;
    let width = width0;
    if (section.name) {
      y += unit * 0.72;
      const si = sectionIndexOf(section);
      if (si != null && lrun) lregion(sectionRegion(lrun.doc.sections[si] ?? section, si, { x: x0, y: y - Math.max(18, nameSize - 6), w: width0, h: Math.max(18, nameSize - 6) * 1.25 }));
      const heading = fitWidth(section.name.toUpperCase(), nameSize - 6, width0, family);
      lnote("menu", section.name.toUpperCase(), heading);
      parts.push(`<text x="${x0}" y="${y.toFixed(1)}" font-family="${family}" font-size="${Math.max(18, nameSize - 6)}" font-weight="800" fill="${colors.section}">${esc(heading)}</text>`);
      y += unit * 0.28;
    }
    for (const item of section.items) {
      y += unit * 0.78;
      const at = lrun?.items.get(item);
      if (at) lregion(itemRegion(item, at[0], at[1], { x: x0, y: y - nameSize, w: width0, h: nameSize * 1.3 + (item.description ? unit * 0.48 : 0) }));
      if (thumbs && photos) {
        const boxTop = y - nameSize * 0.85;
        const size = Math.round((item.description ? y + unit * 0.48 + descSize * 0.25 : y + nameSize * 0.3) - boxTop);
        // One text indent per section (the tallest thumbnail), so every name in it lines up.
        const tallest = Math.round(section.items.some((it) => it.description) ? nameSize * 0.85 + unit * 0.48 + descSize * 0.25 : nameSize * 1.15);
        const shift = tallest + Math.max(12, Math.round(tallest * 0.24));
        x = x0 + shift;
        width = width0 - shift;
        if (item.imageMediaId) {
          const r = Math.round(size * 0.18);
          const id = photos.next();
          const href = safeDesignHref(photos.images[item.imageMediaId]);
          parts.push(`<clipPath id="${id}"><rect x="${x0}" y="${boxTop.toFixed(1)}" width="${size}" height="${size}" rx="${r}"/></clipPath>`);
          parts.push(`<rect x="${x0}" y="${boxTop.toFixed(1)}" width="${size}" height="${size}" rx="${r}" fill="${photos.fill}"/>`);
          if (href) parts.push(`<image href="${esc(href)}" x="${x0}" y="${boxTop.toFixed(1)}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/>`);
        }
      }
      const price = item.price || "";
      const priceW = price ? measure(price, nameSize, body) + (colors.priceBg ? 28 : 0) : 0;
      const name = fitWidth(item.name, nameSize, Math.max(40, width - priceW - 24), body);
      if (clippedItemNames && name !== item.name) clippedItemNames.push(item.name);
      lnote("menu", item.name, name);
      if (price && colors.priceBg) {
        parts.push(`<rect x="${(x + width - priceW).toFixed(1)}" y="${(y - nameSize).toFixed(1)}" width="${priceW.toFixed(1)}" height="${(nameSize * 1.35).toFixed(1)}" rx="8" fill="${colors.priceBg}"/>`);
      }
      if (price) parts.push(`<text x="${(x + width - (colors.priceBg ? 12 : 0)).toFixed(1)}" y="${y.toFixed(1)}" text-anchor="end" font-family="${body}" font-size="${nameSize}" font-weight="700" fill="${colors.price}">${esc(price)}</text>`);
      parts.push(`<text x="${x}" y="${y.toFixed(1)}" font-family="${body}" font-size="${nameSize}" font-weight="700" fill="${colors.ink}">${esc(name)}</text>`);
      if (item.description) {
        y += unit * 0.48;
        const desc = fitWidth(item.description, descSize, width, body);
        lnote("menu", item.description, desc);
        parts.push(`<text x="${x}" y="${y.toFixed(1)}" font-family="${body}" font-size="${descSize}" fill="${colors.muted}">${esc(desc)}</text>`);
      }
    }
    y += unit * 0.2;
  }
}

/**
 * paintItems for a customized board: the owner's role sizes, weights, spacing and section heading overrides.
 * Sizes start at the template's own (× the owner's multipliers) and shrink together only while every role stays at
 * or above min(readable floor, the template's own size). Items that still do not fit are left off and counted
 * (the board then reports overflow and publishing waits), never squeezed into unreadable text.
 */
function paintItemsCustom(parts: string[], sections: LayoutSection[], x0: number, top: number, width0: number, bottom: number, colors: BoardColors, scale: TypeScale, families: Families, spread: boolean, unitOverride: number | undefined, minDescSize: number, photos: ItemPhotos | null | undefined, a: ActiveCustom) {
  const family = families.heading;
  const body = families.body;
  const unit = unitOverride ?? itemUnit(sections, top, bottom, scale, spread);
  const name0 = Math.round(Math.min(40, Math.max(12, unit * 0.5)));
  const desc0 = Math.max(minDescSize, Math.round(name0 * 0.55));
  const sec0 = Math.max(18, name0 - 6);
  const secK = (section: LayoutSection) => sectionHeadingStyle(a, section).scale;
  const lowest = (role: RoleKey, def: number, k: number) => (k > 0 ? Math.min(READABLE_FLOORS[role], def) / (def * k) : 0);
  const minHead = Math.min(a.scale.sectionHeading, ...sections.filter((s) => s.name).map(secK));
  const gMin = Math.max(lowest("itemName", name0, a.scale.itemName), lowest("price", name0, a.scale.price), lowest("description", desc0, a.scale.description), lowest("sectionHeading", sec0, minHead));
  const sizes = (g: number) => ({
    name: Math.round(name0 * a.scale.itemName * g), price: Math.round(name0 * a.scale.price * g), desc: Math.round(desc0 * a.scale.description * g),
  });
  const height = (g: number) => {
    const z = sizes(g);
    let h = 0;
    for (const section of sections) {
      const sz = sec0 * secK(section) * g;
      if (section.name) h += (unit * 0.72 * a.sectionGap + unit * 0.28) * Math.max(1, sz / sec0);
      for (const item of section.items) {
        h += unit * 0.78 * a.itemGap * Math.max(1, Math.max(z.name, z.price) / name0);
        if (item.description) h += unit * 0.48 * Math.max(1, z.desc / desc0);
      }
      h += unit * 0.2 * a.sectionGap;
    }
    return h;
  };
  let g = 1;
  while (g - 0.02 >= gMin - 1e-6 && top + height(g) > bottom) g -= 0.02;
  if (g < gMin) g = gMin;
  const z = sizes(g);
  const nameW = lroleWeight("itemName", body, 700);
  const priceW = lroleWeight("price", body, 700);
  const descWeight = a.weight.description ? ` font-weight="${snapWeight(body, a.weight.description)}"` : "";
  let y = top;
  for (const section of sections) {
    const thumbs = Boolean(photos) && section.items.some((item) => Boolean(item.imageMediaId));
    let x = x0;
    let width = width0;
    if (section.name) {
      const hs = sectionHeadingStyle(a, section);
      const sz = Math.round(sec0 * hs.scale * g);
      const grow = Math.max(1, sz / sec0);
      y += unit * 0.72 * a.sectionGap * grow;
      if (y > bottom) { if (lrun) lrun.dropped += section.items.length; continue; }
      const si = sectionIndexOf(section);
      if (si != null && lrun) lregion(sectionRegion(lrun.doc.sections[si] ?? section, si, { x: x0, y: y - sz, w: width0, h: sz * 1.25 }));
      const heading = fitWidth(section.name.toUpperCase(), sz, width0, family);
      lnote("menu", section.name.toUpperCase(), heading);
      parts.push(`<text x="${x0}" y="${y.toFixed(1)}" font-family="${family}" font-size="${sz}" font-weight="${hs.weight ? snapWeight(family, hs.weight) : 800}" fill="${colors.section}">${esc(heading)}</text>`);
      y += unit * 0.28 * grow;
    }
    for (const item of section.items) {
      const step = unit * 0.78 * a.itemGap * Math.max(1, Math.max(z.name, z.price) / name0);
      const descStep = item.description ? unit * 0.48 * Math.max(1, z.desc / desc0) : 0;
      if (y + step + descStep > bottom + 2) { if (lrun) lrun.dropped += 1; continue; }
      y += step;
      const at = lrun?.items.get(item);
      if (at) lregion(itemRegion(item, at[0], at[1], { x: x0, y: y - z.name, w: width0, h: z.name * 1.3 + descStep }));
      if (thumbs && photos) {
        const boxTop = y - z.name * 0.85;
        const size = Math.round((item.description ? y + descStep + z.desc * 0.25 : y + z.name * 0.3) - boxTop);
        const tallest = Math.round(section.items.some((it) => it.description) ? z.name * 0.85 + unit * 0.48 * Math.max(1, z.desc / desc0) + z.desc * 0.25 : z.name * 1.15);
        const shift = tallest + Math.max(12, Math.round(tallest * 0.24));
        x = x0 + shift;
        width = width0 - shift;
        if (item.imageMediaId) {
          const r = Math.round(size * 0.18);
          const id = photos.next();
          const href = safeDesignHref(photos.images[item.imageMediaId]);
          parts.push(`<clipPath id="${id}"><rect x="${x0}" y="${boxTop.toFixed(1)}" width="${size}" height="${size}" rx="${r}"/></clipPath>`);
          parts.push(`<rect x="${x0}" y="${boxTop.toFixed(1)}" width="${size}" height="${size}" rx="${r}" fill="${photos.fill}"/>`);
          if (href) parts.push(`<image href="${esc(href)}" x="${x0}" y="${boxTop.toFixed(1)}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/>`);
        }
      }
      const price = item.price || "";
      const pw = price ? measure(price, z.price, body) + (colors.priceBg ? 28 : 0) : 0;
      const name = fitWidth(item.name, z.name, Math.max(40, width - pw - 24), body);
      if (clippedItemNames && name !== item.name) clippedItemNames.push(item.name);
      lnote("menu", item.name, name);
      if (price && colors.priceBg) {
        parts.push(`<rect x="${(x + width - pw).toFixed(1)}" y="${(y - z.price).toFixed(1)}" width="${pw.toFixed(1)}" height="${(z.price * 1.35).toFixed(1)}" rx="8" fill="${colors.priceBg}"/>`);
      }
      if (price) parts.push(`<text x="${(x + width - (colors.priceBg ? 12 : 0)).toFixed(1)}" y="${y.toFixed(1)}" text-anchor="end" font-family="${body}" font-size="${z.price}" font-weight="${priceW}" fill="${colors.price}">${esc(price)}</text>`);
      parts.push(`<text x="${x}" y="${y.toFixed(1)}" font-family="${body}" font-size="${z.name}" font-weight="${nameW}" fill="${colors.ink}">${esc(name)}</text>`);
      if (item.description) {
        y += descStep;
        const desc = fitWidth(item.description, z.desc, width, body);
        lnote("menu", item.description, desc);
        parts.push(`<text x="${x}" y="${y.toFixed(1)}" font-family="${body}" font-size="${z.desc}"${descWeight} fill="${colors.muted}">${esc(desc)}</text>`);
      }
    }
    y += unit * 0.2 * a.sectionGap;
  }
}

/** Single-column layouts switch to two columns above this many items. */
export const LONG_MENU_ITEMS = 12;
/** Smallest description text on a long (two-column) menu, in board pixels (1920×1080). */
export const LONG_MENU_DESC_MIN = 14;

function sectionWeight(section: LayoutSection) {
  return (section.name ? 1 : 0) + section.items.reduce((n, item) => n + (item.description ? 1.26 : 0.78), 0) + 0.2;
}

/** Two balanced columns for a long menu, or null when the menu should stay in one column. */
export function longMenuColumns(sections: LayoutSection[], width: number): LayoutSection[][] | null {
  const count = sections.reduce((n, section) => n + section.items.length, 0);
  if (count <= LONG_MENU_ITEMS || width < 760) return null;
  if (sections.length === 1) {
    const only = sections[0];
    const half = Math.ceil(only.items.length / 2);
    return [[{ name: only.name, items: only.items.slice(0, half) }], [{ name: "", items: only.items.slice(half) }]];
  }
  const total = sections.reduce((n, section) => n + sectionWeight(section), 0);
  let best = 1;
  let bestDiff = Infinity;
  let left = 0;
  for (let k = 1; k < sections.length; k++) {
    left += sectionWeight(sections[k - 1]);
    const diff = Math.abs(total - 2 * left);
    if (diff < bestDiff) { bestDiff = diff; best = k; }
  }
  return [sections.slice(0, best), sections.slice(best)];
}

export type LayoutArt = { imageHref?: string | null } & DesignArt;

/** Complete board. Menu text stays out of the video box. The still does not say a video is playing. */
/** The same SVG as layoutSvg, plus the item names the board shortens with "…" (as the TV does). */
export function layoutSvgWithClips(doc: LayoutDocument, art?: LayoutArt): { svg: string; clipped: string[] } {
  if (doc.design && isDesignId(doc.design)) return { svg: designSvgWithReport(doc, art).svg, clipped: [] };
  const sink: string[] = [];
  clippedItemNames = sink;
  try {
    const svg = layoutSvg(doc, art);
    return { svg, clipped: [...new Set(sink)] };
  } finally {
    clippedItemNames = null;
  }
}

export type LayoutRenderReport = { dropped: number; clips: Record<ClipArea, number>; regions: BoardRegion[]; clipped: string[] };

/** Any board (template or original layout) with what it left off, shortened and where its parts are (canvas px). */
export function boardSvgWithReport(doc: LayoutDocument, art?: LayoutArt): { svg: string; report: LayoutRenderReport } {
  if (doc.design && isDesignId(doc.design)) {
    const { svg, report } = designSvgWithReport(doc, art);
    return { svg, report: { dropped: report.dropped, clips: report.clips ?? emptyClips(), regions: report.regions ?? [], clipped: [] } };
  }
  const sink: string[] = [];
  const previous = { lrun, clippedItemNames };
  const items = new Map<object, [number, number]>();
  doc.sections.forEach((section, si) => section.items.forEach((item, ii) => items.set(item, [si, ii])));
  lrun = { active: activeCustom(doc), regions: [], clips: emptyClips(), items, dropped: 0, doc };
  clippedItemNames = sink;
  try {
    const svg = layoutSvgInner(doc, art);
    return { svg, report: { dropped: lrun.dropped, clips: lrun.clips, regions: lrun.regions, clipped: [...new Set(sink)] } };
  } finally {
    lrun = previous.lrun;
    clippedItemNames = previous.clippedItemNames;
  }
}

export function layoutSvg(doc: LayoutDocument, art?: LayoutArt): string {
  if (doc.design && isDesignId(doc.design)) return designSvg(doc, art);
  if (lrun) return layoutSvgInner(doc, art);
  const items = new Map<object, [number, number]>();
  const active = activeCustom(doc);
  if (!active) return layoutSvgInner(doc, art);
  doc.sections.forEach((section, si) => section.items.forEach((item, ii) => items.set(item, [si, ii])));
  lrun = { active, regions: [], clips: emptyClips(), items, dropped: 0, doc };
  try { return layoutSvgInner(doc, art); } finally { lrun = null; }
}

/** The featured/background photo of an original layout: template placement, or the owner's focal point. */
function layoutPhoto(href: string, box: ZoneBox, doc: LayoutDocument, art?: LayoutArt) {
  const focus = lrun?.active?.focus;
  if (!focus || doc.imageFit === "contain") return `<image href="${esc(href)}" x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" preserveAspectRatio="${imageAspect(doc)}"/>`;
  const place = focusPlacement(box, focus, art?.imageSize);
  if (place.kind === "anchor") return `<image href="${esc(href)}" x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" preserveAspectRatio="${place.aspect}"/>`;
  const r = (v: number) => (Math.round(v * 10) / 10).toString();
  return `<clipPath id="lfp"><rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}"/></clipPath><image href="${esc(href)}" x="${r(place.x)}" y="${r(place.y)}" width="${r(place.w)}" height="${r(place.h)}" preserveAspectRatio="none" clip-path="url(#lfp)"/>`;
}

function layoutSvgInner(doc: LayoutDocument, art?: LayoutArt): string {
  const frame = frameFor(doc.template, effectiveSplit(doc), doc.columnWidths);
  const colors = colorsFor(doc);
  const family = fontFamily(doc.font);
  const bodyFamily = fontFamily(doc.bodyFont ?? doc.font);
  const families: Families = { heading: family, body: bodyFamily };
  const href = safeImageHref(art?.imageHref);
  let clipN = 0;
  const photos: ItemPhotos | null = layoutItemPhotosShown(doc)
    ? { images: art?.itemImages ?? {}, fill: mixHex(colors.paper, colors.ink, 0.12), next: () => `ip${clipN++}` }
    : null;
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${BOARD_W}" height="${BOARD_H}" viewBox="0 0 ${BOARD_W} ${BOARD_H}">`,
    `<rect width="${BOARD_W}" height="${BOARD_H}" fill="${colors.feature}"/>`,
  ];
  const feature = frame.video ?? frame.feature;
  const media = mediaVideoBox(doc) ?? feature;
  if (doc.template === "triple-column" || doc.template === "two-column") {
    if (href) {
      parts.push(layoutPhoto(href, { x: 0, y: 0, w: BOARD_W, h: BOARD_H }, doc, art));
      parts.push(`<rect x="0" y="0" width="${BOARD_W}" height="${BOARD_H}" fill="${colors.paper}" fill-opacity="0.9"/>`);
    } else {
      frame.columns.forEach((column) => {
        parts.push(`<rect x="${column.x}" y="${column.y}" width="${column.w}" height="${column.h}" fill="${colors.paper}"/>`);
      });
    }
  } else if (href && doc.template !== "menu-banner") {
    const box = doc.template === "signature" ? frame.feature : media;
    parts.push(layoutPhoto(href, box, doc, art));
  }
  if (doc.template === "signature") {
    // Opaque card over the full-bleed background. Text stays on this card, not on the photo.
    parts.push(`<rect x="48" y="48" width="${frame.menu.w - 96}" height="${BOARD_H - 96}" fill="${colors.paper}"/>`);
  } else if (doc.template === "menu-banner") {
    parts.push(`<rect x="0" y="0" width="${BOARD_W}" height="${frame.menu.h}" fill="${colors.paper}"/>`);
    if (href) parts.push(layoutPhoto(href, feature, doc, art));
  } else if (doc.template !== "triple-column" && doc.template !== "two-column") {
    parts.push(`<rect x="${frame.menu.x}" y="${frame.menu.y}" width="${frame.menu.w}" height="${frame.menu.h}" fill="${colors.paper}"/>`);
  }
  if (colors.band && doc.template !== "signature") {
    const bandW = doc.template === "menu-banner" || doc.template === "triple-column" || doc.template === "two-column" ? BOARD_W : frame.menu.w;
    parts.push(`<rect x="0" y="0" width="${bandW}" height="132" fill="${colors.band}"/>`);
  }
  const menu = doc.template === "signature"
    ? { x: 88, y: 110, w: frame.menu.w - 176, bottom: BOARD_H - 110 }
    : doc.template === "menu-banner"
      ? { x: 72, y: colors.band ? 156 : 72, w: BOARD_W - 144, bottom: frame.menu.h - 72 }
      : doc.template === "triple-column" || doc.template === "two-column"
        ? { x: 48, y: colors.band ? 156 : 72, w: frame.columns[0].w - 80, bottom: BOARD_H - 64 }
        : { x: frame.menu.x + 48, y: colors.band ? 168 : 88, w: frame.menu.w - 96, bottom: BOARD_H - 72 };
  const kTitle = lrun?.active ? lrun.active.scale.businessName : 1;
  const titleMin = lrun?.active ? Math.max(34, Math.round(34 * kTitle)) : 34;
  let titleSize = lrun?.active ? Math.max(titleMin, Math.round(Math.min(colors.band && doc.template !== "signature" ? 84 : 96, 64 * kTitle) / 2) * 2) : 64;
  while (titleSize > titleMin && measure(doc.title || "Menu", titleSize, family) > menu.w) titleSize -= 2;
  const title = fitWidth(doc.title || "Menu", titleSize, menu.w, family);
  lnote("businessName", doc.title || "Menu", title);
  const titleFill = colors.band && doc.template !== "signature" ? colors.featureInk : colors.ink;
  const titleY = colors.band && doc.template !== "signature" ? 86 : menu.y;
  lregion(fixedRegion("businessName", colors.band && doc.template !== "signature" ? { x: 0, y: 0, w: doc.template === "menu-banner" || doc.template === "triple-column" || doc.template === "two-column" ? BOARD_W : frame.menu.w, h: 132 } : { x: menu.x, y: menu.y - titleSize, w: menu.w, h: titleSize * 1.2 + (doc.subtitle ? 50 : 0) }));
  parts.push(`<text x="${menu.x}" y="${titleY}" font-family="${family}" font-size="${titleSize}" font-weight="${lroleWeight("businessName", family, 800)}" fill="${titleFill}">${esc(title)}</text>`);
  if (doc.subtitle) {
    const onBand = Boolean(colors.band && doc.template !== "signature");
    parts.push(`<text x="${menu.x}" y="${onBand ? 118 : menu.y + 40}" font-family="${bodyFamily}" font-size="22" fill="${onBand ? colors.featureInk : colors.muted}">${esc(fitWidth(doc.subtitle, 22, menu.w, bodyFamily))}</text>`);
  }
  const textTop = colors.band && doc.template !== "signature" ? 180 : menu.y + (doc.subtitle ? 72 : 36);
  if (doc.template === "triple-column" || doc.template === "two-column") {
    const textTop = 176;
    const textBottom = BOARD_H - 64;
    const shared = Math.min(...frame.columns.map((_, index) => itemUnit(doc.sections[index] && sectionShows(doc.sections[index]) ? [doc.sections[index]] : [], textTop, textBottom, doc.typeScale)));
    frame.columns.forEach((column, index) => {
      const section = doc.sections[index];
      // Fixed columns keep their place; an empty column draws nothing, not even its heading (QA B1-04).
      if (!section || !sectionShows(section)) return;
      paintItems(parts, [section], column.x + 36, textTop, column.w - 72, textBottom, colors, doc.typeScale, families, false, shared, 10, photos);
    });
  } else if (doc.template === "two-menu-promo") {
    const textBottom = BOARD_H - 64;
    const menuColumns = frame.columns.slice(0, 2);
    const shared = Math.min(...menuColumns.map((_, index) => itemUnit(doc.sections[index] && sectionShows(doc.sections[index]) ? [doc.sections[index]] : [], textTop, textBottom, doc.typeScale)));
    menuColumns.forEach((column, index) => {
      const section = doc.sections[index];
      // Fixed columns keep their place; an empty column draws nothing, not even its heading (QA B1-04).
      if (!section || !sectionShows(section)) return;
      paintItems(parts, [section], column.x + 36, textTop, column.w - 72, textBottom, colors, doc.typeScale, families, false, shared, 10, photos);
    });
  } else {
    const shown = shownSections(doc.sections); // QA B1-04: sections with no items draw nothing
    const columns = longMenuColumns(shown, menu.w);
    if (columns) {
      // Long menus (more than LONG_MENU_ITEMS items) flow into two columns and use the full height,
      // instead of one column of tiny text in the top of the board (QA B1-05). Shorter menus are unchanged.
      const gap = 56;
      const colW = (menu.w - gap) / 2;
      const unit = Math.min(...columns.map((column) => itemUnit(column, textTop, menu.bottom, doc.typeScale, true)));
      columns.forEach((column, index) => {
        paintItems(parts, column, menu.x + index * (colW + gap), textTop, colW, menu.bottom, colors, doc.typeScale, families, true, unit, LONG_MENU_DESC_MIN, photos);
      });
    } else {
      paintItems(parts, shown, menu.x, textTop, menu.w, menu.bottom, colors, doc.typeScale, families, doc.template === "menu-banner", undefined, 10, photos);
    }
  }
  if (doc.footer && doc.template === "menu-banner") {
    parts.push(`<text x="72" y="${frame.menu.h - 28}" font-family="${bodyFamily}" font-size="28" font-weight="700" fill="${colors.ink}">${esc(fitWidth(doc.footer, 28, BOARD_W - 144, bodyFamily))}</text>`);
  } else if (doc.footer) {
    const footerY = doc.template === "signature" ? BOARD_H - 78 : BOARD_H - 40;
    parts.push(`<text x="${menu.x}" y="${footerY}" font-family="${bodyFamily}" font-size="22" fill="${colors.muted}">${esc(fitWidth(doc.footer, 22, menu.w, bodyFamily))}</text>`);
  }
  if (frame.video || doc.template === "signature") lregion(fixedRegion("featuredMedia", media));
  if (doc.template === "menu-banner") {
    const head = doc.featureTitle || "Today";
    const detail = doc.featureDetail || "";
    const hx = 72;
    const headSize = lroleSize("featuredText", Math.max(28, Math.min(44, Math.round(feature.h * 0.28))));
    const headY = feature.y + Math.round(feature.h * (detail ? 0.46 : 0.62));
    if (!href) {
      parts.push(`<rect x="${feature.x}" y="${feature.y}" width="10" height="${feature.h}" fill="${colors.featureInk}"/>`);
      parts.push(`<text x="${hx}" y="${headY}" font-family="${family}" font-size="${headSize}" font-weight="800" fill="${colors.featureInk}">${esc(fitWidth(head, headSize, feature.w - 120, family))}</text>`);
      if (detail) parts.push(`<text x="${hx}" y="${Math.min(feature.y + feature.h - 24, headY + headSize)}" font-family="${bodyFamily}" font-size="${Math.max(16, headSize - 12)}" fill="${colors.featureInk}">${esc(fitWidth(detail, headSize - 12, feature.w - 120, bodyFamily))}</text>`);
    } else {
      const bandH = Math.min(84, Math.max(48, Math.round(feature.h * 0.42)));
      const bandY = feature.y + feature.h - bandH;
      parts.push(`<rect x="${feature.x}" y="${bandY}" width="${feature.w}" height="${bandH}" fill="${colors.feature}"/>`);
      parts.push(`<text x="${hx}" y="${bandY + Math.round(bandH * 0.42)}" font-family="${family}" font-size="${Math.min(32, headSize)}" font-weight="800" fill="${colors.featureInk}">${esc(fitWidth(head, headSize, feature.w - 120, family))}</text>`);
      if (detail) parts.push(`<text x="${hx}" y="${bandY + bandH - 16}" font-family="${bodyFamily}" font-size="16" fill="${colors.featureInk}">${esc(fitWidth(detail, 16, feature.w - 120, bodyFamily))}</text>`);
    }
  } else if ((doc.template === "menu-promo-67" || doc.template === "split-50" || doc.template === "two-menu-promo") && promoBandHeight(doc) > 0) {
    const band = promoBandHeight(doc);
    const bandY = feature.y + feature.h - band;
    const hx = feature.x + 48;
    const title = (doc.featureTitle || "").trim();
    const detail = (doc.featureDetail || "").trim();
    parts.push(`<rect x="${feature.x}" y="${bandY}" width="${feature.w}" height="${band}" fill="${colors.feature}"/>`);
    lregion(fixedRegion("featuredText", { x: feature.x, y: bandY, w: feature.w, h: band }));
    const ts = lroleSize("featuredText", 40); const ds = lroleSize("featuredText", 22);
    const tshown = fitWidth(title, ts, feature.w - 80, family); const dshown = fitWidth(detail, ds, feature.w - 80, bodyFamily);
    if (title) lnote("featuredText", title, tshown);
    if (detail) lnote("featuredText", detail, dshown);
    if (title) parts.push(`<text x="${hx}" y="${bandY + 62}" font-family="${family}" font-size="${ts}" font-weight="${lroleWeight("featuredText", family, 800)}" fill="${colors.featureInk}">${esc(tshown)}</text>`);
    if (detail) parts.push(`<text x="${hx}" y="${bandY + 122}" font-family="${bodyFamily}" font-size="${ds}" fill="${colors.featureInk}">${esc(dshown)}</text>`);
  } else if (feature.h >= 280 && doc.template !== "triple-column" && doc.template !== "two-column" && ((doc.featureTitle || "").trim() || (doc.featureDetail || "").trim())) {
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
      parts.push(`<text x="${hx}" y="${headY}" font-family="${family}" font-size="52" font-weight="800" fill="${ink}">${esc(fitWidth(head, 52, feature.w - 96, family))}</text>`);
      if (doc.featureDetail) {
        parts.push(`<text x="${hx}" y="${headY + 72}" font-family="${bodyFamily}" font-size="24" fill="${ink}">${esc(fitWidth(doc.featureDetail, 24, feature.w - 96, bodyFamily))}</text>`);
      }
    } else {
      const bandY = feature.y + feature.h - 170;
      parts.push(`<rect x="${feature.x}" y="${bandY}" width="${feature.w}" height="170" fill="${colors.feature}"/>`);
      parts.push(`<text x="${hx}" y="${bandY + 62}" font-family="${family}" font-size="40" font-weight="800" fill="${colors.featureInk}">${esc(fitWidth(head, 40, feature.w - 80, family))}</text>`);
      if (doc.featureDetail) {
        parts.push(`<text x="${hx}" y="${bandY + 132}" font-family="${bodyFamily}" font-size="22" fill="${colors.featureInk}">${esc(fitWidth(doc.featureDetail, 22, feature.w - 80, bodyFamily))}</text>`);
      }
    }
  }
  parts.push("</svg>");
  return parts.join("");
}
