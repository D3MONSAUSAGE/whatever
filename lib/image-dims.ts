/** Pixel size of a PNG, JPEG or WebP from its header (no decoding). Null when the bytes aren't one of those. */
export function imageDims(bytes: Uint8Array): { w: number; h: number } | null {
  const b = bytes;
  const u16 = (i: number) => (b[i] << 8) | b[i + 1];
  const u32 = (i: number) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return ok(u32(16), u32(20));
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i += 1; continue; }
      const marker = b[i + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      const len = u16(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return ok(u16(i + 7), u16(i + 5));
      i += 2 + len;
    }
    return null;
  }
  if (b.length > 30 && String.fromCharCode(b[0], b[1], b[2], b[3]) === "RIFF" && String.fromCharCode(b[8], b[9], b[10], b[11]) === "WEBP") {
    const kind = String.fromCharCode(b[12], b[13], b[14], b[15]);
    if (kind === "VP8 ") return ok(((b[27] << 8) | b[26]) & 0x3fff, ((b[29] << 8) | b[28]) & 0x3fff);
    if (kind === "VP8L") { const v = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24); return ok((v & 0x3fff) + 1, ((v >> 14) & 0x3fff) + 1); }
    if (kind === "VP8X") return ok(1 + (b[24] | (b[25] << 8) | (b[26] << 16)), 1 + (b[27] | (b[28] << 8) | (b[29] << 16)));
  }
  return null;
}
function ok(w: number, h: number) { return w > 0 && h > 0 ? { w, h } : null; }

/** Same, for a base64 data URI. */
export function dataUriDims(uri: string | null | undefined): { w: number; h: number } | null {
  if (!uri) return null;
  const m = /^data:image\/[a-z]+;base64,(.*)$/i.exec(uri);
  if (!m) return null;
  try { return imageDims(Uint8Array.from(Buffer.from(m[1].slice(0, 200_000), "base64"))); } catch { return null; }
}
