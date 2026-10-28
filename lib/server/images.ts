import { MAX_EDGE, MAX_PIXELS } from "./limits";

export type ImageKind = { mime: "image/jpeg" | "image/png" | "image/webp"; ext: "jpg" | "png" | "webp" };

export type ImageCheck =
  | { ok: true; mime: ImageKind["mime"]; ext: ImageKind["ext"]; width: number; height: number }
  | { ok: false; reason: "type" | "dimensions" };

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function ascii(b: Uint8Array, start: number, end: number) {
  let s = "";
  for (let i = start; i < end && i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
}

function u16(b: Uint8Array, o: number) {
  return (b[o] << 8) | b[o + 1];
}

function u32(b: Uint8Array, o: number) {
  return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
}

/** Magic-byte sniff. Not sufficient on its own — dimensions are checked next. */
export function sniffImage(b: Uint8Array): ImageKind | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (b.length >= 8 && PNG_SIG.every((v, i) => b[i] === v)) return { mime: "image/png", ext: "png" };
  if (b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP") return { mime: "image/webp", ext: "webp" };
  return null;
}

function jpegSize(b: Uint8Array): { width: number; height: number } | null {
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) return null;
    while (i < b.length && b[i] === 0xff) i++;
    if (i >= b.length) return null;
    const marker = b[i++];
    if (marker === 0xd9 || marker === 0xda) return null;
    if (marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (i + 1 >= b.length) return null;
    const len = u16(b, i);
    if (len < 2 || i + len > b.length) return null;
    const sof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (sof) {
      if (len < 7) return null;
      const height = u16(b, i + 3);
      const width = u16(b, i + 5);
      if (!width || !height) return null;
      return { width, height };
    }
    i += len;
  }
  return null;
}

function pngSize(b: Uint8Array): { width: number; height: number } | null {
  if (b.length < 24) return null;
  if (ascii(b, 12, 16) !== "IHDR") return null;
  const width = u32(b, 16);
  const height = u32(b, 20);
  if (!width || !height) return null;
  return { width, height };
}

function webpSize(b: Uint8Array): { width: number; height: number } | null {
  if (b.length < 16) return null;
  const chunk = ascii(b, 12, 16);
  if (chunk === "VP8X") {
    if (b.length < 30) return null;
    const width = 1 + b[24] + (b[25] << 8) + (b[26] << 16);
    const height = 1 + b[27] + (b[28] << 8) + (b[29] << 16);
    if (!width || !height) return null;
    return { width, height };
  }
  if (chunk === "VP8 ") {
    if (b.length < 30) return null;
    // RIFF(12) + chunk header(8) + 3-byte frame tag, then the start code.
    const start = 23;
    if (b[start] !== 0x9d || b[start + 1] !== 0x01 || b[start + 2] !== 0x2a) return null;
    const width = (b[start + 3] | (b[start + 4] << 8)) & 0x3fff;
    const height = (b[start + 5] | (b[start + 6] << 8)) & 0x3fff;
    if (!width || !height) return null;
    return { width, height };
  }
  if (chunk === "VP8L") {
    if (b.length < 25 || b[20] !== 0x2f) return null;
    const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >>> 14) & 0x3fff) + 1;
    return { width, height };
  }
  return null;
}

function dimensions(kind: ImageKind, b: Uint8Array) {
  if (kind.ext === "jpg") return jpegSize(b);
  if (kind.ext === "png") return pngSize(b);
  return webpSize(b);
}

/**
 * Identify an upload from its bytes (not the browser's Content-Type) and
 * reject files whose declared dimensions could exhaust a TV's memory.
 */
export function checkImage(bytes: Uint8Array): ImageCheck {
  const kind = sniffImage(bytes);
  if (!kind) return { ok: false, reason: "type" };
  const size = dimensions(kind, bytes);
  if (!size) return { ok: false, reason: "type" };
  if (size.width > MAX_EDGE || size.height > MAX_EDGE || size.width * size.height > MAX_PIXELS) {
    return { ok: false, reason: "dimensions" };
  }
  return { ok: true, mime: kind.mime, ext: kind.ext, width: size.width, height: size.height };
}
