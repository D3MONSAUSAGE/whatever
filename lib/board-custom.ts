/**
 * Guided Editor Customization: the shared `custom` settings on a LayoutDocument (and `headingOverride` on a section).
 * One contract for the web editor, the Android app, the preview/fit API, the still renderer and the TV player.
 *
 * Rules (agreed with the Android owner):
 * - Absent keys mean "template default". Reset = delete the key (a whole role, spacing, imageFocus, one
 *   section's headingOverride, or all of `custom`). A board without `custom`/`headingOverride` renders exactly as before.
 * - parseLayout clamps known numbers to the template's bounds, refuses (400) only malformed known keys, and keeps
 *   unknown keys inside `custom` untouched. A `custom` with v > 1 is kept as-is and not applied.
 * - Weights are stored as chosen and snapped at render time to the weights the font actually ships.
 * - Text on a customized board never goes below the per-role readable floor (READABLE_FLOORS); when it would have to,
 *   the board reports an overflow instead of shrinking further.
 *
 * Client-safe: no server imports.
 */
import { BOARD_FONTS, type BoardFontId } from "@/lib/board-fonts";
import { designById, isDesignId, DESIGN_ITEM_PHOTO_DEFAULT, type DesignComposition } from "@/lib/menu-designs";
import type { LayoutDocument, LayoutSection, LayoutTemplate } from "@/lib/layout-studio";

export const CUSTOM_VERSION = 1;

export const ROLE_KEYS = ["businessName", "sectionHeading", "itemName", "description", "price", "featuredText"] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];
export const WEIGHT_CHOICES = ["normal", "medium", "semibold", "bold"] as const;
export type FontWeightChoice = (typeof WEIGHT_CHOICES)[number];
export const WEIGHT_VALUE: Record<FontWeightChoice, number> = { normal: 400, medium: 500, semibold: 600, bold: 700 };

export type RoleTypography = {
  /** Multiplier on the template's own size for this role, clamped to ROLE_SCALE. Absent = 1. */
  scale?: number;
  /** Stored as chosen; drawn with the nearest weight the role's font ships (see snapWeight). Absent = template weight. */
  weight?: FontWeightChoice;
};

export type LayoutCustom = {
  v: 1;
  /** Featured photo/video size: fraction of the board width (height on menu-banner), clamped to the template's media bounds. */
  mediaSize?: number;
  /** Overall text size multiplier (Step 4 presets), clamped to TEXT_SCALE. */
  textScale?: number;
  roles?: Partial<Record<RoleKey, RoleTypography>>;
  /** Spacing multipliers, clamped to SPACING_SCALE. */
  spacing?: { itemGap?: number; sectionGap?: number };
  /** Focal point (percent, 0–100) of the featured photo inside its box (Fill and, since t421u, Fit). */
  imageFocus?: { x: number; y: number };
  /** t421u: zoom of the featured photo inside its box, × the Fill/Fit scale, clamped to IMAGE_ZOOM. Absent = 1. */
  imageZoom?: number;
  /** Unknown keys from newer clients are preserved. */
  [extra: string]: unknown;
};

export const TEXT_SCALE = { min: 0.8, max: 1.3 } as const;
export const TEXT_SIZE_PRESETS = { compact: 0.88, default: 1, large: 1.12, extraLarge: 1.25 } as const;
export type TextSizePreset = keyof typeof TEXT_SIZE_PRESETS;
export const ROLE_SCALE = { min: 0.75, max: 1.5 } as const;
export const SPACING_SCALE = { min: 0.75, max: 1.4 } as const;
/** t421u: featured photo zoom bounds (× the Fill or Fit scale). */
export const IMAGE_ZOOM = { min: 1, max: 3, step: 0.05 } as const;

/**
 * t421u item photo size: a top-level LayoutDocument field (not inside `custom`, so a size-only board keeps the
 * template's own text fitting). Absent = the legacy size, which is exactly "small".
 */
