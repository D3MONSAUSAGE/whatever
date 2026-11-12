/** Unified Menu Board Creator: classify boards, pick layouts, choose publish paths, and map old studio URLs. Client-only. No schema change. */

import { parseMenuContent, isMenuTemplate, type MenuContent, type MenuTemplate } from "@/lib/menu-templates";
import { parseLayout, type LayoutDocument, type LayoutTemplate } from "@/lib/layout-studio";

export type BoardKind = "classic" | "layout";

export type LayoutOptionId =
  | "full-screen"
  | "two-column"
  | "menu-promo"
  | "two-menu-promo"
  | "triple-column"
  | "split-50"
  | "menu-banner"
  | "signature";

export type LayoutOption = {
  id: LayoutOptionId;
  name: string;
  blurb: string;
  kind: BoardKind;
  /** Layout Studio template id, when kind is "layout". */
  layoutTemplate?: LayoutTemplate;
  featured: boolean;
};

/** The four named layouts plus every other existing Layout Studio template. */
export const LAYOUT_OPTIONS: LayoutOption[] = [
  { id: "full-screen", name: "Full-screen menu", blurb: "A full 16:9 menu. Sections, items, prices, and an optional photo. Uses your Brand Kit.", kind: "classic", featured: true },
  { id: "two-column", name: "Two-column menu", blurb: "Two independently editable menu columns on one 16:9 board.", kind: "layout", layoutTemplate: "two-column", featured: true },
  { id: "menu-promo", name: "Menu + promo image/video", blurb: "A menu beside a promotional photo or video.", kind: "layout", layoutTemplate: "menu-promo-67", featured: true },
  { id: "two-menu-promo", name: "Two menus + promo", blurb: "Two menu columns and a promo photo or video, about 35% / 35% / 30%.", kind: "layout", layoutTemplate: "two-menu-promo", featured: true },
  { id: "triple-column", name: "Three columns", blurb: "Three menu-text columns. A photo can sit behind the board.", kind: "layout", layoutTemplate: "triple-column", featured: false },
  { id: "split-50", name: "Split showcase", blurb: "Menu on the left, a photo or video on the right.", kind: "layout", layoutTemplate: "split-50", featured: false },
  { id: "menu-banner", name: "Menu and banner", blurb: "A full-width menu with a banner along the bottom.", kind: "layout", layoutTemplate: "menu-banner", featured: false },
  { id: "signature", name: "Signature", blurb: "A menu card over a full-board photo, with a video strip beside it.", kind: "layout", layoutTemplate: "signature", featured: false },
];

export function layoutOptionById(id: string | null | undefined): LayoutOption | null {
  return LAYOUT_OPTIONS.find((item) => item.id === id) ?? null;
}

export function layoutOptionForTemplate(template: LayoutTemplate): LayoutOption {
  return LAYOUT_OPTIONS.find((item) => item.layoutTemplate === template) ?? LAYOUT_OPTIONS[2];
}

export type ClassifiedClassic = { kind: "classic"; template: MenuTemplate; content: MenuContent };
export type ClassifiedLayout = { kind: "layout"; document: LayoutDocument };
export type ClassifiedUnknown = { kind: "unknown" };
export type ClassifiedBoard = ClassifiedClassic | ClassifiedLayout | ClassifiedUnknown;

/**
 * Tell classic menu JSON apart from a Layout Studio document.
 * Layout documents have layoutVersion 1 and a layout id. Classic menus do not.
 * A layout document must never be treated as MenuContent.
 */
function isMenuTemplateId(value: unknown): value is MenuTemplate {
  return isMenuTemplate(value);
}

/**
 * A stored classic row can fail the strict MenuContent photo-UUID check (preview fixtures,
 * or a photo that was later removed). If it is not a layout document, it still opens as classic
 * so existing customer menus stay editable.
 */
export function looksLikeClassicMenu(content: unknown): boolean {
  if (!content || typeof content !== "object" || Array.isArray(content)) return false;
  const raw = content as Record<string, unknown>;
  if (raw.layoutVersion === 1) return false;
  return Array.isArray(raw.sections);
}

function classicFromUnknown(template: unknown, content: unknown): ClassifiedClassic | null {
  const menu = parseMenuContent(content);
  const theme: MenuTemplate = isMenuTemplateId(template) ? template : "fresh";
  if (menu.ok) return { kind: "classic", template: theme, content: menu.value };
  if (!looksLikeClassicMenu(content)) return null;
  const raw = content as Record<string, unknown>;
  const sections = Array.isArray(raw.sections) ? raw.sections : [];
  return {
    kind: "classic",
    template: theme,
    content: {
      title: typeof raw.title === "string" ? raw.title : "",
      subtitle: typeof raw.subtitle === "string" ? raw.subtitle : "",
      footer: typeof raw.footer === "string" ? raw.footer : "",
      sections: sections as MenuContent["sections"],
      photoMediaId: typeof raw.photoMediaId === "string" ? raw.photoMediaId : null,
      useBrand: raw.useBrand !== false,
    },
  };
}

