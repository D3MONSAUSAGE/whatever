"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, type PlaylistSummary, type PresentationDetail } from "@/lib/api";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";
import { LoadState, PageHeader, formatNameList } from "@/components/ui";
import { IconImage } from "@/components/icons";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase-browser";
import { assetPathFromUrl, rememberSlideSrc, type SlideSrcScope } from "@/lib/slide-src-cache";

export function PresentationDetailView({ id, fixture }: { id?: string; fixture?: PresentationDetail }) {
  const [data, setData] = useState<PresentationDetail | null>(fixture ?? null);
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState("10");
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [preview, setPreview] = useState(0);
  const [stageReady, setStageReady] = useState(false);
  const [lists, setLists] = useState<PlaylistSummary[] | null>(null);
  const [playlistId, setPlaylistId] = useState("");
  const [viewer, setViewer] = useState<SlideSrcScope | null>(null);
  const toast = useToast();
  const confirm = useConfirm();
  const router = useRouter();

  useEffect(() => {
    if (fixture || !id) return;
    let stop = false;
    api<PresentationDetail>(`/api/media/presentation/${id}`)
      .then((next) => { if (!stop) { setData(next); setError(null); } })
      .catch((err) => { if (!stop) setError((err as Error).message); });
    return () => { stop = true; };
  }, [fixture, id]);

  useEffect(() => {
    if (!data) return;
    setSeconds(String(Math.round(data.defaultDurationMs / 1000)));
    const next: Record<string, string> = {};
    for (const slide of data.slides) next[slide.id] = slide.durationMs == null ? "" : String(Math.round(slide.durationMs / 1000));
    setOverrides(next);
  }, [data]);

  useEffect(() => { setStageReady(false); }, [preview, data?.id]);

  useEffect(() => {
    const orgId = data?.accountId;
    if (!orgId || fixture) {
      setViewer(null);
      return;
    }
    let stop = false;
    getSupabase().auth.getSession().then(({ data: session }) => {
      const userId = session.session?.user.id;
      if (!stop && userId) setViewer({ userId, orgId });
    }).catch(() => undefined);
    return () => { stop = true; };
  }, [data?.accountId, fixture]);

  useEffect(() => {
    const next = data?.slides[(preview + 1) % Math.max(data.slides.length, 1)];
    const src = next ? slideSrc(viewer, next.url, "full") : null;
    if (!src) return;
    const img = new Image();
    img.src = src;
  }, [data, preview, viewer]);

  async function save() {
    if (!data) return;
    const defaultDurationMs = Math.round(Number(seconds) * 1000);
    const slides = data.slides.map((slide) => ({
      id: slide.id,
      durationMs: overrides[slide.id]?.trim() ? Math.round(Number(overrides[slide.id]) * 1000) : null,
    }));
    try {
      const next = await api<PresentationDetail>(`/api/media/presentation/${data.id}`, {
        method: "PATCH",
        body: JSON.stringify({ defaultDurationMs, slides }),
      });
      setData(next);
      toast.show("Saved");
    } catch (err) {
      toast.show((err as Error).message, true);
    }
  }

  async function addPicked() {
    if (!data) return;
    const ids = data.slides.filter((slide) => picked[slide.id]).map((slide) => slide.id);
    if (!ids.length) {
      toast.show("Select at least one slide.", true);
      return;
    }
    if (!lists) {
      try { setLists(await api<PlaylistSummary[]>("/api/playlists")); } catch (err) { toast.show((err as Error).message, true); return; }
    }
    const target = playlistId;
    if (!target) {
      toast.show("Choose a playlist first.", true);
      return;
    }
    try {
      const playlist = await api<{ items: { mediaId: string; durationMs: number | null }[]; name: string; transition: string; playbackMode: string; defaultDurationMs: number }>(`/api/playlists/${target}`);
      const items = [
        ...playlist.items.map((item) => ({ mediaId: item.mediaId, durationMs: item.durationMs })),
        ...ids.map((mediaId) => ({ mediaId, durationMs: null })),
      ];
      await api(`/api/playlists/${target}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: playlist.name,
          transition: playlist.transition,
          playbackMode: playlist.playbackMode,
          defaultDurationMs: playlist.defaultDurationMs,
          items,
        }),
      });
      toast.show("Slides added to the playlist draft");
      setPicked({});
    } catch (err) {
      toast.show((err as Error).message, true);
    }
  }

  async function remove() {
    if (!data) return;
    const names = formatNameList(data.usedIn.map((playlist) => playlist.name));
    const ok = await confirm.ask({
      title: "Delete this presentation?",
      body: data.usedIn.length
        ? `Delete “${data.fileName}”? It will be removed from ${names}, including slides added on their own.`
        : `Delete “${data.fileName}” and its slides?`,
      confirmLabel: "Delete presentation",
      danger: true,
    });
    if (ok !== true) return;
    await api(`/api/media/${data.id}?detach=1`, { method: "DELETE" });
    router.push("/dashboard/media");
  }

  if (!data) return <PresentationSkeleton error={error} />;
  const count = data.slides.length;
  const current = data.slides[preview];
  const stageSrc = current ? slideSrc(viewer, current.url, "full") : null;
  return (
    <section className="min-w-0 overflow-x-hidden" data-presentation-detail="">
      <PageHeader title={data.fileName} icon={<IconImage />} lede={`${data.slideCount} slides · uploaded ${data.createdAt ? new Date(data.createdAt).toLocaleDateString() : ""} · ${statusLabel(data.processingStatus)}`}>
        <Link href="/dashboard/media" className="btn btn-quiet">Back to library</Link>
      </PageHeader>
      {data.processingError ? <p className="mb-4 text-sm text-danger">{data.processingError}</p> : null}
      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <div className="relative flex min-h-48 items-center justify-center overflow-hidden rounded-md border border-ink bg-black">
            {stageSrc && !stageReady ? <div className="absolute inset-0 animate-pulse bg-white/10" /> : null}
            {stageSrc ? (
              <img src={stageSrc} alt="" onLoad={() => setStageReady(true)} className={`max-h-[70vh] w-auto max-w-full object-contain ${stageReady ? "" : "opacity-0"}`} />
            ) : (
              <p className="grid min-h-48 place-items-center text-sm text-white/70">No preview yet</p>
            )}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button type="button" className="btn min-h-12 min-w-12 px-4" aria-label="Previous slide" onClick={() => setPreview((index) => (index - 1 + count) % Math.max(count, 1))}>Prev</button>
            <p className="min-w-0 flex-1 text-center text-sm">{count ? `Slide ${preview + 1} of ${count}` : "Processing"}</p>
            <button type="button" className="btn min-h-12 min-w-12 px-4" aria-label="Next slide" onClick={() => setPreview((index) => (index + 1) % Math.max(count, 1))}>Next</button>
          </div>
          <p className="mt-2 min-w-0 break-words text-sm [overflow-wrap:anywhere]" title={current?.fileName ?? ""}>{current?.fileName ?? ""}</p>
          <label className="mt-4 grid w-full max-w-xs gap-1">
            <span className="text-sm">Default seconds for each slide</span>
            <input className="field w-full" type="number" min={3} max={3600} aria-label="Default seconds" value={seconds} onChange={(event) => setSeconds(event.target.value)} />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" onClick={() => void save()}>Save times</button>
            <button type="button" className="btn btn-quiet text-danger" onClick={() => void remove()}>Delete</button>
          </div>
          <div className="mt-4 flex max-w-full gap-2 overflow-x-auto overscroll-x-contain pb-1" aria-label="Slides">
            {data.slides.map((slide, index) => {
              const thumb = slideSrc(viewer, slide.thumbnailUrl ?? null, "thumb");
              return (
                <button key={slide.id} type="button" aria-label={`Show slide ${index + 1}`} aria-current={index === preview} className={`h-16 w-16 shrink-0 overflow-hidden rounded border bg-black ${index === preview ? "border-primary" : "border-ink"}`} onClick={() => setPreview(index)}>
                  {thumb ? <img src={thumb} alt="" className="size-full object-contain" /> : <span className="grid size-full place-items-center text-xs text-white">{index + 1}</span>}
                </button>
              );
            })}
          </div>
        </div>
        <div className="min-w-0">
          <h2 className="font-semibold mb-2">Slide times</h2>
          <ul className="grid gap-3">
            {data.slides.map((slide, index) => (
              <li key={slide.id} className="card min-w-0 p-3">
                <p className="min-w-0 break-words font-medium [overflow-wrap:anywhere]" title={slide.fileName}>{index + 1}. {slide.fileName}</p>
                <p className="text-xs text-muted">{slide.width && slide.height ? `${slide.width}×${slide.height}` : ""}</p>
                <label className="mt-2 grid gap-1">
                  <span className="text-xs text-muted">Seconds (blank uses the default)</span>
                  <input className="field w-full" type="number" min={3} max={3600} aria-label={`Seconds for slide ${index + 1}`} value={overrides[slide.id] ?? ""}
                    onChange={(event) => setOverrides({ ...overrides, [slide.id]: event.target.value })} />
                </label>
                <label className="mt-2 flex min-w-0 items-center gap-2 text-sm">
                  <input type="checkbox" className="size-4 shrink-0" checked={!!picked[slide.id]} aria-label={`Select ${slide.fileName}`}
                    onChange={(event) => setPicked({ ...picked, [slide.id]: event.target.checked })} />
                  <span className="min-w-0">Use this slide on its own</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex min-w-0 flex-wrap items-center gap-2">
            <select className="field w-full max-w-full sm:max-w-xs" aria-label="Playlist for selected slides" value={playlistId} onFocus={() => { if (!lists) void api<PlaylistSummary[]>("/api/playlists").then(setLists).catch(() => undefined); }} onChange={(event) => setPlaylistId(event.target.value)}>
              <option value="">Choose a playlist</option>
              {(lists ?? []).map((playlist) => <option key={playlist.id} value={playlist.id}>{playlist.name}</option>)}
            </select>
            <button type="button" className="btn btn-quiet" onClick={() => void addPicked()}>Add selected slides</button>
          </div>
        </div>
      </div>
      {toast.node}
      {confirm.node}
    </section>
  );
}

function PresentationSkeleton({ error }: { error: string | null }) {
  if (error) return <LoadState error={error} label="Loading presentation…" />;
  return (
    <section className="min-w-0" data-presentation-detail="" aria-busy="true">
      <p className="sr-only">Loading presentation…</p>
      <div className="mb-6 h-28 animate-pulse rounded-2xl bg-ink/10" />
      <div className="mx-auto h-64 max-h-[70vh] w-full max-w-3xl animate-pulse rounded-md bg-ink/10" />
      <div className="mt-3 h-12 animate-pulse rounded-md bg-ink/10" />
    </section>
  );
}

function slideSrc(viewer: SlideSrcScope | null, fresh: string | null, kind: "full" | "thumb") {
  if (!fresh || !viewer) return fresh;
  return rememberSlideSrc(viewer, assetPathFromUrl(fresh), kind, fresh);
}

function statusLabel(status: string) {
  if (status === "processing") return "Processing";
  if (status === "failed") return "Failed";
  if (status === "pending") return "Waiting";
  return "Ready";
}