export const ITEM_PHOTO_SIZES = ["small", "medium", "large"] as const;
export type ItemPhotoSize = (typeof ITEM_PHOTO_SIZES)[number];
export function isItemPhotoSize(value: unknown): value is ItemPhotoSize {
  return typeof value === "string" && (ITEM_PHOTO_SIZES as readonly string[]).includes(value);
}
export { DESIGN_ITEM_PHOTO_DEFAULT };

/**
 * Smallest size (board px on the 1920×1080 canvas) a customized board may draw each role at. A customized board never
 * goes below min(floor, the size the uncustomized board already uses); when it would have to, it reports overflow.
 */
export const READABLE_FLOORS: Record<RoleKey, number> = {
  businessName: 36, sectionHeading: 20, itemName: 20, description: 15, price: 20, featuredText: 18,
};

export type MediaSpec = { axis: "width" | "height"; min: number; max: number; def: number };
export type CustomizationSpec = {
  engine: "design" | "layout";
  /** Featured photo/video size slider; null = this template has no resizable media area. */
  media: MediaSpec | null;
  /** Roles this template draws (others are kept but have no effect here). */
  roles: RoleKey[];
  sectionHeadings: boolean;
  spacing: boolean;
  /** Fill/Fit and focus for the featured or background photo. */
  imageFocus: boolean;
  /** t421u: item photo size presets (null = control hidden: original layouts and classic boards). */
  itemPhotoSize: { def: ItemPhotoSize } | null;
};

const ALL_ROLES: RoleKey[] = [...ROLE_KEYS];
const NO_FEATURE: RoleKey[] = ROLE_KEYS.filter((r) => r !== "featuredText");

/** Media bounds for template compositions: fraction of board width the photo/video column takes. */
export const DESIGN_MEDIA: Partial<Record<DesignComposition, MediaSpec>> = {
  showcase: { axis: "width", min: 0.3, max: 0.5, def: 780 / 1920 },
  columns: { axis: "width", min: 0.24, max: 0.4, def: 576 / 1920 },
  promo: { axis: "width", min: 0.26, max: 0.42, def: 660 / 1920 },
};
const DESIGN_SPEC: Record<DesignComposition, Omit<CustomizationSpec, "media" | "engine" | "itemPhotoSize">> = {
  showcase: { roles: ALL_ROLES, sectionHeadings: true, spacing: true, imageFocus: true },
  columns: { roles: ALL_ROLES, sectionHeadings: true, spacing: true, imageFocus: true },
  promo: { roles: ALL_ROLES, sectionHeadings: true, spacing: true, imageFocus: true },
  list: { roles: NO_FEATURE, sectionHeadings: true, spacing: true, imageFocus: false },
  cards: { roles: ["businessName", "itemName", "description", "price"], sectionHeadings: false, spacing: false, imageFocus: false },
  // Featured dishes: the dish cards keep their own sizes; the photo width slider is hidden (approved recommendation 4).
  featured: { roles: NO_FEATURE, sectionHeadings: true, spacing: true, imageFocus: false },
};

/** Original layouts: mediaSize maps onto the existing `split` (kept in sync), so older clients draw the same frame. */
export const LAYOUT_MEDIA: Partial<Record<LayoutTemplate, MediaSpec & { toSplit: (m: number) => number; fromSplit: (s: number) => number }>> = {
  "menu-promo-67": { axis: "width", min: 0.25, max: 0.45, def: 0.33, toSplit: (m) => 1 - m, fromSplit: (s) => 1 - s },
  "split-50": { axis: "width", min: 0.4, max: 0.6, def: 0.5, toSplit: (m) => 1 - m, fromSplit: (s) => 1 - s },
  signature: { axis: "width", min: 0.3, max: 0.6, def: 0.45, toSplit: (m) => 1 - m, fromSplit: (s) => 1 - s },
  "menu-banner": { axis: "height", min: 0.12, max: 0.28, def: 0.15, toSplit: (m) => m, fromSplit: (s) => s },
};
const LAYOUT_SPEC: Record<LayoutTemplate, Omit<CustomizationSpec, "media" | "engine" | "itemPhotoSize">> = {
  "menu-promo-67": { roles: ALL_ROLES, sectionHeadings: true, spacing: true, imageFocus: true },
  "split-50": { roles: ALL_ROLES, sectionHeadings: true, spacing: true, imageFocus: true },
  // Signature draws its feature copy at a fixed size (no featuredText role).
  signature: { roles: NO_FEATURE, sectionHeadings: true, spacing: true, imageFocus: true },
  "menu-banner": { roles: ALL_ROLES, sectionHeadings: true, spacing: true, imageFocus: true },
  "two-menu-promo": { roles: ALL_ROLES, sectionHeadings: true, spacing: true, imageFocus: true },
  "triple-column": { roles: NO_FEATURE, sectionHeadings: true, spacing: true, imageFocus: true },
  "two-column": { roles: NO_FEATURE, sectionHeadings: true, spacing: true, imageFocus: true },
};

