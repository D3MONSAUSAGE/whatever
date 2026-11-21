/** Shared file-picker accept lists and lightweight client-side type gates. */

export const IMAGE_UPLOAD_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";
export const VIDEO_UPLOAD_ACCEPT = "video/mp4,video/quicktime,video/x-m4v,.mp4,.mov,.m4v";
/** Brand Kit and classic art pickers list JPEG and PNG only; HEIC is converted to JPEG before upload. */
export const ART_UPLOAD_ACCEPT = "image/jpeg,image/png,image/heic,image/heif,.heic,.heif";

const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
]);

const ART_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
]);

const VIDEO_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/x-m4v",
  "video/m4v",
]);

const IMAGE_EXT = /\.(jpe?g|png|webp|heic|heif|heics)$/i;
const ART_EXT = /\.(jpe?g|png|heic|heif|heics)$/i;
const VIDEO_EXT = /\.(mp4|mov|m4v)$/i;
const HEIC_EXT = /\.(heic|heif|heics)$/i;
const HEIC_TYPES = new Set(["image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"]);

/** ISO brands used by HEIC/HEIF still images. */
const HEIC_BRANDS = new Set(["heic", "heix", "heif", "heim", "heis", "mif1", "msf1"]);

function typeOf(file: { type?: string }): string {
  return (file.type || "").toLowerCase();
}

export function looksLikeHeic(file: { type?: string; name?: string }): boolean {
  if (HEIC_TYPES.has(typeOf(file))) return true;
  return HEIC_EXT.test(file.name || "");
}

export function isHeicBrand(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  const box = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]);
  if (box !== "ftyp") return false;
  const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]).toLowerCase();
  return HEIC_BRANDS.has(brand) || HEIC_BRANDS.has(brand.trim());
}

/**
 * True when the picker could reasonably have handed us an image we know how to handle.
 * An empty MIME type is allowed (Safari sometimes reports one).
 */
export function isImageUploadFile(file: { type?: string; name?: string }): boolean {
  const type = typeOf(file);
  if (type) return IMAGE_TYPES.has(type) || IMAGE_EXT.test(file.name || "");
  return IMAGE_EXT.test(file.name || "");
}

/** Logo/photo uploads: JPEG, PNG, or HEIC (converted to JPEG). WebP stays out of the art pickers. */
export function isArtUploadFile(file: { type?: string; name?: string }): boolean {
  const type = typeOf(file);
  const name = file.name || "";
  if (!ART_EXT.test(name)) return false;
  if (!type) return true;
  return ART_TYPES.has(type);
}

/**
 * True when the file looks like a video we should run through content inspection.
 * MIME is not required; .mov from Safari may be video/quicktime or empty.
 */
export function isVideoUploadFile(file: { type?: string; name?: string }): boolean {
  const type = typeOf(file);
  if (type) return VIDEO_TYPES.has(type) || VIDEO_EXT.test(file.name || "");
  return VIDEO_EXT.test(file.name || "");
}

export function heicToJpegName(name: string): string {
  const trimmed = (name || "photo").replace(/\.(heic|heif|heics)$/i, "");
  return `${trimmed || "photo"}.jpg`;
}
