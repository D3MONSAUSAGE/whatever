import { parseLayout, type LayoutDocument } from "@/lib/layout-studio";

export type LibraryFile = {
  id: string;
  accountId: string;
  mime: string;
  kind: "image" | "video" | "other";
};

/** What a save is allowed to change. Draft never reaches a screen. */
export function boardSaveEffect(mode: "draft" | "publish") {
  if (mode === "publish") return { writeContent: true, renderPng: true, swapMedia: true, bumpScreens: true };
  return { writeContent: true, renderPng: false, swapMedia: false, bumpScreens: false };
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
};

/**
 * Draft writes the board only. Publish renders a PNG and swaps it through the existing menu function.
 * The flag must already be on. This does not open a database by itself.
 */
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
  const doc = parsed.value;
  const byId = new Map(input.files.map((file) => [file.id, file]));
  if (doc.imageMediaId) {
    const error = libraryError(input.accountId, byId.get(doc.imageMediaId) ?? null, "photo");
    if (error) return { ok: false, error };
  }
  if (doc.videoMediaId) {
    const error = libraryError(input.accountId, byId.get(doc.videoMediaId) ?? null, "video");
    if (error) return { ok: false, error };
  }
  const effect = boardSaveEffect(input.mode);
  if (effect.renderPng) {
    const mediaId = await deps.render(doc);
    await deps.swap(input.previousMediaId, mediaId);
  }
  await deps.writeContent(doc, storedMenuTemplate(doc));
  return { ok: true, swapped: effect.swapMedia, document: doc };
}
