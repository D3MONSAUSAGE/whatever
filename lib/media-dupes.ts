import type { MediaItem } from "@/lib/api";

/**
 * QA B1-10 retest: a video picked in the Media library that is already there (same file name and size).
 * Only videos: images are re-encoded on upload, so their stored size never matches the original.
 */
export function sameLibraryVideo(items: MediaItem[] | null | undefined, file: { name: string; size: number }): MediaItem | null {
  if (!items || !file.size) return null;
  return items.find((item) => (item.kind ?? "video") === "video" && item.fileName === file.name && item.sizeBytes === file.size) ?? null;
}

/** The library search URL used to look for one file name among this account's videos (read only, existing API). */
export function libraryLookupUrl(name: string): string {
  const p = new URLSearchParams({ limit: "48", offset: "0", sort: "newest", grouped: "1", kind: "video", q: name });
  return `/api/media?${p}`;
}

export function duplicateMessage(names: string[]): string {
  const list = names.length === 1 ? `“${names[0]}” is` : `${names.length} of these videos are`;
  return `${list} already in your library with the same name and size. Uploading again makes a second copy.`;
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
