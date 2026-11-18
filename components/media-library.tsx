"use client";
import { Dialog } from "@/components/dialog";
import Link from "next/link";
import { useLocale, useT } from "@/lib/i18n/client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, formatDuration, formatSize, type MediaItem, type PlaylistSummary } from "@/lib/api";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";
import { useUploads } from "@/components/uploads";
import { IconImage } from "@/components/icons";
import { EmptyState, LoadState, PageHeader, formatNameList } from "@/components/ui";
import { FileUploadControl } from "@/components/file-upload";
import { mediaRename } from "@/lib/media-rename";
import { duplicateImagesMessage, duplicateMessage, libraryLookupUrl, lookupWithTimeout, sameLibraryImage, sameLibraryVideo } from "@/lib/media-dupes";

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
  /** U2-05-F1: show a change (a rename) in the grid at once, before the reload returns. */
  const patchItem = useCallback((id: string, patch: Partial<MediaItem>) => {
    setPage((current) => current ? { ...current, items: current.items.map((item) => item.id === id ? { ...item, ...patch } : item) } : current);
  }, []);
  return { page, error, reload, patchItem, loadMore, loadingMore: more, filtering: debounced !== "" || kind !== "" || unused };
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
  const t = useT();
  const { locale } = useLocale();
  const confirm = useConfirm();
  const [checking, setChecking] = useState(false);

  /**
   * QA B1-10 retest / U1-04e: before uploading a video or image that is already in the library, offer to
   * keep the existing one. Videos match on name and size, images on name (they are re-encoded on upload).
   * One question covers every duplicate in a multi-file pick; files that aren't duplicates always upload.
   */
  async function uploadChecked(picked: FileList | File[], kind: "video" | "image") {
    // Gother #105 low 2: the upload buttons stay disabled during the lookup and the prompt, so a second pick can't race.
    if (checking) return;
    setChecking(true);
    try { await checkThenUpload(Array.from(picked), kind); } finally { setChecking(false); }
  }

  async function checkThenUpload(files: File[], kind: "video" | "image") {
    const found = await Promise.all(files.map(async (file) => {
      // If the check fails or takes longer than a few seconds, upload as before.
      const page = await lookupWithTimeout((signal) => api<{ items: MediaItem[] }>(libraryLookupUrl(file.name, kind), { signal }));
      const hit = kind === "video" ? sameLibraryVideo(page?.items, file) : sameLibraryImage(page?.items, file);
      return hit ? file : null;
    }));
    const dupes = found.filter((file): file is File => Boolean(file));
    if (!dupes.length) { uploads.enqueue(files, kind); return; }
    const names = dupes.map((file) => file.name);
    const copy = await confirm.ask({
      title: t("ml.dupTitle"),
      body: kind === "video" ? duplicateMessage(names, t) : duplicateImagesMessage(names, t),
      confirmLabel: t("diu.dupCopy"),
      cancelLabel: t("diu.dupKeep"),
    });
    if (copy) { uploads.enqueue(files, kind); return; }
    const fresh = files.filter((file) => !dupes.includes(file));
    if (fresh.length) uploads.enqueue(fresh, kind);
    setQuery(dupes[0].name);
    const what = kind === "video" ? (dupes.length === 1 ? "video" : "videos") : (dupes.length === 1 ? "image" : "images");
    toast.show(t(`ml.kept.${what}`));
  }
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
      const names = formatNameList(used.map((playlist) => playlist.name), locale);
      const ok = await confirm.ask({
        title: t("ml.delPresTitle"),
        body: used.length
          ? t("ml.delPresUsed", { name: item.fileName, count: item.slideCount ?? "", names })
          : t("ml.delPresBody", { name: item.fileName }),
        confirmLabel: t("ml.delPres"),
        danger: true,
      });
      if (ok !== true) return;
      try {
        await api(`/api/media/${item.id}?detach=1`, { method: "DELETE" });
        toast.show(t("ml.deleted"));
        reload();
      } catch (err) {
        toast.show((err as Error).message, true);
      }
      return;
    }
    if (used.length) {
      const names = formatNameList(used.map((playlist) => playlist.name), locale);
      await confirm.ask({
        title: t("ml.inPlaylistTitle"),
        body: t(used.length === 1 ? "ml.usedBy" : "ml.usedByMany", { name: item.fileName, names }),
        cancelLabel: t("ml.close"),
      });
      return;
    }
    const ok = await confirm.ask({
      title: t("ml.delFileTitle"),
      body: t("ml.delFileBody", { name: item.fileName }),
      confirmLabel: t("ml.delFile"),
      danger: true,
    });
    if (ok !== true) return;
    try {
      await api(`/api/media/${item.id}`, { method: "DELETE" });
      toast.show(t("ml.deleted"));
      reload();
    } catch (err) {
      const message = (err as Error).message;
      if (/playlist/i.test(message)) {
        await confirm.ask({ title: t("ml.inPlaylistTitle"), body: message, cancelLabel: t("ml.close") });
      } else toast.show(message, true);
    }
  }

  return (
    <section>
      <PageHeader title={t("ml.title")} icon={<IconImage />} lede={t("ml.lede")} />
      <div className="mb-6 grid grid-cols-3 gap-3" data-testid="media-uploads">
        <FileUploadControl kind="image" multiple disabled={uploads.busy || checking} buttonClass={`btn btn-quiet cursor-pointer min-h-11 w-full ${uploads.busy || checking ? "pointer-events-none opacity-60" : ""}`} onFiles={(files) => void uploadChecked(files, "image")} />
        <FileUploadControl kind="video" multiple disabled={uploads.busy || checking} buttonClass={`btn btn-quiet cursor-pointer min-h-11 w-full ${uploads.busy || checking ? "pointer-events-none opacity-60" : ""}`} onFiles={(files) => void uploadChecked(files, "video")} />
        <FileUploadControl kind="document" disabled={uploads.busy || checking} buttonClass={`btn btn-quiet cursor-pointer min-h-11 w-full ${uploads.busy || checking ? "pointer-events-none opacity-60" : ""}`} onFiles={(files) => uploads.enqueue(files, "presentation")} />
      </div>
      {fixture || pathOverride ? null : (
        <Suspense fallback={null}>
          <KindSync onKind={applyKind} />
        </Suspense>
      )}

      {!data ? (
        <LoadState error={error} />
      ) : libraryEmpty ? (
        <EmptyState title={t("ml.emptyTitle")}>
          {t("ml.emptyBody")}
        </EmptyState>
      ) : (
        <>
          <div className="grid gap-3 mb-4 lg:grid-cols-[minmax(0,1fr)_11rem_11rem_auto_auto] lg:items-center">
            <input className="field" type="search" aria-label={t("ml.searchAria")} placeholder={t("ml.searchPh")} value={query} onChange={(event) => setQuery(event.target.value)} />
            {!fixture ? (
              <select className="field" aria-label={t("ml.show")} value={kind} onChange={(event) => {
                const next = event.target.value as KindKey;
                setKind(next);
                const nextParams = new URLSearchParams(window.location.search);
                if (next) nextParams.set("kind", next);
                else nextParams.delete("kind");
                const q = nextParams.toString();
                router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
              }}>
                <option value="">{t("ml.allFiles")}</option>
                <option value="image">{t("ml.images")}</option>
                <option value="video">{t("ml.videos")}</option>
                <option value="presentation">{t("ml.presentations")}</option>
                <option value="upload">{t("ml.myUploads")}</option>
                <option value="menu">{t("ml.menuBoards")}</option>
                <option value="promo">{t("ml.promotions")}</option>
              </select>
            ) : null}
            <select className="field" aria-label={t("ml.sortAria")} value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>
              <option value="newest">{t("ml.newest")}</option>
              <option value="oldest">{t("ml.oldest")}</option>
              <option value="name">{t("ml.name")}</option>
              <option value="size">{t("ml.size")}</option>
              <option value="duration">{t("ml.duration")}</option>
            </select>
            {!fixture ? (
              <label className="flex items-center gap-2 text-sm whitespace-nowrap">
                <input type="checkbox" checked={unused} onChange={(event) => setUnused(event.target.checked)} /> {t("ml.unused")}
              </label>
            ) : null}
            <div className="flex gap-2" role="group" aria-label={t("ml.layoutAria")}>
              <button type="button" className={`btn ${view === "grid" ? "btn-pressed" : "btn-quiet"}`} aria-pressed={view === "grid"} onClick={() => setView("grid")}>{t("ml.grid")}</button>
              <button type="button" className={`btn ${view === "list" ? "btn-pressed" : "btn-quiet"}`} aria-pressed={view === "list"} onClick={() => setView("list")}>{t("ml.list")}</button>
            </div>
          </div>
          {visible.length === 0 ? (
            <EmptyState title={t("ml.noMatch")}>{t("ml.noMatchBody")}</EmptyState>
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
              <span>{t(live.page.total === 1 ? "ml.showingOne" : "ml.showing", { shown: visible.length, total: live.page.total })}</span>
              {live.page.nextOffset !== null ? (
                <button type="button" className="btn btn-quiet" disabled={live.loadingMore} onClick={() => void live.loadMore()}>
                  {live.loadingMore ? t("common.loading") : t("ml.loadMore")}
                </button>
              ) : null}
            </div>
          ) : null}
        </>
      )}
      {renaming ? <RenameDialog item={renaming} onClose={() => setRenaming(null)} onSaved={(fileName) => { setRenaming(null); live.patchItem(renaming.id, { fileName }); toast.show(t("media.renamed", { name: fileName })); void reload(); }} /> : null}
      {adding ? <AddToPlaylist item={adding} onClose={() => setAdding(null)} onAdded={() => { setAdding(null); toast.show(t("ml.added")); reload(); }} /> : null}
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
  const t = useT();
  const poster = item.thumbnailUrl || undefined;
  if (item.kind === "video") {
    return <video poster={poster} src={item.url || undefined} muted playsInline preload="none" controls className="block aspect-video w-full bg-black object-contain" />;
  }
  if (item.kind === "presentation") {
    const cover = item.thumbnailUrl || item.coverUrl;
    return (
      <Link href={`/dashboard/media/presentations/${item.id}`} className="relative block aspect-video w-full overflow-hidden bg-black" data-presentation-card="">
        {cover ? <img src={cover} alt="" className="size-full object-contain" /> : <span className="grid size-full place-items-center text-sm text-white">{t("ml.presentation")}</span>}
        <span className="absolute left-2 top-2 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-white">{t("ml.presentation")}</span>
      </Link>
    );
  }
  return (
    <a href={item.url ?? undefined} target="_blank" rel="noreferrer" aria-label={t("ml.openNewTab", { name: item.fileName })} className="block aspect-video bg-black overflow-hidden">
      {item.url ? <img src={item.url} alt="" className="size-full object-contain" loading="lazy" /> : null}
    </a>
  );
}

