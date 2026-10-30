"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, formatDuration, formatSize, type MediaItem } from "@/lib/api";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";
import { useUploads } from "@/components/uploads";
import { IconImage } from "@/components/icons";
import { EmptyState, LoadState, PageHeader, formatNameList } from "@/components/ui";

type SortKey = "newest" | "oldest" | "name" | "size" | "duration";

type KindKey = "" | "image" | "video" | "upload" | "menu" | "promo";
type MediaPage = { items: MediaItem[]; total: number; offset: number; limit: number; nextOffset: number | null };
export const MEDIA_PAGE_SIZE = 48;

/** M14: the library asks the server for one page at a time (search, filters and sort run server-side). */
function usePagedMedia(enabled: boolean, query: string, sort: SortKey, kind: KindKey, unused: boolean) {
  const [debounced, setDebounced] = useState(query);
  const [page, setPage] = useState<MediaPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const seq = useRef(0);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);
  const url = useCallback((offset: number) => {
    const p = new URLSearchParams({ limit: String(MEDIA_PAGE_SIZE), offset: String(offset), sort });
    if (debounced) p.set("q", debounced);
    if (kind) p.set("kind", kind);
    if (unused) p.set("unused", "1");
    return `/api/media?${p}`;
  }, [debounced, sort, kind, unused]);
  const reload = useCallback(async () => {
    if (!enabled) return;
    const id = ++seq.current;
    try {
      const first = await api<MediaPage>(url(0));
      if (id === seq.current) { setPage(first); setError(null); }
    } catch (err) {
      if (id === seq.current) setError((err as Error).message);
    }
  }, [enabled, url]);
  useEffect(() => { void reload(); }, [reload]);
  const loadMore = useCallback(async () => {
    if (!page || page.nextOffset === null) return;
    setMore(true);
    const id = seq.current;
    try {
      const next = await api<MediaPage>(url(page.nextOffset));
      if (id === seq.current) setPage({ ...next, items: [...page.items, ...next.items.filter((n) => !page.items.some((o) => o.id === n.id))] });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setMore(false);
    }
  }, [page, url]);
  return { page, error, reload, loadMore, loadingMore: more, filtering: debounced !== "" || kind !== "" || unused };
}

export function MediaLibrary({ fixture }: { fixture?: MediaItem[] }) {
  const uploads = useUploads();
  const [view, setView] = useState<"grid" | "list">("grid");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [kind, setKind] = useState<KindKey>("");
  const [unused, setUnused] = useState(false);
  const live = usePagedMedia(!fixture, query, sort, kind, unused);
  const data = fixture ?? live.page?.items ?? null;
  const error = fixture ? null : live.error;
  const reload = live.reload;
  const toast = useToast();
  const confirm = useConfirm();
  const wasBusy = useRef(false);

  useEffect(() => {
    if (fixture) return;
    if (wasBusy.current && !uploads.busy) void reload();
    wasBusy.current = uploads.busy;
  }, [uploads.busy, fixture, reload]);

  const visible = useMemo(() => (fixture ? sortMedia(fixture, query, sort) : data ?? []), [fixture, data, query, sort]);
  const libraryEmpty = fixture ? fixture.length === 0 : live.page !== null && live.page.total === 0 && !live.filtering;

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
        <Link href="/dashboard/media/promos" className="btn btn-quiet">Make a promo</Link>
        <label className={`btn btn-quiet cursor-pointer ${uploads.busy ? "pointer-events-none opacity-60" : ""}`}>
          Upload video
          <input type="file" accept="video/mp4,.mp4" multiple className="sr-only" disabled={uploads.busy}
            onChange={(event) => { const files = [...(event.target.files ?? [])]; event.target.value = ""; if (files.length) uploads.enqueue(files, "video"); }} />
        </label>
      </PageHeader>

      {!data ? (
        <LoadState error={error} label="Loading…" />
      ) : libraryEmpty ? (
        <EmptyState title="No images yet">
          Upload a JPG, PNG, or WebP, or an H.264 MP4. Menus exported from Canva at 1920 × 1080 work well.
        </EmptyState>
      ) : (
        <>
          <div className="grid gap-3 mb-4 lg:grid-cols-[minmax(0,1fr)_11rem_11rem_auto_auto] lg:items-center">
            <input className="field" type="search" aria-label="Search media" placeholder="Search files" value={query} onChange={(event) => setQuery(event.target.value)} />
            {!fixture ? (
              <select className="field" aria-label="Show" value={kind} onChange={(event) => setKind(event.target.value as KindKey)}>
                <option value="">All files</option>
                <option value="image">Images</option>
                <option value="video">Videos</option>
                <option value="upload">My uploads</option>
                <option value="menu">Menu boards</option>
                <option value="promo">Promos</option>
              </select>
            ) : null}
            <select className="field" aria-label="Sort media" value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="name">Name</option>
              <option value="size">Size</option>
              <option value="duration">Duration</option>
            </select>
            {!fixture ? (
              <label className="flex items-center gap-2 text-sm whitespace-nowrap">
                <input type="checkbox" checked={unused} onChange={(event) => setUnused(event.target.checked)} /> Not in a playlist
              </label>
            ) : null}
            <div className="flex gap-2" role="group" aria-label="Layout">
              <button type="button" className={`btn ${view === "grid" ? "btn-pressed" : "btn-quiet"}`} aria-pressed={view === "grid"} onClick={() => setView("grid")}>Grid</button>
              <button type="button" className={`btn ${view === "list" ? "btn-pressed" : "btn-quiet"}`} aria-pressed={view === "list"} onClick={() => setView("list")}>List</button>
            </div>
          </div>
          {visible.length === 0 ? (
            <EmptyState title="No files match that search">Try another name, or clear the search and filters.</EmptyState>
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
          {!fixture && live.page ? (
            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-muted" data-testid="media-count">
              <span>Showing {visible.length} of {live.page.total} file{live.page.total === 1 ? "" : "s"}</span>
              {live.page.nextOffset !== null ? (
                <button type="button" className="btn btn-quiet" disabled={live.loadingMore} onClick={() => void live.loadMore()}>
                  {live.loadingMore ? "Loading…" : "Load more"}
                </button>
              ) : null}
            </div>
          ) : null}
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
