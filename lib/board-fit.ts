import type { LayoutDocument } from "@/lib/layout-studio";
import { designById, isDesignId, isPhotoDesign, type MenuDesign } from "@/lib/menu-designs";
import { designSvgWithReport, itemPhotosShown } from "@/lib/menu-design-svg";
import { layoutReport, mergeExtraSections } from "@/lib/menu-designer";

/**
 * The roomier template the editor offers when a template drops items: one that still shows item photos when this one
 * does (three-column thumbnails hold all 24 items). Shared by the web editor and the preview API.
 */
export function roomierDesignId(doc: LayoutDocument, design: MenuDesign): string {
  const photoTemplate = isPhotoDesign(design) || itemPhotosShown(doc, design);
  return photoTemplate ? "taqueria-specials" : "diner-classics";
}

export type BoardFit = {
  /** False only for a professional template with items left off the screen; publishing would be refused. */
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
};

/** The same checks publish uses (lib/layout-publish.ts): a template board is refused when items are dropped. */
export function boardFit(doc: LayoutDocument): BoardFit {
  const design = doc.design && isDesignId(doc.design) ? designById(doc.design) : null;
  if (design) {
    const { dropped } = designSvgWithReport(doc).report;
    const roomier = roomierDesignId(doc, design);
    return {
      canPublish: dropped === 0, droppedItems: dropped, hiddenSections: 0, hiddenItems: 0, clippedNames: [],
      suggestions: { roomierTemplate: dropped > 0 && design.id !== roomier ? roomier : null, canMergeSections: false },
    };
  }
  const report = layoutReport(doc);
  return {
    canPublish: true, droppedItems: 0, hiddenSections: report.hiddenSections, hiddenItems: report.hiddenItems, clippedNames: report.clipped,
    suggestions: { roomierTemplate: null, canMergeSections: report.hiddenSections > 0 && mergeExtraSections(doc) !== null },
  };
}
