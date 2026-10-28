import { isUuid } from "./crypto";
import {
  MAX_UPLOAD_BYTES,
  PLAYLIST_MAX_DURATION_MS,
  PLAYLIST_MAX_ITEMS,
  PLAYLIST_MIN_DURATION_MS,
} from "./limits";

/** Drop ASCII control characters, including NUL. */
export function stripControls(value: string) {
  let out = "";
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code >= 32 && code !== 127) out += value[i];
  }
  return out;
}

/** Digits only. Returns the 6-digit code, or null when it isn't one. */
export function normalizePairingCode(input: unknown): string | null {
  const code = String(input ?? "").replace(/\D/g, "");
  return code.length === 6 ? code : null;
}

/** Trimmed display name, 1–60 characters, or null. */
export function normalizeDisplayName(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const name = stripControls(input).trim().slice(0, 60);
  return name.length ? name : null;
}

/** Library label. Control characters stripped; never empty. */
export function normalizeFileName(input: unknown): string {
  const raw = stripControls(String(input ?? "image")).trim();
  return (raw || "image").slice(0, 200);
}

/** Trimmed playlist name, 1–80 characters, or null. */
export function normalizePlaylistName(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const name = stripControls(input).trim().slice(0, 80);
  return name.length ? name : null;
}

export function normalizeTransition(input: unknown): "none" | "fade" | null {
  return input === "none" || input === "fade" ? input : null;
}

/** null means "use the playlist default". "invalid" means reject the save. */
export function parseDurationMs(input: unknown): number | null | "invalid" {
  if (input === null) return null;
  if (typeof input !== "number" || !Number.isInteger(input)) return "invalid";
  if (input < PLAYLIST_MIN_DURATION_MS || input > PLAYLIST_MAX_DURATION_MS) return "invalid";
  return input;
}

export type DraftSlide = { mediaId: string; durationMs: number | null };

export function parseDraftItems(input: unknown): DraftSlide[] | null {
  if (!Array.isArray(input) || input.length > PLAYLIST_MAX_ITEMS) return null;
  const items: DraftSlide[] = [];
  for (const entry of input) {
    if (!entry || typeof entry !== "object") return null;
    const mediaId = (entry as { mediaId?: unknown }).mediaId;
    if (!isUuid(mediaId)) return null;
    const durationMs = parseDurationMs((entry as { durationMs?: unknown }).durationMs);
    if (durationMs === "invalid") return null;
    items.push({ mediaId, durationMs });
  }
  return items;
}

export function uploadSizeError(size: number): string | null {
  if (!Number.isFinite(size) || size <= 0) return "Upload a JPG, PNG, or WebP image.";
  if (size > MAX_UPLOAD_BYTES) return "Images must be 15 MB or smaller.";
  return null;
}
