import { mediaVideoBox, boardSvgWithReport, BOARD_W, BOARD_H, type LayoutDocument, type ZoneBox } from "@/lib/layout-studio";
import { designById, isDesignId, isPhotoDesign, type MenuDesign } from "@/lib/menu-designs";
import { itemPhotosShown } from "@/lib/menu-design-svg";
import { layoutReport, mergeExtraSections } from "@/lib/menu-designer";
import { boardFont } from "@/lib/board-fonts";
import {
  activeCustom, applyCustomReset, customPaths, sectionRegionId, snapWeight, withoutCustom, ROLE_KEYS,
  type BoardRegion, type FontWeightChoice, type LayoutCustom, type RoleKey, type RoleTypography,
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
};

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
export function boardFit(doc: LayoutDocument): BoardFit {
  const design = doc.design && isDesignId(doc.design) ? designById(doc.design) : null;
  const { report } = boardSvgWithReport(doc);
  const overflowReasons = customOverflow(doc);
  const paths = overflowReasons.length ? safeResetPaths(doc) : null;
  const extra = {
    canvasWidth: BOARD_W, canvasHeight: BOARD_H,
    videoBox: mediaVideoBox(doc), regions: report.regions,
    overflowReasons, safeAction: paths ? { kind: "reset_custom" as const, paths } : null,
    custom: customEcho(doc),
  };
  if (design) {
    const dropped = report.dropped;
    const roomier = roomierDesignId(doc, design);
    return {
      canPublish: dropped === 0 && overflowReasons.length === 0, droppedItems: dropped, hiddenSections: 0, hiddenItems: 0, clippedNames: [],
      suggestions: { roomierTemplate: dropped > 0 && design.id !== roomier ? roomier : null, canMergeSections: false },
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
