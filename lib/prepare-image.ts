// Resizes on the phone before upload: TV browsers can run out of memory on huge
// PNGs, and Vercel functions cap request bodies at ~4.5 MB. Output is JPEG on
// black, which every TV browser decodes. Long edge max 1920, short edge max 1080.
// HEIC/HEIF is decoded in the browser (Safari and iPhone natively) and written as JPEG
// with orientation baked in; the original HEIC is not stored.
import { decodeHeic, fileLooksLikeHeic, heicToJpegName } from "@/lib/heic";
import { makeT, type T } from "@/lib/i18n";

const EN: T = makeT("en");
const MAX_UPLOAD = 4 * 1024 * 1024;

type Drawable = { width: number; height: number; draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; close?: () => void };

function load(file: Blob): Promise<Drawable> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({
        width: img.naturalWidth,
        height: img.naturalHeight,
        draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
      });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That image couldn't be opened.")); };
    img.src = url;
  });
}

const toBlob = (c: HTMLCanvasElement, q: number) =>
  new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", q));

export async function prepareImage(file: File, t: T = EN): Promise<Blob> {
  const heic = await fileLooksLikeHeic(file);
  const img = heic ? await decodeHeic(file, t) : await load(file);
  try {
    const w = img.width, h = img.height;
    if (!w || !h) throw new Error(heic ? t("up.heicFailed") : "That image couldn't be opened.");
    const [maxW, maxH] = w >= h ? [1920, 1080] : [1080, 1920];
    const scale = Math.min(1, maxW / w, maxH / h);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser can't prepare images.");
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    img.draw(ctx, canvas.width, canvas.height);

    for (const q of [0.9, 0.8, 0.65]) {
      const blob = await toBlob(canvas, q);
      if (blob && blob.size <= MAX_UPLOAD) return blob;
    }
    throw new Error("That image is too detailed to upload. Try exporting it smaller.");
  } finally {
    img.close?.();
  }
}

/** Convert HEIC/HEIF to a JPEG File for upload paths that otherwise send the original bytes. */
export async function asUploadImage(file: File, t: T = EN): Promise<File> {
  const heic = await fileLooksLikeHeic(file);
  if (!heic) return file;
  const blob = await prepareImage(file, t);
  return new File([blob], heicToJpegName(file.name), { type: "image/jpeg" });
}
