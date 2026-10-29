"use client";
import { useMemo, useState } from "react";
import { api, authToken, formatDuration, formatSize, uploadForm, useApi, type MediaItem } from "@/lib/api";
import { prepareImage } from "@/lib/prepare-image";
import { blobToBase64, prepareVideo, uploadToSignedUrl } from "@/lib/prepare-video";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";
import { EmptyState, LoadingBlock, PageHeader, formatNameList } from "@/components/ui";

const TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX = 15 * 1024 * 1024;
type SortKey = "newest" | "oldest" | "name" | "size" | "duration";
type Job = { key: string; name: string; progress: number; state: "queued" | "active" | "done" | "error"; detail: string };

export function MediaLibrary({ fixture }: { fixture?: MediaItem[] }) {
  const live = useApi<MediaItem[]>(fixture ? null : "/api/media");
  const data = fixture ?? live.data;
  const error = fixture ? null : live.error;
  const reload = fixture ? async () => {} : live.reload;
  const [jobs, setJobs] = useState<Job[]>([]);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const toast = useToast();
  const confirm = useConfirm();

  const visible = useMemo(() => sortMedia(data ?? [], query, sort), [data, query, sort]);

  function patchJob(key: string, patch: Partial<Job>) {
    setJobs((current) => current.map((job) => (job.key === key ? { ...job, ...patch } : job)));
  }

  async function run(files: File[], kind: "image" | "video") {
    const queue = files.map((file, index) => ({
      key: `${file.name}-${file.size}-${index}-${Date.now()}`,
      name: file.name,
      progress: 0,
      state: "queued" as const,
      detail: "Waiting",
    }));
    setJobs(queue);
    setBusy(true);
    let failed = 0;
    let firstError = "";
    for (let index = 0; index < files.length; index++) {
      const file = files[index];
      const key = queue[index].key;
      patchJob(key, { state: "active", detail: kind === "image" ? "Preparing image…" : "Checking video…" });
      try {
        if (kind === "image") await uploadImage(file, (progress, detail) => patchJob(key, { progress, detail, state: "active" }));
        else await uploadVideo(file, (progress, detail) => patchJob(key, { progress, detail, state: "active" }));
        patchJob(key, { state: "done", progress: 100, detail: "Uploaded" });
      } catch (err) {
        failed += 1;
        const message = (err as Error).message;
        if (!firstError) firstError = message;
        patchJob(key, { state: "error", detail: message });
      }
    }
    if (failed === 0) toast.show(files.length === 1 ? "Uploaded" : `Uploaded ${files.length} files`);
    else if (files.length === 1) toast.show(firstError, true);
    else toast.show(`${failed} of ${files.length} files could not be uploaded. ${firstError}`, true);
    setBusy(false);
    await reload();
  }

  async function remove(item: MediaItem) {
    const used = item.usedIn ?? [];
    if (used.length) {
      const names = formatNameList(used.map((playlist) => playlist.name));
      await confirm.ask({
        title: "This file is in a playlist",
        body: `“${item.fileName}” is used by ${names}. Remove it from ${used.length === 1 ? "that playlist" : "those playlists"} and publish again before deleting it. The file stays in the library until then.`,
        cancelLabel: "Close",
      });
      return;
    }
    const ok = await confirm.ask({
      title: "Delete this file?",
      body: `Delete “${item.fileName}”? Any TV showing it will switch to “No content assigned”.`,
      confirmLabel: "Delete file",
      danger: true,
    });
    if (ok !== true) return;
    try {
      await api(`/api/media/${item.id}`, { method: "DELETE" });
      toast.show("Deleted");
      reload();
    } catch (err) {
      const message = (err as Error).message;
      if (/playlist/i.test(message)) {
        await confirm.ask({ title: "This file is in a playlist", body: message, cancelLabel: "Close" });
      } else toast.show(message, true);
    }
  }

  return (
    <section>
      <PageHeader title="Media library" lede="Images up to 15 MB. Video is MP4 H.264, 50 MB or smaller, 0.5 seconds to 3 minutes, and 1920 pixels or less on each edge.">
        <label className={`btn btn-primary cursor-pointer ${busy ? "pointer-events-none opacity-60" : ""}`}>
          Upload image
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" disabled={busy}
            onChange={(event) => { const files = [...(event.target.files ?? [])]; event.target.value = ""; if (files.length) void run(files, "image"); }} />
        </label>
        <label className={`btn btn-quiet cursor-pointer ${busy ? "pointer-events-none opacity-60" : ""}`}>
          Upload video
          <input type="file" accept="video/mp4,.mp4" multiple className="sr-only" disabled={busy}
            onChange={(event) => { const files = [...(event.target.files ?? [])]; event.target.value = ""; if (files.length) void run(files, "video"); }} />
        </label>
      </PageHeader>

      {jobs.length > 0 && (
        <ul className="card mb-6 divide-y divide-line" aria-live="polite">
          {jobs.map((job) => (
            <li key={job.key} className="px-4 py-3">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium truncate">{job.name}</span>
                <span className={job.state === "error" ? "text-danger" : "text-muted"}>{job.state === "active" || job.state === "queued" ? `${job.progress}%` : job.detail}</span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-line overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={job.progress} aria-label={job.name}>
                <div className={`h-full ${job.state === "error" ? "bg-danger" : "bg-ink"}`} style={{ width: `${job.progress}%` }} />
              </div>
              {job.state === "error" ? <p className="text-sm text-danger mt-2">{job.detail}</p> : null}
            </li>
          ))}
        </ul>
      )}

      {!data ? (
        <LoadingBlock label={error || "Loading…"} />
      ) : data.length === 0 ? (
        <EmptyState title="No images yet">
          Upload a JPG, PNG, or WebP, or an H.264 MP4. Menus exported from Canva at 1920 × 1080 work well.
        </EmptyState>
      ) : (
        <>
          <div className="grid gap-3 mb-4 lg:grid-cols-[minmax(0,1fr)_11rem_auto] lg:items-center">
            <input className="field" aria-label="Search media" placeholder="Search files" value={query} onChange={(event) => setQuery(event.target.value)} />
            <select className="field" aria-label="Sort media" value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="name">Name</option>
              <option value="size">Size</option>
              <option value="duration">Duration</option>
            </select>
            <div className="flex gap-2" role="group" aria-label="Layout">
              <button type="button" className={`btn ${view === "grid" ? "btn-pressed" : "btn-quiet"}`} aria-pressed={view === "grid"} onClick={() => setView("grid")}>Grid</button>
              <button type="button" className={`btn ${view === "list" ? "btn-pressed" : "btn-quiet"}`} aria-pressed={view === "list"} onClick={() => setView("list")}>List</button>
            </div>
          </div>
          {visible.length === 0 ? (
            <EmptyState title="No files match that search">Try another name, or clear the search.</EmptyState>
          ) : view === "grid" ? (
            <ul className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              {visible.map((item) => (
                <li key={item.id} className="card overflow-hidden flex flex-col">
                  <Thumb item={item} />
                  <div className="p-3 flex flex-col gap-2 flex-1">
                    <p className="text-sm font-medium break-words">{item.fileName}</p>
                    <Meta item={item} />
                    <button type="button" className="btn btn-quiet text-danger mt-auto" onClick={() => remove(item)}>Delete</button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="grid gap-3">
              {visible.map((item) => (
                <li key={item.id} className="card p-3 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="w-full sm:w-36 shrink-0"><Thumb item={item} /></div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium break-words">{item.fileName}</p>
                    <div className="mt-1"><Meta item={item} /></div>
                  </div>
                  <button type="button" className="btn btn-quiet text-danger" onClick={() => remove(item)}>Delete</button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {toast.node}
      {confirm.node}
    </section>
  );
}

export default function MediaPage() {
  return <MediaLibrary />;
}

function Thumb({ item }: { item: MediaItem }) {
  const poster = item.thumbnailUrl || undefined;
  return item.kind === "video" ? (
    <video poster={poster} src={item.url || undefined} muted playsInline preload="none" controls className="block aspect-video w-full bg-black object-contain" />
  ) : (
    <a href={item.url ?? undefined} target="_blank" rel="noreferrer" className="block aspect-video bg-black overflow-hidden">
      {item.url ? <img src={item.url} alt="" className="size-full object-contain" loading="lazy" /> : null}
    </a>
  );
}

function Meta({ item }: { item: MediaItem }) {
  return (
    <p className="text-xs text-muted flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="badge">{item.kind === "video" ? "Video" : "Image"}</span>
      <span>
        {item.kind === "video" && item.durationMs ? `${formatDuration(item.durationMs)} · ` : ""}
        {formatSize(item.sizeBytes)}
      </span>
      {item.usedIn && item.usedIn.length > 0 ? <span>In {formatNameList(item.usedIn.map((playlist) => playlist.name))}</span> : null}
    </p>
  );
}

function sortMedia(items: MediaItem[], query: string, sort: SortKey) {
  const needle = query.trim().toLowerCase();
  const filtered = needle ? items.filter((item) => item.fileName.toLowerCase().includes(needle)) : items.slice();
  filtered.sort((a, b) => {
    if (sort === "name") return a.fileName.localeCompare(b.fileName);
    if (sort === "size") return b.sizeBytes - a.sizeBytes;
    if (sort === "oldest") return Date.parse(a.createdAt) - Date.parse(b.createdAt);
    if (sort === "duration") return (b.durationMs ?? -1) - (a.durationMs ?? -1);
    return Date.parse(b.createdAt) - Date.parse(a.createdAt);
  });
  return filtered;
}

async function uploadImage(file: File, onProgress: (progress: number, detail: string) => void) {
  if (!TYPES.includes(file.type)) throw new Error("Choose a JPG, PNG, or WebP image.");
  if (file.size > MAX) throw new Error("Images must be 15 MB or smaller.");
  onProgress(5, "Preparing image…");
  const blob = await prepareImage(file);
  onProgress(15, "Uploading…");
  const form = new FormData();
  form.append("file", blob, "image.jpg");
  form.append("name", file.name);
  const token = await authToken();
  await uploadForm("/api/media", form, token, (progress) => onProgress(Math.max(15, progress), "Uploading…"));
}

async function uploadVideo(file: File, onProgress: (progress: number, detail: string) => void) {
  onProgress(0, "Checking video…");
  const prepared = await prepareVideo(file);
  onProgress(5, "Uploading video…");
  const signed = await api<{ mediaId: string; signedUrl: string }>("/api/media/upload", {
    method: "POST",
    body: JSON.stringify({ fileName: file.name, sizeBytes: file.size }),
  });
  await uploadToSignedUrl(signed.signedUrl, file, (progress) => onProgress(Math.max(5, Math.min(90, progress)), "Uploading video…"));
  onProgress(92, "Saving…");
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
  onProgress(100, "Uploaded");
}