function Meta({ item }: { item: MediaItem }) {
  const t = useT();
  const { locale } = useLocale();
  const when = item.createdAt ? new Date(item.createdAt).toLocaleDateString(locale === "es" ? "es" : undefined) : "";
  const status = item.processingStatus === "processing" ? t("ml.processing") : item.processingStatus === "failed" ? t("ml.failed") : item.kind === "presentation" ? t("ml.ready") : "";
  return (
    <p className="text-xs text-muted flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="badge">{item.kind === "video" ? t("ml.video") : item.kind === "presentation" ? t("ml.presentation") : item.slideIndex != null ? t("ml.slideN", { n: (item.slideIndex ?? 0) + 1 }) : t("ml.image")}</span>
      {item.kind === "presentation" ? (
        <span>{t("ml.slidesEach", { count: item.slideCount ?? 0, secs: Math.round((item.defaultDurationMs ?? 10000) / 1000) })}{status ? ` · ${status}` : ""}{when ? ` · ${when}` : ""}</span>
      ) : (
        <span>
          {item.kind === "video" && item.durationMs ? `${formatDuration(item.durationMs)} · ` : ""}
          {formatSize(item.sizeBytes)}
        </span>
      )}
      {item.usedIn && item.usedIn.length > 0 ? <span>{t("ml.in", { names: formatNameList(item.usedIn.map((playlist) => playlist.name), locale) })}</span> : null}
    </p>
  );
}

