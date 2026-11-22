import { parseLayout, sampleLayout, type LayoutDocument } from "@/lib/layout-studio";

/** A library file the account editor may attach. The server still checks ownership on save. */
export type AccountLibraryFile = {
  id: string;
  name: string;
  kind: "image" | "video";
  mime: string;
  url: string | null;
  /** Stored size in bytes, when known. Used to reuse an identical upload instead of storing it twice. */
  sizeBytes?: number | null;
  /** Signed URL of the stored video thumbnail, when one exists. */
  thumbnailUrl?: string | null;
  /** Video conversion state when loaded alongside /api/media or in a fixture. Absent or "ready" = publishable. */
  processingStatus?: "pending" | "processing" | "ready" | "failed" | null;
  processingError?: string | null;
};

/**
 * A library video with the same file name and byte size as the file being added (QA B1-10).
 * Videos are stored byte-for-byte, so name + size identifies a repeat upload. Photos are re-encoded
 * on upload, so their stored size never matches the original and they are not matched here.
 */
export function findSameVideo(library: AccountLibraryFile[] | null | undefined, file: { name: string; size: number }): AccountLibraryFile | null {
  if (!library || !file.size) return null;
  return library.find((item) => item.kind === "video" && item.name === file.name && item.sizeBytes === file.size) ?? null;
}

export type AccountBoard = {
  id: string;
  name: string;
  document: LayoutDocument;
  mediaId: string | null;
  playlistId: string | null;
  /** When the board was last saved. Missing on older responses. */
  updatedAt?: string | null;
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
  const status = row.processingStatus === "pending" || row.processingStatus === "processing" || row.processingStatus === "ready" || row.processingStatus === "failed"
    ? row.processingStatus
    : undefined;
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    mime: row.mime,
    url: typeof row.url === "string" ? row.url : null,
    sizeBytes: typeof row.sizeBytes === "number" && Number.isFinite(row.sizeBytes) ? row.sizeBytes : null,
    thumbnailUrl: typeof row.thumbnailUrl === "string" ? row.thumbnailUrl : null,
    ...(status ? { processingStatus: status } : {}),
    ...(typeof row.processingError === "string" ? { processingError: row.processingError } : {}),
  };
}

/**
 * The board the editor shows after a reload.
 * A missing id falls back to the first saved board, unless the editor is holding an unsaved draft.
 */
export function boardAfterReload(studio: AccountStudio, menuId: string | null, options?: { keepUnsaved?: boolean }): AccountBoard | null {
  const found = menuId ? studio.boards.find((board) => board.id === menuId) ?? null : null;
  if (found) return found;
  if (options?.keepUnsaved) return null;
  return studio.boards[0] ?? null;
}

/** A new board starts empty. The name is separate from the sample menu title. */
/** `baseName` is the UI-language word ("Untitled board" / "Menú sin nombre"); only used at creation, never to rename. */
export function freshBoard(existingCount: number, requested?: string | null, baseName = "Untitled board"): { name: string; document: LayoutDocument } {
  const fallback = `${baseName} ${Math.max(0, existingCount) + 1}`;
  const name = (requested ?? fallback).trim().slice(0, 80) || fallback;
  return {
    name,
    document: { ...sampleLayout("menu-promo-67"), imageMediaId: null, videoMediaId: null },
  };
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
      updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : null,
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

/**
 * Step 3 (Content) single-item featured media selection.
 * Picks one primary item (photo, video, template sample photo, or none) while preserving
 * existing saved board fields until the owner changes them.
 */
export function selectFeaturedMedia(
  doc: LayoutDocument,
  pick: { kind: "image" | "video" | "sample" | "none"; id?: string; stockPhoto?: LayoutDocument["stockPhoto"] },
  options: { isDesign: boolean; supportsVideo: boolean; exclusive?: boolean },
): LayoutDocument {
  if (pick.kind === "none") {
    const next: LayoutDocument = { ...doc, imageMediaId: null, videoMediaId: null };
    if (options.isDesign) delete next.stockPhoto;
    return next;
  }
  if (pick.kind === "sample") {
    const next: LayoutDocument = { ...doc, imageMediaId: null, videoMediaId: null };
    if (options.isDesign && pick.stockPhoto) next.stockPhoto = pick.stockPhoto;
    return next;
  }
  if (pick.kind === "image") {
    const id = pick.id ?? null;
    const base = options.exclusive ? placeZoneMedia(doc, "photo", id, Boolean(id)) : { ...doc, imageMediaId: id, videoMediaId: null };
    if (options.isDesign) {
      const next = { ...base };
      delete next.stockPhoto;
      return next;
    }
    return base;
  }
  if (!options.supportsVideo) return doc;
  const id = pick.id ?? null;
  const base = options.exclusive ? placeZoneMedia(doc, "video", id, Boolean(id)) : { ...doc, videoMediaId: id, imageMediaId: null };
  if (options.isDesign) {
    const next = { ...base };
    delete next.stockPhoto;
    return next;
  }
  return base;
}