function strip(spec: MediaSpec | undefined): MediaSpec | null {
  if (!spec) return null;
  const { axis, min, max, def } = spec;
  return { axis, min, max, def };
}

export function designCustomizationSpec(composition: DesignComposition): CustomizationSpec {
  return { engine: "design", media: strip(DESIGN_MEDIA[composition]), ...DESIGN_SPEC[composition], itemPhotoSize: { def: DESIGN_ITEM_PHOTO_DEFAULT[composition] } };
}
export function layoutCustomizationSpec(template: LayoutTemplate): CustomizationSpec {
  return { engine: "layout", media: strip(LAYOUT_MEDIA[template]), ...LAYOUT_SPEC[template], itemPhotoSize: null };
}
/** The spec for a document: its template design when it has one, else its original layout. */
export function customizationSpec(doc: Pick<LayoutDocument, "design" | "template">): CustomizationSpec {
  const design = doc.design && isDesignId(doc.design) ? designById(doc.design) : null;
  return design ? designCustomizationSpec(design.composition) : layoutCustomizationSpec(doc.template);
}

/* ---------------- fonts ---------------- */

/** Weights each bundled font ships, as weight choices a client may offer (others snap to these). */
export function fontWeightChoices(font: BoardFontId): FontWeightChoice[] {
  const spec = BOARD_FONTS.find((f) => f.id === font);
  const shipped = spec ? spec.files.map((f) => f.weight) : [400];
  return WEIGHT_CHOICES.filter((choice) => shipped.includes(WEIGHT_VALUE[choice]));
}
export function fontWeightsByFont(): Record<BoardFontId, { choices: FontWeightChoice[]; weights: number[] }> {
  return Object.fromEntries(BOARD_FONTS.map((f) => [f.id, { choices: fontWeightChoices(f.id), weights: f.files.map((x) => x.weight) }])) as Record<BoardFontId, { choices: FontWeightChoice[]; weights: number[] }>;
}
function snapWeightTo(shipped: number[], weight: number): number {
  let best = shipped[0] ?? 400; let gap = Infinity;
  for (const w of shipped) {
    // Ties go to the heavier face, so "semibold" on a 400/700 font draws bold, never thinner than asked.
    const d = Math.abs(w - weight) - (w > weight ? 0.5 : 0);
    if (d < gap) { gap = d; best = w; }
  }
  return best;
}
/** The weight actually drawn for a choice in a family (render-time snap to shipped faces). */
export function snapWeight(family: string, choice: FontWeightChoice): number {
  const spec = BOARD_FONTS.find((f) => f.family === family);
  return snapWeightTo(spec ? spec.files.map((f) => f.weight) : [400, 700], WEIGHT_VALUE[choice]);
}

/* ---------------- parsing (server and clients) ---------------- */

const round = (v: number, d = 4) => Math.round(v * 10 ** d) / 10 ** d;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown) => typeof v === "number" && Number.isFinite(v);

export const CUSTOM_ERROR = "Check the look settings.";
const MAX_CUSTOM_BYTES = 4096;

