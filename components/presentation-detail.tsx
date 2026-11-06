"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, type PlaylistSummary, type PresentationDetail } from "@/lib/api";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";
import { LoadState, PageHeader, formatNameList } from "@/components/ui";
import { IconImage } from "@/components/icons";
import { useRouter } from "next/navigation";

export function PresentationDetailView({ id, fixture }: { id?: string; fixture?: PresentationDetail }) {
  const [data, setData] = useState<PresentationDetail | null>(fixture ?? null);
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState("10");
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [preview, setPreview] = useState(0);
  const [lists, setLists] = useState<PlaylistSummary[] | null>(null);
  const [playlistId, setPlaylistId] = useState("");
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

  useEffect(() => {
    if (!data || data.slides.length < 2 || data.processingStatus !== "ready") return;
    const slide = data.slides[preview];
    const own = overrides[slide?.id ?? ""];
    const ms = own && Number(own) >= 3 ? Number(own) * 1000 : Math.max(3000, Number(seconds) * 1000 || data.defaultDurationMs);
    const timer = window.setTimeout(() => setPreview((current) => (current + 1) % data.slides.length), ms);
    return () => window.clearTimeout(timer);
  }, [data, preview, overrides, seconds]);

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

  async function replaceFile(file: File) {
    if (!data) return;
    const started = await api<{ signedUrl: string }>(`/api/media/presentation/${data.id}/replace`, {
      method: "POST",
      body: JSON.stringify({ fileName: file.name, sizeBytes: file.size }),
    });
    const { uploadToSignedUrl } = await import("@/lib/prepare-video");
    await uploadToSignedUrl(started.signedUrl, file, () => undefined, file.name);
    await api("/api/media/presentation/complete", {
      method: "POST",
      body: JSON.stringify({ mediaId: data.id, fileName: file.name, replace: true, createPlaylist: false }),
    });
    setData(await api<PresentationDetail>(`/api/media/presentation/${data.id}`));
    toast.show("Presentation replaced");
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

  if (!data) return <LoadState error={error} label="Loading presentation…" />;
  const current = data.slides[preview];
  return (
    <section data-presentation-detail="">
      <PageHeader title={data.fileName} icon={<IconImage />} lede={`${data.slideCount} slides · uploaded ${data.createdAt ? new Date(data.createdAt).toLocaleDateString() : ""} · ${statusLabel(data.processingStatus)}`}>
        <Link href="/dashboard/media" className="btn btn-quiet">Back to library</Link>
      </PageHeader>
      {data.processingError ? <p className="mb-4 text-sm text-danger">{data.processingError}</p> : null}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div>
          <div className="relative aspect-video overflow-hidden rounded-md border border-ink bg-black">
            {current?.url ? <img src={current.url} alt="" className="size-full object-contain" /> : <p className="grid size-full place-items-center text-sm text-white/70">No preview yet</p>}
          </div>
          <p className="mt-2 text-sm text-muted">{data.slides.length ? `${preview + 1} / ${data.slides.length}` : "Processing"} · landscape and portrait stay fully visible</p>
          <label className="mt-4 grid max-w-xs gap-1">
            <span className="text-sm">Default seconds for each slide</span>
            <input className="field" type="number" min={3} max={3600} aria-label="Default seconds" value={seconds} onChange={(event) => setSeconds(event.target.value)} />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" onClick={() => void save()}>Save times</button>
            <label className="btn btn-quiet cursor-pointer">
              Replace file
              <input type="file" accept=".pptx,.pdf,application/pdf" className="sr-only" onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void replaceFile(file).catch((err) => toast.show((err as Error).message, true));
              }} />
            </label>
            <button type="button" className="btn btn-quiet text-danger" onClick={() => void remove()}>Delete</button>
          </div>
        </div>
        <div>
          <h2 className="font-semibold mb-2">Slides</h2>
          <ul className="grid gap-3">
            {data.slides.map((slide, index) => (
              <li key={slide.id} className="card p-3 grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3">
                <button type="button" className="block aspect-video overflow-hidden rounded bg-black" onClick={() => setPreview(index)}>
                  {slide.url ? <img src={slide.url} alt="" className="size-full object-contain" /> : null}
                </button>
                <div>
                  <p className="font-medium">{index + 1}. {slide.fileName}</p>
                  <p className="text-xs text-muted">{slide.width && slide.height ? `${slide.width}×${slide.height}` : ""}</p>
                  <label className="mt-2 grid gap-1">
                    <span className="text-xs text-muted">Seconds (blank uses the default)</span>
                    <input className="field" type="number" min={3} max={3600} aria-label={`Seconds for slide ${index + 1}`} value={overrides[slide.id] ?? ""}
                      onChange={(event) => setOverrides({ ...overrides, [slide.id]: event.target.value })} />
                  </label>
                  <label className="mt-2 flex items-center gap-2 text-sm">
                    <input type="checkbox" className="size-4" checked={!!picked[slide.id]} aria-label={`Select ${slide.fileName}`}
                      onChange={(event) => setPicked({ ...picked, [slide.id]: event.target.checked })} />
                    Use this slide on its own
                  </label>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <select className="field max-w-xs" aria-label="Playlist for selected slides" value={playlistId} onFocus={() => { if (!lists) void api<PlaylistSummary[]>("/api/playlists").then(setLists).catch(() => undefined); }} onChange={(event) => setPlaylistId(event.target.value)}>
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

function statusLabel(status: string) {
  if (status === "processing") return "Processing";
  if (status === "failed") return "Failed";
  if (status === "pending") return "Waiting";
  return "Ready";
}
