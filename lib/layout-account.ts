import { parseLayout, type LayoutDocument } from "@/lib/layout-studio";

/** A library file the account editor may attach. The server still checks ownership on save. */
export type AccountLibraryFile = {
  id: string;
  name: string;
  kind: "image" | "video";
  mime: string;
  url: string | null;
};

export type AccountBoard = {
  id: string;
  name: string;
  document: LayoutDocument;
  mediaId: string | null;
  playlistId: string | null;
};

export type AccountStudio = {
  boards: AccountBoard[];
  legacy: { id: string; name: string }[];
  library: AccountLibraryFile[];
};

/** Body sent by Save draft and Publish. Draft and publish share this shape. */
export function accountSaveBody(input: {
  mode: "draft" | "publish";
  menuId: string | null;
  name: string;
  document: LayoutDocument;
}) {
  return {
    mode: input.mode,
    menuId: input.menuId,
    name: input.name.slice(0, 80),
    document: input.document,
  };
}

function file(value: unknown): AccountLibraryFile | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.name !== "string") return null;
  if (row.kind !== "image" && row.kind !== "video") return null;
  if (typeof row.mime !== "string") return null;
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    mime: row.mime,
    url: typeof row.url === "string" ? row.url : null,
  };
}

/** The board the editor shows after a reload. A missing id falls back to the first saved board. */
export function boardAfterReload(studio: AccountStudio, menuId: string | null): AccountBoard | null {
  return studio.boards.find((board) => board.id === menuId) ?? studio.boards[0] ?? null;
}

export function readAccountStudio(body: unknown): AccountStudio | null {
  if (!body || typeof body !== "object") return null;
  const raw = body as Record<string, unknown>;
  if (!Array.isArray(raw.boards) || !Array.isArray(raw.legacy) || !Array.isArray(raw.library)) return null;
  const boards: AccountBoard[] = [];
  for (const item of raw.boards) {
    if (!item || typeof item !== "object") return null;
    const row = item as Record<string, unknown>;
    if (typeof row.id !== "string" || typeof row.name !== "string") return null;
    const parsed = parseLayout(row.document);
    if (!parsed.ok) return null;
    boards.push({
      id: row.id,
      name: row.name,
      document: parsed.value,
      mediaId: typeof row.mediaId === "string" ? row.mediaId : null,
      playlistId: typeof row.playlistId === "string" ? row.playlistId : null,
    });
  }
  const legacy: { id: string; name: string }[] = [];
  for (const item of raw.legacy) {
    if (!item || typeof item !== "object") return null;
    const row = item as Record<string, unknown>;
    if (typeof row.id !== "string" || typeof row.name !== "string") return null;
    legacy.push({ id: row.id, name: row.name });
  }
  const library: AccountLibraryFile[] = [];
  for (const item of raw.library) {
    const next = file(item);
    if (!next) return null;
    library.push(next);
  }
  return { boards, legacy, library };
}

/** Attach a library id. A photo must be JPEG, PNG, or WebP. A video must be a video row. */
export function applyLibraryFile(doc: LayoutDocument, entry: AccountLibraryFile | null, role: "photo" | "video"): LayoutDocument {
  if (role === "photo") {
    if (!entry || entry.kind !== "image") return { ...doc, imageMediaId: null };
    if (entry.mime !== "image/jpeg" && entry.mime !== "image/png" && entry.mime !== "image/webp") return doc;
    return { ...doc, imageMediaId: entry.id };
  }
  if (!entry || entry.kind !== "video") return { ...doc, videoMediaId: null };
  return { ...doc, videoMediaId: entry.id };
}

/**
 * A promotion, banner, or split side shows one file. The newest choice clears the other,
 * including the board's single video when an image takes that zone.
 */
export function placeZoneMedia(doc: LayoutDocument, role: "photo" | "video", id: string | null, exclusive: boolean): LayoutDocument {
  if (role === "photo") return { ...doc, imageMediaId: id, videoMediaId: exclusive ? null : doc.videoMediaId };
  return { ...doc, videoMediaId: id, imageMediaId: exclusive ? null : doc.imageMediaId };
}
