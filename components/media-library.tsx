"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, formatDuration, formatSize, type MediaItem, type PlaylistSummary } from "@/lib/api";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";
import { useUploads } from "@/components/uploads";
import { IconImage } from "@/components/icons";
import { EmptyState, LoadState, PageHeader, formatNameList } from "@/components/ui";
import { MAX_VIDEO_MB } from "@/lib/mp4";

type SortKey = "newest" | "oldest" | "name" | "size" | "duration";

type KindKey = "" | "image" | "video" | "presentation" | "upload" | "menu" | "promo";

function readKind(value: string | null): KindKey {
  if (value === "image" || value === "video" || value === "presentation" || value === "upload" || value === "menu" || value === "promo") return value;
  return "";
}
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
    const p = new URLSearchParams({ limit: String(MEDIA_PAGE_SIZE), offset: String(offset), sort, grouped: "1" });
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

export function MediaLibrary({ fixture, pathOverride }: { fixture?: MediaItem[]; pathOverride?: string }) {
  const uploads = useUploads();
  const router = useRouter();
  const pathname = usePathname();
  const [view, setView] = useState<"grid" | "list">("grid");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [kind, setKind] = useState<KindKey>(pathOverride?.includes("kind=presentation") ? "presentation" : "");
  const [unused, setUnused] = useState(false);
  const applyKind = useCallback((next: KindKey) => setKind(next), []);
  const live = usePagedMedia(!fixture, query, sort, kind, unused);
  const data = fixture ?? live.page?.items ?? null;
  const error = fixture ? null : live.error;
  const reload = live.reload;
  const toast = useToast();
  const confirm = useConfirm();
  const wasBusy = useRef(false);
  const [renaming, setRenaming] = useState<MediaItem | null>(null);
  const [adding, setAdding] = useState<MediaItem | null>(null);

  useEffect(() => {
    if (fixture) return;
    if (wasBusy.current && !uploads.busy) void reload();
    wasBusy.current = uploads.busy;
  }, [uploads.busy, fixture, reload]);

  const visible = useMemo(() => {
    const rows = fixture ? sortMedia(fixture, query, sort) : data ?? [];
    const owned = rows.filter((item) => !item.sourceMediaId);
    if (!fixture || !kind) return owned;
    if (kind === "image") return owned.filter((item) => item.kind !== "video" && item.kind !== "presentation");
    return owned.filter((item) => item.kind === kind);
  }, [fixture, data, query, sort, kind]);
  const libraryEmpty = fixture ? fixture.length === 0 : live.page !== null && live.page.total === 0 && !live.filtering;

  async function remove(item: MediaItem) {
    const used = item.usedIn ?? [];
    if (item.kind === "presentation") {
      const names = formatNameList(used.map((playlist) => playlist.name));
      const ok = await confirm.ask({
        title: "Delete this presentation?",
        body: used.length
          ? `Delete “${item.fileName}” and its ${item.slideCount ?? ""} slides? It will be removed from ${names}. Screens drop it the next time they check in.`
          : `Delete “${item.fileName}” and its slides? This cannot be undone.`,
        confirmLabel: "Delete presentation",
        danger: true,
      });
      if (ok !== true) return;
      try {
        await api(`/api/media/${item.id}?detach=1`, { method: "DELETE" });
        toast.show("Deleted");
        reload();
      } catch (err) {
        toast.show((err as Error).message, true);
      }
      return;
    }
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
      <PageHeader title="Media library" icon={<IconImage />} lede={`Images up to 15 MB. Video is MP4 H.264, ${MAX_VIDEO_MB} MB or smaller. A PowerPoint or PDF becomes one presentation: ordered slides, 10 seconds each unless you change it.`}
        action={
          <label className={`btn btn-primary cursor-pointer ${uploads.busy ? "pointer-events-none opacity-60" : ""}`}>
            Upload image
            <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" disabled={uploads.busy}
              onChange={(event) => { const files = [...(event.target.files ?? [])]; event.target.value = ""; if (files.length) uploads.enqueue(files, "image"); }} />
          </label>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <label className={`btn btn-quiet cursor-pointer ${uploads.busy ? "pointer-events-none opacity-60" : ""}`}>
          Upload video
          <input type="file" accept="video/mp4,.mp4" multiple className="sr-only" disabled={uploads.busy}
            onChange={(event) => { const files = [...(event.target.files ?? [])]; event.target.value = ""; if (files.length) uploads.enqueue(files, "video"); }} />
        </label>
        <label className={`btn btn-quiet cursor-pointer ${uploads.busy ? "pointer-events-none opacity-60" : ""}`}>
          Upload presentation
          <input type="file" accept=".pptx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation" className="sr-only" disabled={uploads.busy}
            onChange={(event) => { const files = [...(event.target.files ?? [])]; event.target.value = ""; if (files.length) uploads.enqueue(files, "presentation"); }} />
        </label>
      </div>
      {fixture || pathOverride ? null : (
        <Suspense fallback={null}>
          <KindSync onKind={applyKind} />
        </Suspense>
      )}

      {!data ? (
        <LoadState error={error} label="Loading…" />
      ) : libraryEmpty ? (
        <EmptyState title="No images yet">
          Upload a JPG, PNG, WebP, H.264 MP4, PowerPoint (.pptx), or PDF. Menus exported from Canva at 1920 × 1080 work well.
        </EmptyState>
      ) : (
        <>
          <div className="grid gap-3 mb-4 lg:grid-cols-[minmax(0,1fr)_11rem_11rem_auto_auto] lg:items-center">
            <input className="field" type="search" aria-label="Search media" placeholder="Search files" value={query} onChange={(event) => setQuery(event.target.value)} />
            {!fixture ? (
              <select className="field" aria-label="Show" value={kind} onChange={(event) => {
                const next = event.target.value as KindKey;
                setKind(next);
                const nextParams = new URLSearchParams(window.location.search);
                if (next) nextParams.set("kind", next);
                else nextParams.delete("kind");
                const q = nextParams.toString();
                router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
              }}>
                <option value="">All files</option>
                <option value="image">Images</option>
                <option value="video">Videos</option>
                <option value="presentation">Presentations</option>
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
                    <ItemActions item={item} onDelete={() => remove(item)} onRename={() => setRenaming(item)} onAdd={() => setAdding(item)} />
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
                  <ItemActions item={item} onDelete={() => remove(item)} onRename={() => setRenaming(item)} onAdd={() => setAdding(item)} />
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
      {renaming ? <RenameDialog item={renaming} onClose={() => setRenaming(null)} onSaved={() => { setRenaming(null); toast.show("Renamed"); reload(); }} /> : null}
      {adding ? <AddToPlaylist item={adding} onClose={() => setAdding(null)} onAdded={() => { setAdding(null); toast.show("Added to playlist"); reload(); }} /> : null}
      {toast.node}
      {confirm.node}
    </section>
  );
}

function KindSync({ onKind }: { onKind: (kind: KindKey) => void }) {
  const params = useSearchParams();
  const kindQuery = params.get("kind");
  useEffect(() => { onKind(readKind(kindQuery)); }, [kindQuery, onKind]);
  return null;
}

export default function MediaPage() {
  return <MediaLibrary />;
}

function Thumb({ item }: { item: MediaItem }) {
  const poster = item.thumbnailUrl || undefined;
  if (item.kind === "video") {
    return <video poster={poster} src={item.url || undefined} muted playsInline preload="none" controls className="block aspect-video w-full bg-black object-contain" />;
  }
  if (item.kind === "presentation") {
    const cover = item.thumbnailUrl || item.coverUrl;
    return (
      <Link href={`/dashboard/media/presentations/${item.id}`} className="relative block aspect-video w-full overflow-hidden bg-black" data-presentation-card="">
        {cover ? <img src={cover} alt="" className="size-full object-contain" /> : <span className="grid size-full place-items-center text-sm text-white">Presentation</span>}
        <span className="absolute left-2 top-2 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-white">Presentation</span>
      </Link>
    );
  }
  return (
    <a href={item.url ?? undefined} target="_blank" rel="noreferrer" className="block aspect-video bg-black overflow-hidden">
      {item.url ? <img src={item.url} alt="" className="size-full object-contain" loading="lazy" /> : null}
    </a>
  );
}

function Meta({ item }: { item: MediaItem }) {
  const when = item.createdAt ? new Date(item.createdAt).toLocaleDateString() : "";
  const status = item.processingStatus === "processing" ? "Processing" : item.processingStatus === "failed" ? "Failed" : item.kind === "presentation" ? "Ready" : "";
  return (
    <p className="text-xs text-muted flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="badge">{item.kind === "video" ? "Video" : item.kind === "presentation" ? "Presentation" : item.slideIndex != null ? `Slide ${(item.slideIndex ?? 0) + 1}` : "Image"}</span>
      {item.kind === "presentation" ? (
        <span>{item.slideCount ?? 0} slides · {Math.round((item.defaultDurationMs ?? 10000) / 1000)}s each{status ? ` · ${status}` : ""}{when ? ` · ${when}` : ""}</span>
      ) : (
        <span>
          {item.kind === "video" && item.durationMs ? `${formatDuration(item.durationMs)} · ` : ""}
          {formatSize(item.sizeBytes)}
        </span>
      )}
      {item.usedIn && item.usedIn.length > 0 ? <span>In {formatNameList(item.usedIn.map((playlist) => playlist.name))}</span> : null}
    </p>
  );
}

function ItemActions({ item, onDelete, onRename, onAdd }: { item: MediaItem; onDelete: () => void; onRename: () => void; onAdd: () => void }) {
  if (item.kind !== "presentation") {
    return <button type="button" className="btn btn-quiet text-danger mt-auto" onClick={onDelete}>Delete</button>;
  }
  return (
    <div className="mt-auto flex flex-wrap gap-2">
      <Link href={`/dashboard/media/presentations/${item.id}`} className="btn btn-quiet">Preview</Link>
      <button type="button" className="btn btn-quiet" onClick={onRename}>Rename</button>
      <button type="button" className="btn btn-quiet" onClick={onAdd} disabled={item.processingStatus === "processing" || item.processingStatus === "failed"}>Add to playlist</button>
      <button type="button" className="btn btn-quiet text-danger" onClick={onDelete}>Delete</button>
    </div>
  );
}

function RenameDialog({ item, onClose, onSaved }: { item: MediaItem; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(item.fileName);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    try {
      await api(`/api/media/presentation/${item.id}`, { method: "PATCH", body: JSON.stringify({ name }) });
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    }
  }
  return (
    <div className="fixed inset-0 z-50 bg-ink/50 flex items-end md:items-center justify-center" onClick={onClose}>
      <div role="dialog" aria-label="Rename presentation" className="bg-paper w-full md:max-w-md rounded-t-2xl md:rounded-2xl p-5" onClick={(event) => event.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-3">Rename presentation</h2>
        <input className="field" aria-label="Presentation name" value={name} onChange={(event) => setName(event.target.value)} />
        {error ? <p className="text-sm text-danger mt-2">{error}</p> : null}
        <div className="mt-4 flex gap-2">
          <button type="button" className="btn btn-primary" onClick={() => void save()}>Save</button>
          <button type="button" className="btn btn-quiet" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function AddToPlaylist({ item, onClose, onAdded }: { item: MediaItem; onClose: () => void; onAdded: () => void }) {
  const [lists, setLists] = useState<PlaylistSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playlistId, setPlaylistId] = useState("");
  useEffect(() => {
    void api<PlaylistSummary[]>("/api/playlists").then(setLists).catch((err) => setError((err as Error).message));
  }, []);
  async function add() {
    try {
      await api(`/api/media/presentation/${item.id}/playlist`, {
        method: "POST",
        body: JSON.stringify({ asGroup: true, playlistId: playlistId || undefined, name: playlistId ? undefined : item.fileName.replace(/\.pptx$/i, "").replace(/\.pdf$/i, "") }),
      });
      onAdded();
    } catch (err) {
      setError((err as Error).message);
    }
  }
  return (
    <div className="fixed inset-0 z-50 bg-ink/50 flex items-end md:items-center justify-center" onClick={onClose}>
      <div role="dialog" aria-label="Add presentation to playlist" className="bg-paper w-full md:max-w-md rounded-t-2xl md:rounded-2xl p-5" onClick={(event) => event.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-3">Add to playlist</h2>
        <p className="text-sm text-muted mb-3">The presentation is one item. Screens play its slides in order, then continue.</p>
        <select className="field" aria-label="Playlist" value={playlistId} onChange={(event) => setPlaylistId(event.target.value)}>
          <option value="">New playlist</option>
          {(lists ?? []).map((playlist) => <option key={playlist.id} value={playlist.id}>{playlist.name}</option>)}
        </select>
        {error ? <p className="text-sm text-danger mt-2">{error}</p> : null}
        <div className="mt-4 flex gap-2">
          <button type="button" className="btn btn-primary" onClick={() => void add()}>Add</button>
          <button type="button" className="btn btn-quiet" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
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
