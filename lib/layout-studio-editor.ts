/** Zone selection and preview hit-targets for Layout Studio. Pure helpers, no storage. */

import { zoneCapabilities, type LayoutFrame, type LayoutTemplate, type ZoneBox } from "@/lib/layout-studio";

export type EditorPanel = "menu" | "media" | "background" | "none";

/** Map a selected preview area to the editor panel shown beneath the preview. */
export function editorPanelForZone(zone: string): EditorPanel {
  if (!zone) return "none";
  if (zone === "menu" || zone.startsWith("column-")) return "menu";
  if (zone === "feature" || zone === "photo") return "media";
  if (zone === "background") return "background";
  return "none";
}

/**
 * Switching the selected area must not reset the draft. Unsaved edits stay on the document
 * until Save draft, Publish, or an explicit template change.
 */
export function keepDraftOnZoneChange<T>(draft: T, _fromZone: string, _toZone: string): T {
  return draft;
}

export function previewHits(template: LayoutTemplate, frame: LayoutFrame): { id: string; label: string; box: ZoneBox }[] {
  if (template === "two-menu-promo") {
    return [
      { id: "column-0", label: "Edit menu column 1", box: frame.columns[0] },
      { id: "column-1", label: "Edit menu column 2", box: frame.columns[1] },
      { id: "feature", label: "Edit promotion", box: frame.video ?? frame.feature },
    ];
  }
  if (template === "triple-column") {
    const columns = frame.columns.map((box, index) => ({ id: `column-${index}`, label: `Edit column ${index + 1}`, box }));
    return [...columns, { id: "photo", label: "Edit board photo", box: { x: 0, y: 980, w: 420, h: 100 } }];
  }
  const hits: { id: string; label: string; box: ZoneBox }[] = [];
  if (template === "signature") {
    hits.push({ id: "background", label: "Edit background", box: frame.feature });
    if (frame.video) hits.push({ id: "feature", label: "Edit video", box: frame.video });
    hits.push({ id: "menu", label: "Edit menu", box: { x: 48, y: 48, w: Math.max(80, frame.menu.w - 96), h: 1080 - 96 } });
    return hits;
  }
  hits.push({ id: "menu", label: "Edit menu", box: frame.menu });
  if (frame.video) {
    hits.push({
      id: "feature",
      label: template === "menu-banner" ? "Edit banner" : template === "split-50" ? "Edit right side" : "Edit promotion",
      box: frame.video,
    });
  }
  return hits;
}

export function zoneAriaLabel(zoneId: string, template: LayoutTemplate): string {
  return previewHits(template, {
    template,
    split: 0,
    menu: { x: 0, y: 0, w: 1, h: 1 },
    feature: { x: 0, y: 0, w: 1, h: 1 },
    video: { x: 0, y: 0, w: 1, h: 1 },
    columns: [
      { x: 0, y: 0, w: 1, h: 1 },
      { x: 0, y: 0, w: 1, h: 1 },
      { x: 0, y: 0, w: 1, h: 1 },
    ],
  }).find((hit) => hit.id === zoneId)?.label ?? zoneCapabilities(template).find((item) => item.id === zoneId)?.label ?? "Edit area";
}
