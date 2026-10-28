import { MAX_UPLOAD_BYTES } from "./limits";

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

export function uploadSizeError(size: number): string | null {
  if (!Number.isFinite(size) || size <= 0) return "Upload a JPG, PNG, or WebP image.";
  if (size > MAX_UPLOAD_BYTES) return "Images must be 15 MB or smaller.";
  return null;
}