function parseRole(raw: unknown): { ok: true; value: RoleTypography | undefined } | { ok: false } {
  if (raw == null) return { ok: true, value: undefined };
  if (!isObj(raw)) return { ok: false };
  const out: Record<string, unknown> = { ...raw };
  if (raw.scale != null) { if (!num(raw.scale)) return { ok: false }; out.scale = round(clamp(raw.scale as number, ROLE_SCALE.min, ROLE_SCALE.max)); }
  if (raw.weight != null) { if (!(WEIGHT_CHOICES as readonly unknown[]).includes(raw.weight)) return { ok: false }; }
  for (const k of ["scale", "weight"]) if (out[k] == null) delete out[k];
  return { ok: true, value: Object.keys(out).length ? (out as RoleTypography) : undefined };
}

/**
 * Validates and clamps `custom` for this document's template. Returns `undefined` for "no customization".
 * v > 1: returned untouched (preserved, not applied). Unknown keys are kept.
 */
export function parseCustom(raw: unknown, doc: Pick<LayoutDocument, "design" | "template">): { ok: true; value: LayoutCustom | undefined } | { ok: false; error: string } {
  if (raw == null) return { ok: true, value: undefined };
  if (!isObj(raw)) return { ok: false, error: CUSTOM_ERROR };
  let size = 0;
  try { size = JSON.stringify(raw).length; } catch { return { ok: false, error: CUSTOM_ERROR }; }
  if (size > MAX_CUSTOM_BYTES) return { ok: false, error: CUSTOM_ERROR };
  if (!num(raw.v) || !Number.isInteger(raw.v) || (raw.v as number) < 1) return { ok: false, error: CUSTOM_ERROR };
  if ((raw.v as number) > CUSTOM_VERSION) return { ok: true, value: raw as LayoutCustom };
  const out: Record<string, unknown> = { ...raw, v: 1 };
  const spec = customizationSpec(doc);
  if (raw.mediaSize != null) {
    if (!num(raw.mediaSize)) return { ok: false, error: CUSTOM_ERROR };
    if (spec.media) out.mediaSize = round(clamp(raw.mediaSize as number, spec.media.min, spec.media.max));
    else delete out.mediaSize; // no resizable media on this template (template switch drops it)
  } else delete out.mediaSize;
  if (raw.textScale != null) {
    if (!num(raw.textScale)) return { ok: false, error: CUSTOM_ERROR };
    out.textScale = round(clamp(raw.textScale as number, TEXT_SCALE.min, TEXT_SCALE.max));
  } else delete out.textScale;
  if (raw.roles != null) {
    if (!isObj(raw.roles)) return { ok: false, error: CUSTOM_ERROR };
    const roles: Record<string, unknown> = { ...raw.roles };
    for (const key of ROLE_KEYS) {
      const r = parseRole(raw.roles[key]);
      if (!r.ok) return { ok: false, error: CUSTOM_ERROR };
      if (r.value) roles[key] = r.value; else delete roles[key];
    }
    if (Object.keys(roles).length) out.roles = roles; else delete out.roles;
  } else delete out.roles;
  if (raw.spacing != null) {
    if (!isObj(raw.spacing)) return { ok: false, error: CUSTOM_ERROR };
    const spacing: Record<string, unknown> = { ...raw.spacing };
    for (const key of ["itemGap", "sectionGap"]) {
      const v = raw.spacing[key];
      if (v == null) { delete spacing[key]; continue; }
      if (!num(v)) return { ok: false, error: CUSTOM_ERROR };
      spacing[key] = round(clamp(v as number, SPACING_SCALE.min, SPACING_SCALE.max));
    }
    if (Object.keys(spacing).length) out.spacing = spacing; else delete out.spacing;
  } else delete out.spacing;
  if (raw.imageFocus != null) {
    const f = raw.imageFocus;
    if (!isObj(f) || !num(f.x) || !num(f.y)) return { ok: false, error: CUSTOM_ERROR };
    out.imageFocus = { ...f, x: round(clamp(f.x as number, 0, 100), 2), y: round(clamp(f.y as number, 0, 100), 2) };
  } else delete out.imageFocus;
  if (raw.imageZoom != null) {
    if (!num(raw.imageZoom)) return { ok: false, error: CUSTOM_ERROR };
    out.imageZoom = round(clamp(raw.imageZoom as number, IMAGE_ZOOM.min, IMAGE_ZOOM.max), 2);
  } else delete out.imageZoom;
  // `{ v: 1 }` alone is "no customization" (the same as a full reset), so the board stays on the template path.
  if (Object.keys(out).every((k) => k === "v")) return { ok: true, value: undefined };
  return { ok: true, value: out as LayoutCustom };
}

