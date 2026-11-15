import type { MediaItem } from "@/lib/api";
import { makeT, type T } from "@/lib/i18n";

const EN: T = makeT("en");

/**
 * QA B1-10 retest: a video picked in the Media library that is already there (same file name and size).
 * Only videos: images are re-encoded on upload, so their stored size never matches the original.
 */
export function sameLibraryVideo(items: MediaItem[] | null | undefined, file: { name: string; size: number }): MediaItem | null {
  if (!items || !file.size) return null;
  return items.find((item) => (item.kind ?? "video") === "video" && item.fileName === file.name && item.sizeBytes === file.size) ?? null;
}

/** The library search URL used to look for one file name among this account's videos or images (read only, existing API). */
export function libraryLookupUrl(name: string, kind: "video" | "image" = "video"): string {
  const p = new URLSearchParams({ limit: "48", offset: "0", sort: "newest", grouped: "1", kind, q: name });
  return `/api/media?${p}`;
}

/**
 * QA U1-04d: a logo or photo uploaded straight from Brand Kit or the classic editor that is already
 * among the account's logo/photo choices. Images are re-encoded on upload, so the stored size never
 * matches the picked file: the check is the file name (the only thing the Logo and Photo lists show).
 * Newest first, so "Keep" selects the copy listed first.
 */
export function sameLibraryImage(items: MediaItem[] | null | undefined, file: { name: string }): MediaItem | null {
  const name = file.name.trim();
  if (!items || !name) return null;
  const hits = items.filter((item) => item.kind !== "video" && item.kind !== "presentation" && item.fileName === name);
  if (!hits.length) return null;
  return [...hits].sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")))[0];
}

export function duplicateImageMessage(name: string, t: T = EN): string {
  return t("dup.image", { name });
}

export function duplicateMessage(names: string[], t: T = EN): string {
  return names.length === 1 ? t("dup.videoOne", { name: names[0] }) : t("dup.videoMany", { count: names.length });
}

/**
 * QA U1-04e: images picked on the Media page that are already in the library (same file name;
 * images are re-encoded, so size can't be compared). Same rule as the editor and Brand Kit check.
 */
export function duplicateImagesMessage(names: string[], t: T = EN): string {
  if (names.length === 1) return duplicateImageMessage(names[0], t);
  return t("dup.imageMany", { count: names.length });
}

/** How long the duplicate check may take before the upload goes ahead as normal (Gother PR94 low). */
export const DUPE_LOOKUP_TIMEOUT_MS = 4000;

/** Runs a lookup with an abort timeout. A timeout or error returns null, so the caller uploads as before. */
export async function lookupWithTimeout<T>(run: (signal: AbortSignal) => Promise<T>, ms = DUPE_LOOKUP_TIMEOUT_MS): Promise<T | null> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => { controller.abort(); resolve(null); }, ms);
  });
  try {
    return await Promise.race([run(controller.signal), timeout]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
