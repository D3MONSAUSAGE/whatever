import { boardCanvas, orientationOf } from "@/lib/board-orientation";
import { mediaVideoBox, boardSvgWithReport, type LayoutDocument, type ZoneBox } from "@/lib/layout-studio";
import { designById, isDesignId, isPhotoDesign, type MenuDesign } from "@/lib/menu-designs";
import { designSvgWithReport, itemPhotosShown } from "@/lib/menu-design-svg";
import { layoutReport, mergeExtraSections } from "@/lib/menu-designer";
import { boardFont } from "@/lib/board-fonts";
import {
  activeCustom, applyCustomReset, customizationSpec, customPaths, sectionRegionId, snapWeight, withoutCustom, ROLE_KEYS,
  type BoardRegion, type FontWeightChoice, type ItemPhotoSize, type LayoutCustom, type RoleKey, type RoleTypography,
} from "@/lib/board-custom";

/**
 * The roomier template the editor offers when a template drops items: one that still shows item photos when this one
 * does (three-column thumbnails hold all 24 items). Shared by the web editor and the preview API.
 */
export function roomierDesignId(doc: LayoutDocument, design: MenuDesign): string {
  const photoTemplate = isPhotoDesign(design) || itemPhotosShown(doc, design);
  return photoTemplate ? "taqueria-specials" : "diner-classics";
}

/**
 * Why a customized board does not fit, counting only what the customization added (an uncustomized board with the
 * same content does not have it):
 *  - items_dropped: items left off the screen.
 *  - text_clipped: a business name, section heading, item name or description shortened with "…".
 *  - feature_crowded: the featured headline/detail shortened in its panel.
 *  - text_too_small / sections_hidden: reserved (text is never shrunk below the readable floors; hidden sections come
 *    from the layout's column count, not from customization).
 */
export type OverflowReason = "items_dropped" | "sections_hidden" | "text_clipped" | "text_too_small" | "feature_crowded";

/** One-tap "Return to safe size": delete exactly these keys (lib/board-custom.ts applyCustomReset paths). */
export type SafeAction = { kind: "reset_custom"; paths: string[] };

export type HeadingOverrideEcho = { sectionIndex: number; sectionId: string; scale?: number; weight?: FontWeightChoice; effectiveWeight?: number };
export type CustomEcho = {
  /** False when there is nothing to apply, or `custom.v` is newer than this server (kept, not applied). */
  applied: boolean;
  /** The normalized, clamped `custom` as stored (null when absent). */
  custom: LayoutCustom | null;
  headingOverrides: HeadingOverrideEcho[];
  /** Weight actually drawn per role that has a weight choice, after snapping to the font's shipped faces. */
  effectiveWeights: Partial<Record<RoleKey, number>>;
};

export type BoardFit = {
  /** False when publishing would be refused: a template board with items left off, or a customization that overflows. */
  canPublish: boolean;
  /** Template boards: items that don't fit and are not drawn. */
  droppedItems: number;
  /** Original layouts: sections past the layout's columns, and their items (not drawn). */
  hiddenSections: number;
  hiddenItems: number;
  /** Original layouts: item names shortened with "…". */
  clippedNames: string[];
  /** The editor's own fixes: a roomier template id to switch to, and whether extra sections can merge into the last column. */
  suggestions: { roomierTemplate: string | null; canMergeSections: boolean };
  /* ---- additive (Guided Customization) ---- */
  /** All boxes below are in canvas px of this size. */
  canvasWidth: number;
  canvasHeight: number;
  /** Where the video plays (the TV /player uses the same box); null when the board has no video area. */
  videoBox: ZoneBox | null;
  /** Selectable parts of the board for click/tap-to-select. */
  regions: BoardRegion[];
  /** Overflow added by the customization (empty when none, and always empty for uncustomized boards). */
  overflowReasons: OverflowReason[];
  /** The targeted reset that removes that overflow, or null. */
  safeAction: SafeAction | null;
  custom: CustomEcho;
  /**
   * Additive: true when item photos were omitted at render time because even compact thumbnails would drop
   * items that fit as text-only. canPublish stays true in that case (the board draws as text). Existing
   * overflowReasons / safeAction / custom / regions / videoBox fields are unchanged.
   */
  photosSuppressed: boolean;
  /**
   * t421u (additive): item photo size asked for (absent on the board = "small") and the size actually drawn
   * (null = photos left off). Null when the board draws no item photos or is an original layout/classic board.
   */
  itemPhotos: { requested: ItemPhotoSize; effective: ItemPhotoSize | null } | null;
  /**
   * t421u (additive): how the featured photo is framed, for drag-to-position on clients that preview a server PNG.
   * `natural` is the photo's pixel size when the server loaded it (preview API), else null. Null when the board has no
   * featured photo area (list, cards, featured dishes).
   */
  photo: PhotoEcho | null;
};
export type PhotoEcho = { fit: "cover" | "contain"; zoom: number; focus: { x: number; y: number } | null; natural: { w: number; h: number } | null };

/** A tiny valid image href standing in for owner item photos, so the fit check reserves the same rows the PNG does. */
const PHOTO_STANDIN = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=";

/** Item photo size drawn on a template board (the same fitting as the PNG; owner photos stood in by a placeholder). */
export function itemPhotoEcho(doc: LayoutDocument): BoardFit["itemPhotos"] {
  if (!doc.design || !isDesignId(doc.design)) return null;
  const ids = doc.sections.flatMap((section) => section.items.map((item) => item.imageMediaId).filter((id): id is string => Boolean(id)));
  const itemImages = Object.fromEntries(ids.map((id) => [id, PHOTO_STANDIN]));
  return designSvgWithReport(doc, { itemImages }).report.itemPhotos ?? null;
}

