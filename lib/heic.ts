import { heicToJpegName, isHeicBrand, looksLikeHeic } from "@/lib/media-accept";
import { makeT, type T } from "@/lib/i18n";

const EN: T = makeT("en");

export type HeicDecoder = (file: Blob) => Promise<Blob>;

let extraDecoder: HeicDecoder | null = null;

/** Test hook, and a place to plug a future on-device decoder. */
export function setHeicDecoder(decoder: HeicDecoder | null) {
  extraDecoder = decoder;
}

export { looksLikeHeic, isHeicBrand, heicToJpegName };

export async function fileLooksLikeHeic(file: Blob & { type?: string; name?: string }): Promise<boolean> {
  if (looksLikeHeic(file)) return true;
  try {
    const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    return isHeicBrand(header);
  } catch {
    return false;
  }
}

type BitmapOptions = { imageOrientation?: "from-image" | "none" | "flipY" };

async function bitmapFrom(blob: Blob): Promise<ImageBitmap | null> {
  if (typeof createImageBitmap !== "function") return null;
  try {
    const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" } as BitmapOptions);
    if (bitmap && bitmap.width > 0 && bitmap.height > 0) return bitmap;
    bitmap?.close();
  } catch {
    try {
      const bitmap = await createImageBitmap(blob);
      if (bitmap && bitmap.width > 0 && bitmap.height > 0) return bitmap;
      bitmap?.close();
    } catch {
      return null;
    }
  }
  return null;
}

function elementFrom(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      if (!img.naturalWidth || !img.naturalHeight) reject(new Error("empty"));
      else resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("decode"));
    };
    img.src = url;
  });
}

export type DecodedImage = { width: number; height: number; draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; close?: () => void };

export async function decodeHeic(file: Blob & { type?: string; name?: string }, t: T = EN): Promise<DecodedImage> {
  const bitmap = await bitmapFrom(file);
  if (bitmap) {
    return {
      width: bitmap.width,
      height: bitmap.height,
      draw: (ctx, w, h) => ctx.drawImage(bitmap, 0, 0, w, h),
      close: () => bitmap.close(),
    };
  }
  try {
    const img = await elementFrom(file);
    return {
      width: img.naturalWidth,
      height: img.naturalHeight,
      draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
    };
  } catch {
    // Native decode failed. Try an optional decoder (tests, or a future wasm fallback).
  }
  if (extraDecoder) {
    const jpeg = await extraDecoder(file);
    const img = await elementFrom(jpeg);
    return {
      width: img.naturalWidth,
      height: img.naturalHeight,
      draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
    };
  }
  throw new Error(t("up.heicUnsupported"));
}