/** Validates a section's headingOverride (same rules as a role). */
export function parseHeadingOverride(raw: unknown): { ok: true; value: RoleTypography | undefined } | { ok: false; error: string } {
  const r = parseRole(raw);
  return r.ok ? r : { ok: false, error: CUSTOM_ERROR };
}

/* ---------------- what the renderers apply ---------------- */

/** Applied customization, or null when the board draws exactly as the template (no custom, or v > 1). */
export type ActiveCustom = {
  custom: LayoutCustom;
  /** Final multiplier per role (textScale × role scale). */
  scale: Record<RoleKey, number>;
  weight: Partial<Record<RoleKey, FontWeightChoice>>;
  itemGap: number;
  sectionGap: number;
  mediaSize: number | null;
  focus: { x: number; y: number } | null;
  /** t421u: featured photo zoom (null = not set; the photo draws exactly as before). */
  zoom: number | null;
};

export function hasHeadingOverrides(doc: Pick<LayoutDocument, "sections">): boolean {
  return doc.sections.some((s) => Boolean(s.headingOverride));
}

export function activeCustom(doc: Pick<LayoutDocument, "custom" | "sections">): ActiveCustom | null {
  const custom = doc.custom;
  const applies = custom && custom.v === CUSTOM_VERSION;
  if (custom && !applies) return null; // newer schema: preserved but not applied (overrides included)
  if (!applies && !hasHeadingOverrides(doc)) return null;
  const c: LayoutCustom = custom ?? { v: 1 };
  const t = c.textScale ?? 1;
  const scale = Object.fromEntries(ROLE_KEYS.map((r) => [r, t * (c.roles?.[r]?.scale ?? 1)])) as Record<RoleKey, number>;
  const weight: Partial<Record<RoleKey, FontWeightChoice>> = {};
  for (const r of ROLE_KEYS) { const w = c.roles?.[r]?.weight; if (w) weight[r] = w; }
  return {
    custom: c, scale, weight,
    itemGap: c.spacing?.itemGap ?? 1, sectionGap: c.spacing?.sectionGap ?? 1,
    mediaSize: typeof c.mediaSize === "number" ? c.mediaSize : null,
    focus: c.imageFocus ? { x: c.imageFocus.x, y: c.imageFocus.y } : null,
    zoom: typeof c.imageZoom === "number" ? clamp(c.imageZoom, IMAGE_ZOOM.min, IMAGE_ZOOM.max) : null,
  };
}

/** Heading multiplier and weight for one section (its override wins over the global section heading role). */
export function sectionHeadingStyle(active: ActiveCustom, section: LayoutSection): { scale: number; weight: FontWeightChoice | undefined } {
  const o = section.headingOverride;
  const t = active.custom.textScale ?? 1;
  if (!o) return { scale: active.scale.sectionHeading, weight: active.weight.sectionHeading };
  return { scale: t * (o.scale ?? active.custom.roles?.sectionHeading?.scale ?? 1), weight: o.weight ?? active.weight.sectionHeading };
}

/** Effective media fraction for a document (custom or template default), or null when the template has no slider. */
export function effectiveMediaSize(doc: LayoutDocument): number | null {
  const spec = customizationSpec(doc);
  if (!spec.media) return null;
  const active = activeCustom(doc);
  if (active?.mediaSize != null) return clamp(active.mediaSize, spec.media.min, spec.media.max);
  if (spec.engine === "layout") return round(LAYOUT_MEDIA[doc.template]!.fromSplit(doc.split));
  return spec.media.def;
}