export function photoEcho(doc: LayoutDocument, natural?: { w: number; h: number } | null): PhotoEcho | null {
  if (!customizationSpec(doc).imageFocus) return null;
  const active = activeCustom(doc);
  return { fit: doc.imageFit === "contain" ? "contain" : "cover", zoom: active?.zoom ?? 1, focus: active?.focus ?? null, natural: natural ?? null };
}

type Metrics = { dropped: number; clipped: number; feature: number };
function metrics(doc: LayoutDocument): Metrics {
  const { report } = boardSvgWithReport(doc);
  return { dropped: report.dropped, clipped: report.clips.businessName + report.clips.menu + report.clips.footer, feature: report.clips.featuredText };
}

/** Overflow the customization adds over the same board without it. Empty for boards without customization. */
export function customOverflow(doc: LayoutDocument, baseline?: Metrics): OverflowReason[] {
  if (!activeCustom(doc)) return [];
  const c = metrics(doc);
  const d = baseline ?? metrics(withoutCustom(doc));
  const out: OverflowReason[] = [];
  if (c.dropped > d.dropped) out.push("items_dropped");
  if (c.clipped > d.clipped) out.push("text_clipped");
  if (c.feature > d.feature) out.push("feature_crowded");
  return out;
}

/**
 * The smallest reset that removes the added overflow: one key when one key is enough (most specific first: a role,
 * a section's heading override, spacing, then overall text size, then the media size), else keys removed in that
 * order until it fits, else every customization. Unrelated choices (colours, template, other roles) are kept.
 */
export function safeResetPaths(doc: LayoutDocument): string[] | null {
  const baseline = metrics(withoutCustom(doc));
  if (!customOverflow(doc, baseline).length) return null;
  const paths = customPaths(doc);
  for (const path of paths) if (!customOverflow(applyCustomReset(doc, [path]), baseline).length) return [path];
  const taken: string[] = [];
  for (const path of paths) {
    taken.push(path);
    if (!customOverflow(applyCustomReset(doc, taken), baseline).length) return taken;
  }
  return ["custom", "sections.*.headingOverride"];
}

function families(doc: LayoutDocument) {
  const head = boardFont(doc.font).family;
  const body = boardFont(doc.bodyFont ?? doc.font).family;
  const design = doc.design && isDesignId(doc.design) ? designById(doc.design) : null;
  const section = design ? (design.look.sectionInHead ? head : body) : head;
  const of: Record<RoleKey, string> = { businessName: head, sectionHeading: section, itemName: body, description: body, price: body, featuredText: head };
  return of;
}

export function customEcho(doc: LayoutDocument): CustomEcho {
  const active = activeCustom(doc);
  const fam = families(doc);
  const effectiveWeights: Partial<Record<RoleKey, number>> = {};
  if (active) for (const role of ROLE_KEYS) { const w = active.weight[role]; if (w) effectiveWeights[role] = snapWeight(fam[role], w); }
  const headingOverrides: HeadingOverrideEcho[] = [];
  doc.sections.forEach((section, i) => {
    const o: RoleTypography | undefined = section.headingOverride;
    if (!o) return;
    headingOverrides.push({ sectionIndex: i, sectionId: sectionRegionId(section, i).slice("section:".length), ...o, ...(o.weight && active ? { effectiveWeight: snapWeight(fam.sectionHeading, o.weight) } : {}) });
  });
  return { applied: Boolean(active), custom: doc.custom ?? null, headingOverrides, effectiveWeights };
}

/** The same checks publish uses (lib/layout-publish.ts). */
export function boardFit(doc: LayoutDocument, opts?: { natural?: { w: number; h: number } | null }): BoardFit {
  const design = doc.design && isDesignId(doc.design) ? designById(doc.design) : null;
  const { report } = boardSvgWithReport(doc);
  const overflowReasons = customOverflow(doc);
  const paths = overflowReasons.length ? safeResetPaths(doc) : null;
  const extra = {
    // Vertical boards (t413u) are 1080×1920; every other board keeps 1920×1080.
    canvasWidth: boardCanvas(orientationOf(doc)).width, canvasHeight: boardCanvas(orientationOf(doc)).height,
    videoBox: mediaVideoBox(doc), regions: report.regions,
    overflowReasons, safeAction: paths ? { kind: "reset_custom" as const, paths } : null,
    custom: customEcho(doc),
    photosSuppressed: Boolean(report.photosSuppressed),
    itemPhotos: itemPhotoEcho(doc),
    photo: photoEcho(doc, opts?.natural),
  };
  if (design) {
    const dropped = report.dropped;
    const roomier = roomierDesignId(doc, design);
    const offerRoomier = (dropped > 0 || extra.photosSuppressed) && design.id !== roomier;
    return {
      canPublish: dropped === 0 && overflowReasons.length === 0, droppedItems: dropped, hiddenSections: 0, hiddenItems: 0, clippedNames: [],
      suggestions: { roomierTemplate: offerRoomier ? roomier : null, canMergeSections: false },
      ...extra,
    };
  }
  const layout = layoutReport(doc);
  return {
    canPublish: overflowReasons.length === 0, droppedItems: report.dropped, hiddenSections: layout.hiddenSections, hiddenItems: layout.hiddenItems, clippedNames: layout.clipped,
    suggestions: { roomierTemplate: null, canMergeSections: layout.hiddenSections > 0 && mergeExtraSections(doc) !== null },
    ...extra,
  };
}

/** Publish refusal for a customized board whose customization overflows (null = allowed). */
export function customPublishError(doc: LayoutDocument): string | null {
  const reasons = customOverflow(doc);
  if (!reasons.length) return null;
  return "Your text or photo size changes don't fit on the screen. Use Return to safe size, then publish.";
}