export function classifyBoardContent(template: unknown, content: unknown): ClassifiedBoard {
  const layout = parseLayout(content);
  if (layout.ok) return { kind: "layout", document: layout.value };
  return classicFromUnknown(template, content) ?? { kind: "unknown" };
}

export type PublishPath =
  | { kind: "classic"; method: "POST" | "PATCH"; url: string; mode: "save" }
  | { kind: "layout"; method: "POST"; url: "/api/layout-studio"; mode: "draft" | "publish" };

/** Existing save/publish path for each board type. No third engine. */
export function publishPathFor(kind: BoardKind, boardId: string | null, mode: "draft" | "publish" | "save" = "save"): PublishPath {
  if (kind === "classic") {
    return boardId
      ? { kind: "classic", method: "PATCH", url: `/api/menus/${boardId}`, mode: "save" }
      : { kind: "classic", method: "POST", url: "/api/menus", mode: "save" };
  }
  return { kind: "layout", method: "POST", url: "/api/layout-studio", mode: mode === "draft" ? "draft" : "publish" };
}

/** A classic board must not be written through the layout API, and vice versa. */
export function canSaveThrough(board: ClassifiedBoard, path: PublishPath): boolean {
  if (board.kind === "unknown") return false;
  return board.kind === path.kind;
}

export type UnifiedSearch = {
  boardId: string | null;
  screenId: string | null;
  layout: LayoutOptionId | null;
  isNew: boolean;
};

export function parseUnifiedSearch(search: URLSearchParams | Record<string, string | string[] | undefined | null>): UnifiedSearch {
  const get = (key: string): string | null => {
    if (search instanceof URLSearchParams) return search.get(key);
    const raw = search[key];
    if (Array.isArray(raw)) return raw[0] ?? null;
    return raw ?? null;
  };
  const layoutRaw = get("layout");
  const option = layoutRaw ? layoutOptionById(layoutRaw) : null;
  return {
    boardId: get("board") || get("menu") || get("menuId") || null,
    screenId: get("screen") || null,
    layout: option?.id ?? null,
    isNew: get("new") === "1" || get("new") === "true",
  };
}

export function unifiedEditorPath(query: { board?: string | null; screen?: string | null; layout?: string | null; isNew?: boolean } = {}): string {
  const params = new URLSearchParams();
  if (query.board) params.set("board", query.board);
  if (query.screen) params.set("screen", query.screen);
  if (query.layout) params.set("layout", query.layout);
  if (query.isNew) params.set("new", "1");
  const qs = params.toString();
  return qs ? `/dashboard/media/menus?${qs}` : "/dashboard/media/menus";
}

/**
 * Permanent redirect map from the old Layout Studio signed-in route.
 * Query params are forwarded onto the equivalent unified editor URL.
 */
export function layoutStudioRedirect(search: URLSearchParams | Record<string, string | string[] | undefined | null>): string {
  const parsed = parseUnifiedSearch(search);
  return unifiedEditorPath({
    board: parsed.boardId,
    screen: parsed.screenId,
    layout: parsed.layout ?? undefined,
    isNew: parsed.isNew || (Boolean(parsed.screenId) && !parsed.boardId),
  });
}

export type ClassicRegion = "menu" | "photo" | "none";

export function classicEditorForRegion(region: string, hasPhoto: boolean): ClassicRegion {
  if (region === "photo" && hasPhoto) return "photo";
  if (region === "menu" || region === "photo") return region === "photo" ? "photo" : "menu";
  if (!region) return "none";
  return "menu";
}

export function classicPreviewHits(hasPhoto: boolean): { id: "menu" | "photo"; label: string; box: { x: number; y: number; w: number; h: number } }[] {
  // 1920×1080 board. A classic photo occupies the right ~38%, matching menu-render.
  if (!hasPhoto) return [{ id: "menu", label: "Edit menu", box: { x: 0, y: 0, w: 1920, h: 1080 } }];
  const photoW = Math.round(1920 * 0.38);
  return [
    { id: "menu", label: "Edit menu", box: { x: 0, y: 0, w: 1920 - photoW, h: 1080 } },
    { id: "photo", label: "Edit photo", box: { x: 1920 - photoW, y: 0, w: photoW, h: 1080 } },
  ];
}

export const CONTENT_TAB_MENUS_LABEL = "Menu boards";

/** True when the current editor snapshot differs from the last clean (loaded or saved) snapshot. */
export function hasUnsavedEdits(current: unknown, baseline: unknown): boolean {
  return JSON.stringify(current) !== JSON.stringify(baseline);
}

export const DISCARD_UNSAVED_MESSAGE = "You have unsaved changes. If you leave this board, those edits will be lost.";

/**
 * A simple confirm before dropping unsaved edits. Returns true when it is safe to proceed.
 * Does not prompt when there are no unsaved changes.
 */
export function confirmDiscardUnsaved(
  unsaved: boolean,
  ask: () => boolean = () => (typeof window !== "undefined" ? window.confirm(DISCARD_UNSAVED_MESSAGE) : false),
): boolean {
  if (!unsaved) return true;
  return ask();
}
