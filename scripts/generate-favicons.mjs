#!/usr/bin/env node
/**
 * Rasterize the approved Peek TV app icon (public/icon.svg) into favicons,
 * apple-touch, and PWA / maskable icons. No new artwork — sizes only.
 *
 *   node scripts/generate-favicons.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const svg = readFileSync(join(root, "public/icon.svg"));
const INDIGO = { r: 0x4a, g: 0x2f, b: 0xbd };

function renderPng(size) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: size },
    background: "#4A2FBD",
  });
  return resvg.render().asPng();
}

async function downscale(size) {
  // Render large and lanczos-downscale so 16/32px marks stay clean.
  const src = size >= 192 ? renderPng(size) : renderPng(Math.max(size * 8, 512));
  return sharp(src)
    .resize(size, size, { kernel: "lanczos3", fit: "fill" })
    .flatten({ background: INDIGO })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

async function maskable(size) {
  // Safe zone: keep the mark in the center 80% so circular/squircle masks don't clip it.
  const inner = Math.round(size * 0.8);
  const pad = Math.round((size - inner) / 2);
  const icon = await sharp(renderPng(inner * 4))
    .resize(inner, inner, { kernel: "lanczos3" })
    .png()
    .toBuffer();
  return sharp({
    create: { width: size, height: size, channels: 3, background: INDIGO },
  })
    .composite([{ input: icon, left: pad, top: pad }])
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

async function writeIco(path, sizes) {
  // Multi-size ICO: 16, 32, 48. Written without extra deps (Pillow not required).
  const pngs = [];
  for (const size of sizes) pngs.push({ size, png: await downscale(size) });
  const count = pngs.length;
  const headerSize = 6 + 16 * count;
  let offset = headerSize;
  const entries = [];
  const payloads = [];
  for (const { size, png } of pngs) {
    const w = size >= 256 ? 0 : size;
    const entry = Buffer.alloc(16);
    entry[0] = w;
    entry[1] = w;
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bit count
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    payloads.push(png);
    offset += png.length;
  }
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // ICO
  header.writeUInt16LE(count, 4);
  writeFileSync(path, Buffer.concat([header, ...entries, ...payloads]));
}

const files = [
  ["public/favicon-48x48.png", 48],
  ["public/favicon-96x96.png", 96],
  ["public/favicon-192x192.png", 192],
  ["public/brand/favicon-16.png", 16],
  ["public/brand/favicon-32.png", 32],
  ["public/brand/favicon-48.png", 48],
  ["public/brand/apple-touch-icon.png", 180],
  ["public/brand/icon-192.png", 192],
  ["public/brand/icon-512.png", 512],
];

for (const [rel, size] of files) {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, await downscale(size));
  console.log("wrote", rel, size);
}

for (const [rel, size] of [
  ["public/brand/icon-maskable-192.png", 192],
  ["public/brand/icon-maskable-512.png", 512],
]) {
  const abs = join(root, rel);
  writeFileSync(abs, await maskable(size));
  console.log("wrote", rel, size, "maskable");
}

await writeIco(join(root, "public/favicon.ico"), [16, 32, 48]);
console.log("wrote public/favicon.ico 16/32/48");