/**
 * Keeps a document's customization valid for its (possibly new) template: clamps or drops mediaSize and, on original
 * layouts, writes the matching `split` so older apps draw the same frame. Used after a template switch and on parse.
 */
export function normalizeCustomFor(doc: LayoutDocument): LayoutDocument {
  if (!doc.custom || doc.custom.v !== CUSTOM_VERSION) return doc;
  const parsed = parseCustom(doc.custom, doc);
  if (!parsed.ok) return doc;
  const next: LayoutDocument = { ...doc };
  if (parsed.value) next.custom = parsed.value; else delete next.custom;
  const lm = LAYOUT_MEDIA[doc.template];
  const isDesign = Boolean(doc.design && isDesignId(doc.design));
  if (!isDesign && lm && typeof next.custom?.mediaSize === "number") next.split = round(lm.toSplit(next.custom.mediaSize));
  return next;
}

/* ---------------- reset (key deletion) ---------------- */

/**
 * Reset paths, applied by deleting keys:
 *   "custom" · "custom.mediaSize" · "custom.textScale" · "custom.roles" · "custom.roles.<role>" · "custom.spacing" ·
 *   "custom.spacing.itemGap" · "custom.spacing.sectionGap" · "custom.imageFocus" · "custom.imageZoom" · "sections.<i>.headingOverride" ·
 *   "sections.*.headingOverride".
 * Empty parents are removed too, and `custom` disappears when only `v` is left.
 */
export function applyCustomReset(doc: LayoutDocument, paths: string[]): LayoutDocument {
  const next: LayoutDocument = { ...doc, sections: doc.sections.map((s) => ({ ...s })) };
  let custom: Record<string, unknown> | undefined = doc.custom ? JSON.parse(JSON.stringify(doc.custom)) : undefined;
  for (const path of paths) {
    const parts = path.split(".");
    if (parts[0] === "sections") {
      const idx = parts[1];
      next.sections.forEach((s, i) => { if (idx === "*" || String(i) === idx) delete s.headingOverride; });
      continue;
    }
    if (parts[0] !== "custom" || !custom) continue;
    if (parts.length === 1) { custom = undefined; continue; }
    let node: Record<string, unknown> = custom;
    for (let i = 1; i < parts.length - 1; i++) {
      const child = node[parts[i]];
      if (!isObj(child)) { node = {}; break; }
      node = child;
    }
    delete node[parts[parts.length - 1]];
    if (isObj(custom.roles)) for (const [k, v] of Object.entries(custom.roles)) if (isObj(v) && !Object.keys(v).length) delete (custom.roles as Record<string, unknown>)[k];
    for (const parent of ["roles", "spacing"]) if (isObj(custom[parent]) && !Object.keys(custom[parent] as object).length) delete custom[parent];
  }
  if (custom && Object.keys(custom).filter((k) => k !== "v").length) next.custom = custom as LayoutCustom;
  else delete next.custom;
  // Original layouts keep the media size in `split` too; resetting it returns the split to the template default.
  const lm = LAYOUT_MEDIA[doc.template];
  const isDesign = Boolean(doc.design && isDesignId(doc.design));
  if (lm && !isDesign && typeof doc.custom?.mediaSize === "number" && typeof next.custom?.mediaSize !== "number") next.split = round(lm.toSplit(lm.def));
  return next;
}

/** Every customization key path set on this document (candidates for a targeted reset). */
export function customPaths(doc: LayoutDocument): string[] {
  const out: string[] = [];
  const c = doc.custom;
  if (c && c.v === CUSTOM_VERSION) {
    for (const r of ROLE_KEYS) if (c.roles?.[r]) out.push(`custom.roles.${r}`);
    doc.sections.forEach((s, i) => { if (s.headingOverride) out.push(`sections.${i}.headingOverride`); });
    if (c.spacing?.itemGap != null) out.push("custom.spacing.itemGap");
    if (c.spacing?.sectionGap != null) out.push("custom.spacing.sectionGap");
    if (c.textScale != null) out.push("custom.textScale");
    if (c.mediaSize != null) out.push("custom.mediaSize");
  } else if (!c) {
    doc.sections.forEach((s, i) => { if (s.headingOverride) out.push(`sections.${i}.headingOverride`); });
  }
  return out;
}

