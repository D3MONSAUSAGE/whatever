"use client";
import { useState } from "react";
import { api, formatDuration, formatSize, useApi, type MediaItem } from "@/lib/api";
import { prepareImage } from "@/lib/prepare-image";
import { blobToBase64, prepareVideo, uploadToSignedUrl } from "@/lib/prepare-video";
import { useToast } from "@/components/toast";

const TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX = 15 * 1024 * 1024;

export default function MediaLibrary() {
  const { data, error, reload } = useApi<MediaItem[]>("/api/media");
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const toast = useToast();

  async function upload(file: File) {
    if (!TYPES.includes(file.type)) return toast.show("Choose a JPG, PNG, or WebP image.", true);
    if (file.size > MAX) return toast.show("Images must be 15 MB or smaller.", true);
    try {
      setBusy("Preparing image…");
      const blob = await prepareImage(file);
      setBusy("Uploading…");
      const form = new FormData();
      form.append("file", blob, "image.jpg");
      form.append("name", file.name);
      await api("/api/media", { method: "POST", body: form });
      toast.show("Uploaded");
      await reload();
    } catch (e) {
      toast.show((e as Error).message, true);
    } finally {
      setBusy(null);
    }
  }

  async function uploadVideo(file: File) {
    try {
      setProgress(0);
      setBusy("Checking video…");
      const prepared = await prepareVideo(file);
      setBusy("Uploading video…");
      const signed = await api<{ mediaId: string; signedUrl: string }>("/api/media/upload", {
        method: "POST",
        body: JSON.stringify({ fileName: file.name, sizeBytes: file.size }),
      });
      await uploadToSignedUrl(signed.signedUrl, file, setProgress);
      setBusy("Saving…");
      const thumbnailBase64 = await blobToBase64(prepared.thumbnail);
      await api("/api/media/upload/complete", {
        method: "POST",
        body: JSON.stringify({
          mediaId: signed.mediaId,
          fileName: file.name,
          durationMs: prepared.durationMs,
          width: prepared.width,
          height: prepared.height,
          thumbnailBase64,
        }),
      });
      toast.show("Uploaded");
      await reload();
    } catch (e) {
      toast.show((e as Error).message, true);
    } finally {
      setBusy(null);
      setProgress(null);
    }
  }

  async function remove(m: MediaItem) {
    if (!confirm(`Delete “${m.fileName}”? Any TV showing it will switch to “No content assigned”. Files used in a playlist must be removed from that playlist first.`)) return;
    try {
      await api(`/api/media/${m.id}`, { method: "DELETE" });
      toast.show("Deleted");
      reload();
    } catch (e) {
      toast.show((e as Error).message, true);
    }
  }

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Media library</h1>
        <div className="flex flex-wrap gap-2">
          <label className={`btn btn-primary cursor-pointer ${busy ? "pointer-events-none opacity-60" : ""}`}>
            {busy && progress === null ? busy : "Upload image"}
            <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={!!busy}
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f); }} />
          </label>
          <label className={`btn btn-quiet cursor-pointer ${busy ? "pointer-events-none opacity-60" : ""}`}>
            Upload video
            <input type="file" accept="video/mp4,.mp4" className="sr-only" disabled={!!busy}
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) uploadVideo(f); }} />
          </label>
        </div>
      </div>

      {progress !== null && (
        <div className="mb-6" aria-live="polite">
          <div className="h-2 rounded-full bg-line overflow-hidden">
            <div className="h-full bg-ink" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-sm text-muted mt-2">{busy} {progress}%</p>
        </div>
      )}

      {!data ? (
        <p className="text-muted">{error || "Loading…"}</p>
      ) : data.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line p-8 text-center">
          <p className="font-medium">No images yet</p>
          <p className="text-muted text-sm mt-1">Upload a JPG or PNG, or an H.264 MP4. Menus exported from Canva at 1920 × 1080 work well.</p>
        </div>
      ) : (
        <ul className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {data.map((m) => (
            <li key={m.id}>
              {m.kind === "video" ? (
                <video poster={m.thumbnailUrl || undefined} src={m.url || undefined} muted playsInline preload="none" controls className="block aspect-video w-full bg-black rounded-md object-contain" />
              ) : (
                <a href={m.url ?? undefined} target="_blank" rel="noreferrer" className="block aspect-video bg-black rounded-md overflow-hidden">
                  {m.url && <img src={m.url} alt="" className="size-full object-contain" loading="lazy" />}
                </a>
              )}
              <p className="mt-2 text-sm font-medium truncate">{m.fileName}</p>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted">
                  {m.kind === "video" && m.durationMs ? `${formatDuration(m.durationMs)} · ` : ""}
                  {formatSize(m.sizeBytes)}
                </span>
                <button className="text-sm text-danger py-2 pl-3" onClick={() => remove(m)}>Delete</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {toast.node}
    </section>
  );
}