function ItemActions({ item, onDelete, onRename, onAdd }: { item: MediaItem; onDelete: () => void; onRename: () => void; onAdd: () => void }) {
  const t = useT();
  if (item.kind !== "presentation") {
    return (
      <div className="mt-auto flex flex-wrap gap-2">
        <button type="button" className="btn btn-quiet" onClick={onRename} aria-label={t("ml.renameAria", { name: item.fileName })}>{t("ml.rename")}</button>
        <button type="button" className="btn btn-quiet text-danger" onClick={onDelete}>{t("ed.delete")}</button>
      </div>
    );
  }
  return (
    <div className="mt-auto flex flex-wrap gap-2">
      <Link href={`/dashboard/media/presentations/${item.id}`} className="btn btn-quiet">{t("ed.preview")}</Link>
      <button type="button" className="btn btn-quiet" onClick={onRename}>{t("ml.rename")}</button>
      <button type="button" className="btn btn-quiet" onClick={onAdd} disabled={item.processingStatus === "processing" || item.processingStatus === "failed"}>{t("ml.addToPlaylist")}</button>
      <button type="button" className="btn btn-quiet text-danger" onClick={onDelete}>{t("ed.delete")}</button>
    </div>
  );
}

function RenameDialog({ item, onClose, onSaved }: { item: MediaItem; onClose: () => void; onSaved: (fileName: string) => void }) {
  const t = useT();
  const presentation = item.kind === "presentation";

  const [name, setName] = useState(item.fileName);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function save() {
    if (busy) return;
    // U2-05: files keep their extension and storage path; only the name shown in Pekko changes.
    const checked = presentation ? null : mediaRename(item.fileName, name);
    if (checked && !checked.ok) { setError(t("ml.nameRequired")); return; }
    setBusy(true);
    setError(null);
    try {
      const wanted = checked?.ok ? checked.name : name.trim();
      const res = await api<{ fileName?: string; name?: string }>(presentation ? `/api/media/presentation/${item.id}` : `/api/media/${item.id}`, { method: "PATCH", body: JSON.stringify({ name: wanted }) });
      onSaved(res.fileName ?? res.name ?? wanted);
    } catch (err) {
      setError((err as Error).message || t("ml.renameFailed"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog onClose={onClose} label={presentation ? t("ml.renamePres") : t("ml.renameFile")} className="bg-paper w-full md:max-w-md rounded-t-2xl md:rounded-2xl p-5">
        <h2 className="text-lg font-semibold mb-3">{presentation ? t("ml.renamePres") : t("ml.renameFile")}</h2>
        <input className="field" aria-label={presentation ? t("ml.presName") : t("ml.fileName")} value={name} maxLength={200} autoFocus
          onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void save(); if (event.key === "Escape") onClose(); }} />
        {presentation ? null : <p className="text-xs text-muted mt-1">{t("ml.renameNote")}</p>}
        {error ? <p className="text-sm text-danger mt-2" role="alert">{error}</p> : null}
        <div className="mt-4 flex gap-2">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>{busy ? t("ed.saving") : t("ml.save")}</button>
          <button type="button" className="btn btn-quiet" onClick={onClose}>{t("ed.cancel")}</button>
        </div>
      </Dialog>
  );
}

function AddToPlaylist({ item, onClose, onAdded }: { item: MediaItem; onClose: () => void; onAdded: () => void }) {
  const t = useT();
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
    <Dialog onClose={onClose} label={t("ml.addPresAria")} className="bg-paper w-full md:max-w-md rounded-t-2xl md:rounded-2xl p-5">
        <h2 className="text-lg font-semibold mb-3">{t("ml.addToPlaylist")}</h2>
        <p className="text-sm text-muted mb-3">{t("ml.presentationOneItem")}</p>
        <select className="field" aria-label={t("ml.playlist")} value={playlistId} onChange={(event) => setPlaylistId(event.target.value)}>
          <option value="">{t("ml.newPlaylist")}</option>
          {(lists ?? []).map((playlist) => <option key={playlist.id} value={playlist.id}>{playlist.name}</option>)}
        </select>
        {error ? <p className="text-sm text-danger mt-2">{error}</p> : null}
        <div className="mt-4 flex gap-2">
          <button type="button" className="btn btn-primary" onClick={() => void add()}>{t("ml.add")}</button>
          <button type="button" className="btn btn-quiet" onClick={onClose}>{t("ed.cancel")}</button>
        </div>
      </Dialog>
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