/** The document with every customization removed (what the template draws by default). */
export function withoutCustom(doc: LayoutDocument): LayoutDocument {
  return applyCustomReset(doc, ["custom", "sections.*.headingOverride"]);
}

/* ---------------- preview regions and overflow ---------------- */

type Box = { x: number; y: number; w: number; h: number };

/** Areas where shortened ("…") text is counted, to tell new overflow from what the template already did. */
export type ClipArea = "businessName" | "menu" | "featuredText" | "footer";
export const CLIP_AREAS: ClipArea[] = ["businessName", "menu", "featuredText", "footer"];
export function emptyClips(): Record<ClipArea, number> { return { businessName: 0, menu: 0, featuredText: 0, footer: 0 }; }

/** What tapping/clicking a region edits. `path` is the custom key it maps to (1:1), or the section's override. */
export type RegionTarget =
  | { kind: "featuredMedia"; path: "custom.mediaSize" }
  | { kind: "businessName"; path: "custom.roles.businessName" }
  | { kind: "featuredText"; path: "custom.roles.featuredText" }
  | { kind: "sectionHeading"; sectionIndex: number; path: string }
  | { kind: "menuItem"; sectionIndex: number; itemIndex: number; path: "custom.roles.itemName" };

/**
 * A selectable element of the board in canvas px (1920×1080). Ids are stable across renders: "businessName",
 * "featuredMedia", "featuredText", "section:<sectionId>", "item:<itemId>", where a section/item id is its own `id`
 * when the client set one, else its position ("s<section>" / "s<section>-i<item>").
 */
export type BoardRegion = { id: string; target: RegionTarget; box: Box };

export function sectionRegionId(section: Pick<LayoutSection, "id">, index: number) { return `section:${section.id ?? `s${index}`}`; }
export function itemRegionId(item: { id?: string }, sectionIndex: number, itemIndex: number) { return `item:${item.id ?? `s${sectionIndex}-i${itemIndex}`}`; }
export function sectionRegion(section: LayoutSection, index: number, box: Box): BoardRegion {
  return { id: sectionRegionId(section, index), target: { kind: "sectionHeading", sectionIndex: index, path: `sections.${index}.headingOverride` }, box: roundBox(box) };
}
export function itemRegion(item: { id?: string }, sectionIndex: number, itemIndex: number, box: Box): BoardRegion {
  return { id: itemRegionId(item, sectionIndex, itemIndex), target: { kind: "menuItem", sectionIndex, itemIndex, path: "custom.roles.itemName" }, box: roundBox(box) };
}
export function fixedRegion(kind: "featuredMedia" | "businessName" | "featuredText", box: Box): BoardRegion {
  const path = kind === "featuredMedia" ? "custom.mediaSize" : kind === "businessName" ? "custom.roles.businessName" : "custom.roles.featuredText";
  return { id: kind, target: { kind, path } as RegionTarget, box: roundBox(box) };
}
/** Canvas regions are clamped to: 1920×1080, or 1080×1920 while a vertical board is being drawn. */
let regionCanvas = { width: 1920, height: 1080 };
/** Sets the canvas regions are clamped to; returns the previous one so the caller can restore it. */
export function setRegionCanvas(canvas: { width: number; height: number }) {
  const previous = regionCanvas;
  regionCanvas = { width: canvas.width, height: canvas.height };
  return previous;
}
export function roundBox(b: Box): Box {
  const x = Math.max(0, Math.round(b.x)); const y = Math.max(0, Math.round(b.y));
  return { x, y, w: Math.max(1, Math.min(regionCanvas.width - x, Math.round(b.w))), h: Math.max(1, Math.min(regionCanvas.height - y, Math.round(b.h))) };
}

