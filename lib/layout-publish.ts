import { customPublishError } from "@/lib/board-fit";
import { parseLayout, type LayoutDocument } from "@/lib/layout-studio";
import { isDesignId } from "@/lib/menu-designs";
import { itemPhotoIds } from "@/lib/menu-item-photos";
import { designSvgWithReport } from "@/lib/menu-design-svg";

export type LibraryFile = {
  id: string;
  accountId: string;
  mime: string;
  kind: "image" | "video" | "other";
};

/** What a save is allowed to change. Draft never reaches a screen. */
export function boardSaveEffect(mode: "draft" | "publish") {
  if (mode === "publish") return { writeContent: true, renderPng: true, swapMedia: true, bumpScreens: true };
  return { writeContent: true, renderPng: true, swapMedia: false, bumpScreens: false };
}

/** The menus.template column only allows the three existing colorways. The layout id stays in content. */
export function storedMenuTemplate(doc: LayoutDocument): "classic" | "fresh" | "bold" {
  return doc.palette;
}

export function libraryError(accountId: string, file: LibraryFile | null, role: "photo" | "video"): string | null {
  if (!file || file.accountId !== accountId) {
    return role === "photo" ? "That photo isn't in your media library." : "That video isn't in your media library.";
  }
  if (role === "photo" && file.mime !== "image/jpeg" && file.mime !== "image/png" && file.mime !== "image/webp") return "Use a JPG, PNG, or WebP from your library.";
  if (role === "video" && file.kind !== "video") return "Use a video from your library.";
  return null;
}

export type LayoutSaveDeps = {
  writeContent: (doc: LayoutDocument, template: "classic" | "fresh" | "bold") => Promise<void>;
  render: (doc: LayoutDocument) => Promise<string>;
  swap: (previousMediaId: string | null, nextMediaId: string) => Promise<void>;
  /** Stores the new still for boardPreviewUrl. Does not assign screens. */
  preview?: (mediaId: string) => Promise<void>;
};

/**
 * Draft writes the board only. Publish renders a PNG and swaps it through the existing menu function.
 * The flag must already be on. This does not open a database by itself.
 */
/** Media ids a board draws besides its main photo and video: item photos and a template logo. */
export function extraImageIds(doc: Pick<LayoutDocument, "sections" | "logoMediaId">): string[] {
  const ids = new Set<string>(itemPhotoIds(doc.sections));
  if (doc.logoMediaId) ids.add(doc.logoMediaId);
  return [...ids];
}

export async function applyLayoutSave(input: {
  enabled: boolean;
  accountId: string;
  mode: "draft" | "publish";
  document: unknown;
  files: LibraryFile[];
  previousMediaId: string | null;
}, deps: LayoutSaveDeps): Promise<{ ok: true; swapped: boolean; document: LayoutDocument } | { ok: false; error: string }> {
  if (!input.enabled) return { ok: false, error: "Layout Studio is not on." };
  const parsed = parseLayout(input.document);
  if (!parsed.ok) return parsed;
  const raw = parsed.value;
  const byId = new Map(input.files.map((file) => [file.id, file]));
  if (raw.imageMediaId) {
    const error = libraryError(input.accountId, byId.get(raw.imageMediaId) ?? null, "photo");
    if (error) return { ok: false, error };
  }
  if (raw.videoMediaId) {
    const error = libraryError(input.accountId, byId.get(raw.videoMediaId) ?? null, "video");
    if (error) return { ok: false, error };
  }
  // Item photos and a template board's logo must be this account's own images. A reference that isn't (deleted
  // since, another account's, or not a photo) is dropped before anything is stored or drawn; the item keeps its
  // text and shows the template's placeholder instead.
  const usable = (id: string) => !libraryError(input.accountId, byId.get(id) ?? null, "photo");
  const doc: LayoutDocument = {
    ...raw,
    sections: raw.sections.map((section) => ({
      ...section,
      items: section.items.map((item) => {
        if (!item.imageMediaId || usable(item.imageMediaId)) return item;
        const { imageMediaId: _drop, ...rest } = item;
        return rest;
      }),
    })),
  };
  if (raw.logoMediaId && !usable(raw.logoMediaId)) doc.logoMediaId = null;
  // A template board is never published with items left off the screen: drafts can be saved, publishing waits
  // until everything fits (fewer items, a roomier template, or a second board).
  if (input.mode === "publish" && doc.design && isDesignId(doc.design)) {
    const { dropped } = designSvgWithReport(doc).report;
    if (dropped > 0) return { ok: false, error: dropped === 1 ? "1 item doesn't fit on the screen. Remove an item or choose a roomier template, then publish." : `${dropped} items don't fit on the screen. Remove some items or choose a roomier template, then publish.` };
  }
  // Guided customization: refused only when the owner's size/spacing changes add overflow the same board without them
  // doesn't have. Existing boards (no customization) are never refused for this, whatever their current fit.
  if (input.mode === "publish") {
    const customError = customPublishError(doc);
    if (customError) return { ok: false, error: customError };
  }
  const effect = boardSaveEffect(input.mode);
  // Write the menu row first. A new board has no id until this returns, and the
  // swap that publishes it has to update that row.
  await deps.writeContent(doc, storedMenuTemplate(doc));
  if (effect.renderPng) {
    try {
      const mediaId = await deps.render(doc);
      if (effect.swapMedia) await deps.swap(input.previousMediaId, mediaId);
      else await deps.preview?.(mediaId);
    } catch (err) {
      if (effect.swapMedia) throw err;
    }
  }
  return { ok: true, swapped: effect.swapMedia, document: doc };
}
