import {
  MAX_VIDEO_BYTES,
  MAX_VIDEO_DURATION_MS,
  MAX_VIDEO_EDGE,
  enforceVideoLimits,
  inspectMp4,
  mp4ErrorMessage,
  type Mp4Info,
} from "./mp4";

export type PreparedVideo = Mp4Info & { thumbnail: Blob };

/** Read the MP4 with the browser, then grab one JPEG frame for the library. */
export async function prepareVideo(file: File): Promise<PreparedVideo> {
  if (file.size > MAX_VIDEO_BYTES) throw new Error(mp4ErrorMessage("size"));
  const info = await inspectMp4({
    size: file.size,
    async read(offset, length) {
      const slice = file.slice(offset, offset + length);
      return new Uint8Array(await slice.arrayBuffer());
    },
  });
  if (!info.ok) throw new Error(mp4ErrorMessage(info.reason));
  const limited = enforceVideoLimits(info, file.size);
  if (limited) throw new Error(mp4ErrorMessage(limited));
  const probed = await probeVideo(file);
  if (probed.durationMs > MAX_VIDEO_DURATION_MS) throw new Error(mp4ErrorMessage("duration"));
  if (probed.width > MAX_VIDEO_EDGE || probed.height > MAX_VIDEO_EDGE) throw new Error(mp4ErrorMessage("dimensions"));
  return { ...info, thumbnail: probed.thumbnail };
}

function probeVideo(file: File): Promise<{ durationMs: number; width: number; height: number; thumbnail: Blob }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    let settled = false;
    const timer = window.setTimeout(() => finish(new Error("This browser couldn't read that video. Export it as H.264 MP4.")), 20000);
    function finish(error?: Error, value?: { durationMs: number; width: number; height: number; thumbnail: Blob }) {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      try { video.load(); } catch { /* older browsers */ }
      if (error) reject(error);
      else if (value) resolve(value);
    }
    video.onerror = () => finish(new Error("This browser couldn't read that video. Export it as H.264 MP4."));
    video.onloadedmetadata = () => {
      const durationMs = Math.round((video.duration || 0) * 1000);
      const width = video.videoWidth;
      const height = video.videoHeight;
      if (!durationMs || !width || !height) {
        finish(new Error("This browser couldn't read that video. Export it as H.264 MP4."));
        return;
      }
      const capture = () => {
        try {
          const canvas = document.createElement("canvas");
          const scale = Math.min(1, 480 / width);
          canvas.width = Math.max(1, Math.round(width * scale));
          canvas.height = Math.max(1, Math.round(height * scale));
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            finish(new Error("This browser can't make a preview image."));
            return;
          }
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((blob) => {
            if (!blob) finish(new Error("This browser can't make a preview image."));
            else finish(undefined, { durationMs, width, height, thumbnail: blob });
          }, "image/jpeg", 0.7);
        } catch {
          finish(new Error("This browser can't make a preview image."));
        }
      };
      if (video.duration < 0.3) {
        capture();
        return;
      }
      video.onseeked = capture;
      try { video.currentTime = Math.min(0.25, video.duration / 2); }
      catch { capture(); }
    };
    video.src = url;
  });
}

export function uploadToSignedUrl(signedUrl: string, file: Blob, onProgress: (percent: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append("cacheControl", "86400");
    form.append("", file, "video.mp4");
    xhr.open("PUT", signedUrl);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
      } else reject(new Error("Upload failed. Try again."));
    };
    xhr.onerror = () => reject(new Error("Upload failed. Check your connection and try again."));
    xhr.send(form);
  });
}

export function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result || "");
      const comma = value.indexOf(",");
      resolve(comma >= 0 ? value.slice(comma + 1) : value);
    };
    reader.onerror = () => reject(new Error("Couldn't read the preview image."));
    reader.readAsDataURL(blob);
  });
}
