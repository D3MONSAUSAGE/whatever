// Resizes on the phone before upload: TV browsers can run out of memory on huge
// PNGs, and Vercel functions cap request bodies at ~4.5 MB. Output is JPEG on
// black, which every TV browser decodes. Long edge max 1920, short edge max 1080.
const MAX_UPLOAD = 4 * 1024 * 1024;

function load(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That image couldn't be opened.")); };
    img.src = url;
  });
}

const toBlob = (c: HTMLCanvasElement, q: number) =>
  new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", q));

export async function prepareImage(file: File): Promise<Blob> {
  const img = await load(file);
  const w = img.naturalWidth, h = img.naturalHeight;
  const [maxW, maxH] = w >= h ? [1920, 1080] : [1080, 1920];
  const scale = Math.min(1, maxW / w, maxH / h);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't prepare images.");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  for (const q of [0.9, 0.8, 0.65]) {
    const blob = await toBlob(canvas, q);
    if (blob && blob.size <= MAX_UPLOAD) return blob;
  }
  throw new Error("That image is too detailed to upload. Try exporting it smaller.");
}
