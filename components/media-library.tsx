"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, formatDuration, formatSize, useApi, type MediaItem } from "@/lib/api";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";
import { useUploads } from "@/components/uploads";
import { IconImage } from "@/components/icons";
import { EmptyState, LoadingBlock, PageHeader, formatNameList } from "@/components/ui";

type SortKey = "newest" | "oldest" | "name" | "size" | "duration";

export function MediaLibrary({ fixture }: { fixture?: MediaItem[] }) {
  const live = useApi<MediaItem[]>(fixture ? null : "/api/media");
  const data = fixture ?? live.data;
  const error = fixture ? null : live.error;
  const reload = live.reload;
  const uploads = useUploads();
  const [view, setView] = useState<"grid" | "list">("grid");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const toast = useToast();
  const confirm = useConfirm();
  const wasBusy = useRef(false);

  useEffect(() => {
    if (fixture) return;
    if (wasBusy.current && !uploads.busy) void reload();
    wasBusy.current = uploads.busy;
  }, [uploads.busy, fixture, reload]);

  const visible = useMemo(() => sortMedia(data ?? [], query, sort), [data, query, sort]);

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
      <PageHeader title="Media library" icon={<IconImage />} lede="Images up to 15 MB. Video is MP4 H.264, 50 MB or smaller, 0.5 seconds to 3 minutes, and 1920 pixels or less on each edge.">
        <label className={`btn btn-primary cursor-pointer ${uploads.busy ? "pointer-events-none opacity-60" : ""}`}>
          Upload image
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" disabled={uploads.busy}
            onChange={(event) => { const files = [...(event.target.files ?? [])]; event.target.value = ""; if (files.length) uploads.enqueue(files, "image"); }} />
        </label>
        <Link href="/dashboard/media/menus" className="btn btn-quiet">Make a menu board</Link>
        <label className={`btn btn-quiet cursor-pointer ${uploads.busy ? "pointer-events-none opacity-60" : ""}`}>
          Upload video
          <input type="file" accept="video/mp4,.mp4" multiple className="sr-only" disabled={uploads.busy}
            onChange={(event) => { const files = [...(event.target.files ?? [])]; event.target.value = ""; if (files.length) uploads.enqueue(files, "video"); }} />
        </label>
      </PageHeader>

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
            <ul data-media-library="" className="grid grid-cols-2 lg:grid-cols-3 gap-4">
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
            <ul data-media-library="" className="grid gap-3">
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