/** Image box for a photo with a focal point: explicit placement when the photo's size is known, else the nearest anchor. */
export function focusPlacement(box: Box, focus: { x: number; y: number }, size?: { w: number; h: number } | null):
  { kind: "exact"; x: number; y: number; w: number; h: number } | { kind: "anchor"; aspect: string } {
  if (size && size.w > 0 && size.h > 0) {
    const s = Math.max(box.w / size.w, box.h / size.h);
    const w = size.w * s; const h = size.h * s;
    return { kind: "exact", x: box.x + (box.w - w) * (focus.x / 100), y: box.y + (box.h - h) * (focus.y / 100), w, h };
  }
  const ax = focus.x < 100 / 3 ? "xMin" : focus.x > 200 / 3 ? "xMax" : "xMid";
  const ay = focus.y < 100 / 3 ? "YMin" : focus.y > 200 / 3 ? "YMax" : "YMid";
  return { kind: "anchor", aspect: `${ax}${ay} slice` };
}

/* ---------------- t421u featured photo framing ---------------- */

/** Focal point implied by the legacy anchor, so turning on zoom or focus never makes the photo jump. */
export function anchorFocus(anchor: string | undefined): { x: number; y: number } {
  return { x: anchor === "left" ? 0 : anchor === "right" ? 100 : 50, y: anchor === "top" ? 0 : anchor === "bottom" ? 100 : 50 };
}

/** True when the board uses the t421u framing path (zoom set, or a focal point on a Fit photo). */
export function usesFraming(doc: Pick<LayoutDocument, "imageFit">, active: ActiveCustom | null): boolean {
  if (!active) return false;
  return active.zoom != null || (doc.imageFit === "contain" && active.focus != null);
}

/**
 * Where the featured photo is drawn inside its box: base scale (Fill = cover, Fit = contain) × zoom, then the focal
 * point slides it inside the box (Fill: which part is cropped; Fit: where the spare space goes). Canvas px.
 * Without the photo's natural size, the same box is approximated (enlarged box + SVG alignment).
 */
export type FramePlacement =
  | { kind: "exact"; x: number; y: number; w: number; h: number; letterbox: boolean }
  | { kind: "approx"; x: number; y: number; w: number; h: number; aspect: string; letterbox: boolean };
export function framePlacement(box: Box, fit: "cover" | "contain", zoom: number, focus: { x: number; y: number }, size?: { w: number; h: number } | null): FramePlacement {
  const z = clamp(zoom, IMAGE_ZOOM.min, IMAGE_ZOOM.max);
  const fx = clamp(focus.x, 0, 100) / 100; const fy = clamp(focus.y, 0, 100) / 100;
  if (size && size.w > 0 && size.h > 0) {
    const base = fit === "contain" ? Math.min(box.w / size.w, box.h / size.h) : Math.max(box.w / size.w, box.h / size.h);
    const w = size.w * base * z; const h = size.h * base * z;
    return { kind: "exact", x: box.x + (box.w - w) * fx, y: box.y + (box.h - h) * fy, w, h, letterbox: w < box.w - 0.5 || h < box.h - 0.5 };
  }
  const w = box.w * z; const h = box.h * z;
  const ax = fx < 1 / 3 ? "xMin" : fx > 2 / 3 ? "xMax" : "xMid";
  const ay = fy < 1 / 3 ? "YMin" : fy > 2 / 3 ? "YMax" : "YMid";
  return { kind: "approx", x: box.x + (box.w - w) * fx, y: box.y + (box.h - h) * fy, w, h, aspect: `${ax}${ay} ${fit === "contain" ? "meet" : "slice"}`, letterbox: fit === "contain" };
}

/** "Reset photo": the template's own framing. Leaves the featured area size (custom.mediaSize) alone. */
export function resetFeaturedPhoto(doc: LayoutDocument): LayoutDocument {
  const next = applyCustomReset(doc, ["custom.imageZoom", "custom.imageFocus"]);
  return { ...next, imageFit: "cover", imageAnchor: "center" };
}
