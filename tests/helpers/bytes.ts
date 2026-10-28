export function jpeg(width: number, height: number) {
  const bytes = [
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x10,
    0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x0b, 0x08,
    (height >> 8) & 255, height & 255,
    (width >> 8) & 255, width & 255,
    0x01, 0x01, 0x11, 0x00,
    0xff, 0xd9,
  ];
  return new Uint8Array(bytes);
}

export function png(width: number, height: number) {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  bytes.set([0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52], 8);
  bytes[16] = (width >>> 24) & 255;
  bytes[17] = (width >>> 16) & 255;
  bytes[18] = (width >>> 8) & 255;
  bytes[19] = width & 255;
  bytes[20] = (height >>> 24) & 255;
  bytes[21] = (height >>> 16) & 255;
  bytes[22] = (height >>> 8) & 255;
  bytes[23] = height & 255;
  return bytes;
}

export function webp(width: number, height: number) {
  const payload = new Uint8Array(10);
  const w = width - 1;
  const h = height - 1;
  payload[4] = w & 255;
  payload[5] = (w >> 8) & 255;
  payload[6] = (w >> 16) & 255;
  payload[7] = h & 255;
  payload[8] = (h >> 8) & 255;
  payload[9] = (h >> 16) & 255;
  const chunk = new Uint8Array(18);
  chunk.set([0x56, 0x50, 0x38, 0x58]);
  chunk[4] = 10;
  chunk.set(payload, 8);
  const body = new Uint8Array(4 + chunk.length);
  body.set([0x57, 0x45, 0x42, 0x50]);
  body.set(chunk, 4);
  const out = new Uint8Array(8 + body.length);
  out.set([0x52, 0x49, 0x46, 0x46]);
  out[4] = body.length & 255;
  out[5] = (body.length >> 8) & 255;
  out[6] = (body.length >> 16) & 255;
  out[7] = (body.length >> 24) & 255;
  out.set(body, 8);
  return out;
}

export function webpLossless(width: number, height: number) {
  const bits = (width - 1) | ((height - 1) << 14);
  const bytes = new Uint8Array(25);
  bytes.set([0x52, 0x49, 0x46, 0x46]);
  bytes.set([0x57, 0x45, 0x42, 0x50], 8);
  bytes.set([0x56, 0x50, 0x38, 0x4c], 12);
  bytes[20] = 0x2f;
  bytes[21] = bits & 255;
  bytes[22] = (bits >> 8) & 255;
  bytes[23] = (bits >> 16) & 255;
  bytes[24] = (bits >>> 24) & 255;
  return bytes;
}
