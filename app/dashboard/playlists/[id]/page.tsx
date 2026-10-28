"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api, useApi, type MediaItem, type PlaylistDetail } from "@/lib/api";
import { useToast } from "@/components/toast";

type Slide = {
  key: string; mediaId: string; fileName: string; url: string | null; thumbnailUrl: string | null;
  kind: "image" | "video"; mediaDurationMs: number | null; seconds: string;
};

export default function PlaylistEditor() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const playlist = useApi<PlaylistDetail>(`/api/playlists/${id}`);
  const toast = useToast();
  const router = useRouter();
  const [name, setName] = useState("");
  const [defaultSeconds, setDefaultSeconds] = useState("10");
  const [transition, setTransition] = useState<"none" | "fade">("none");
  const [slides, setSlides] = useState<Slide[]>([]);
  const [chosen, setChosen] = useState<Record<string, boolean>>({});
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const data = playlist.data;
    if (!data) return;
    setName(data.name);
    setDefaultSeconds(String(Math.round(data.defaultDurationMs / 1000)));
    setTransition(data.transition);
    setSlides(data.items.map((item) => ({
      key: item.id,
      mediaId: item.mediaId,
      fileName: item.fileName,
      url: item.url,
      thumbnailUrl: item.thumbnailUrl ?? null,
      kind: item.kind === "video" ? "video" : "image",
      mediaDurationMs: item.mediaDurationMs ?? null,
      seconds: item.durationMs == null ? "" : String(Math.round(item.durationMs / 1000)),
    })));
    const next: Record<string, boolean> = {};
    for (const display of data.displays) next[display.id] = display.assigned;
    setChosen(next);
    setReady(true);
  }, [playlist.data]);

  const defaultMs = Math.round(Number(defaultSeconds) * 1000);
  const previewSlides = useMemo(
    () => slides.filter((slide) => slide.url).map((slide) => ({
      url: slide.url as string,
      fileName: slide.fileName,
      kind: slide.kind,
      thumbnailUrl: slide.thumbnailUrl,
      durationMs: slide.kind === "video"
        ? (slide.mediaDurationMs && slide.mediaDurationMs >= 500 ? slide.mediaDurationMs : 5000)
        : slide.seconds.trim() === "" || !Number.isFinite(Number(slide.seconds))
          ? (Number.isFinite(defaultMs) && defaultMs >= 1000 ? defaultMs : 10000)
          : Math.round(Number(slide.seconds) * 1000),
    })),
    [slides, defaultMs],
  );

  function payload() {
    const items = slides.map((slide) => ({
      mediaId: slide.mediaId,
      durationMs: slide.kind === "video" || slide.seconds.trim() === "" ? null : Math.round(Number(slide.seconds) * 1000),
    }));
    return {
      name: name.trim(),
      defaultDurationMs: Math.round(Number(defaultSeconds) * 1000),
      transition,
      items,
    };
  }

  function invalidTiming(body: ReturnType<typeof payload>) {
    if (!body.name) return "Give the playlist a name.";
    if (!Number.isInteger(body.defaultDurationMs) || body.defaultDurationMs < 1000 || body.defaultDurationMs > 600000) {
      return "Default duration must be between 1 and 600 seconds.";
    }
    for (const item of body.items) {
      if (item.durationMs !== null && (!Number.isInteger(item.durationMs) || item.durationMs < 1000 || item.durationMs > 600000)) {
        return "Each slide must be between 1 and 600 seconds, or left blank to use the default.";
      }
    }
    return null;
  }

  async function save() {
    const body = payload();
    const problem = invalidTiming(body);
    if (problem) {
      toast.show(problem, true);
      return false;
    }
    setBusy("Saving…");
    try {
      await api(`/api/playlists/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      toast.show("Draft saved");
      await playlist.reload();
      return true;
    } catch (err) {
      toast.show((err as Error).message, true);
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function publish() {
    const displayIds = Object.entries(chosen).filter(([, on]) => on).map(([displayId]) => displayId);
    if (!slides.length) return toast.show("Add at least one image or video.", true);
    if (!displayIds.length) return toast.show("Choose at least one TV.", true);
    const saved = await save();
    if (!saved) return;
    setBusy("Publishing…");
    try {
      await api(`/api/playlists/${id}/publish`, { method: "POST", body: JSON.stringify({ displayIds }) });
      toast.show("Published. TVs update within about 10 seconds.");
      await playlist.reload();
    } catch (err) {
      toast.show((err as Error).message, true);
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!playlist.data) return;
    if (!confirm(`Delete “${playlist.data.name}”? TVs showing it will switch to “No content assigned”.`)) return;
    try {
      await api(`/api/playlists/${id}`, { method: "DELETE" });
      router.push("/dashboard/playlists");
    } catch (err) {
      toast.show((err as Error).message, true);
    }
  }

  function move(index: number, direction: -1 | 1) {
    const next = index + direction;
    if (next < 0 || next >= slides.length) return;
    const copy = slides.slice();
    const [row] = copy.splice(index, 1);
    copy.splice(next, 0, row);
    setSlides(copy);
  }

  if (!playlist.data || !ready) {
    return <p className="text-muted">{playlist.error || "Loading…"}</p>;
  }

  return (
    <section>
      <p className="text-sm mb-3"><Link href="/dashboard/playlists" className="underline">Playlists</Link></p>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Edit playlist</h1>
        <button type="button" className="btn btn-quiet text-danger" onClick={remove}>Delete</button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="grid gap-6">
          <div className="rounded-lg bg-white border border-line p-4 grid gap-4">
            <label className="grid gap-1">
              <span className="text-sm font-medium">Name</span>
              <input className="field" maxLength={80} aria-label="Playlist name" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1">
                <span className="text-sm font-medium">Default seconds</span>
                <input className="field" type="number" min={1} max={600} inputMode="numeric" aria-label="Default seconds"
                  value={defaultSeconds} onChange={(e) => setDefaultSeconds(e.target.value)} />
              </label>
              <label className="grid gap-1">
                <span className="text-sm font-medium">Transition</span>
                <select className="field" aria-label="Transition" value={transition} onChange={(e) => setTransition(e.target.value as "none" | "fade")}>
                  <option value="none">None</option>
                  <option value="fade">Fade</option>
                </select>
              </label>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between gap-3 mb-3">
              <h2 className="font-semibold">Slides</h2>
              <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>Add images</button>
            </div>
            {slides.length === 0 ? (
              <p className="text-sm text-muted">Nothing in this playlist yet. Add images or videos from your library.</p>
            ) : (
              <ol className="grid gap-3">
                {slides.map((slide, index) => (
                  <li key={slide.key} className="rounded-lg bg-white border border-line p-3 grid gap-3 sm:grid-cols-[7rem_minmax(0,1fr)]">
                    <span className="block aspect-video bg-black rounded-md overflow-hidden">
                      {slide.kind === "video" ? (
                        <video poster={slide.thumbnailUrl || undefined} src={slide.url || undefined} muted playsInline preload="none" className="size-full object-contain" />
                      ) : (
                        slide.url && <img src={slide.url} alt="" className="size-full object-contain" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium truncate">{index + 1}. {slide.fileName}</p>
                      {slide.kind === "video" ? (
                        <p className="mt-2 text-sm text-muted">Plays until the end{slide.mediaDurationMs ? ` (${Math.round(slide.mediaDurationMs / 1000)}s)` : ""}.</p>
                      ) : (
                      <label className="mt-2 grid gap-1">
                        <span className="text-xs text-muted">Seconds (blank uses the default)</span>
                        <input className="field" type="number" min={1} max={600} inputMode="numeric"
                          aria-label={`Seconds for ${slide.fileName}`} placeholder={defaultSeconds || "10"}
                          value={slide.seconds}
                          onChange={(e) => setSlides(slides.map((row, i) => i === index ? { ...row, seconds: e.target.value } : row))} />
                      </label>
                      )}
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button type="button" className="btn btn-quiet" aria-label={`Move ${slide.fileName} up`} disabled={index === 0} onClick={() => move(index, -1)}>Up</button>
                        <button type="button" className="btn btn-quiet" aria-label={`Move ${slide.fileName} down`} disabled={index === slides.length - 1} onClick={() => move(index, 1)}>Down</button>
                        <button type="button" className="btn btn-quiet text-danger" aria-label={`Remove ${slide.fileName}`}
                          onClick={() => setSlides(slides.filter((_, i) => i !== index))}>Remove</button>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="rounded-lg bg-white border border-line p-4">
            <h2 className="font-semibold mb-1">Publish</h2>
            <p className="text-sm text-muted mb-4">Choose one or more TVs. They switch within about 10 seconds. A single image published later replaces this playlist on that TV.</p>
            {playlist.data.displays.length === 0 ? (
              <p className="text-sm text-muted">Connect a TV under Displays first.</p>
            ) : (
              <ul className="grid gap-2 mb-4">
                {playlist.data.displays.map((display) => (
                  <li key={display.id}>
                    <label className="flex items-center gap-3 min-h-11">
                      <input type="checkbox" className="size-5" checked={!!chosen[display.id]} aria-label={display.name}
                        onChange={(e) => setChosen({ ...chosen, [display.id]: e.target.checked })} />
                      <span>{display.name}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-col sm:flex-row gap-2">
              <button type="button" className="btn btn-quiet" disabled={!!busy} onClick={save}>{busy === "Saving…" ? "Saving…" : "Save draft"}</button>
              <button type="button" className="btn btn-primary" disabled={!!busy} onClick={publish}>{busy === "Publishing…" ? "Publishing…" : "Publish"}</button>
            </div>
          </div>
        </div>

        <div className="order-first lg:order-none">
          <Preview slides={previewSlides} transition={transition} />
        </div>
      </div>

      {adding && (
        <AddImages
          existing={slides}
          onClose={() => setAdding(false)}
          onAdd={(picked) => {
            setSlides(slides.concat(picked));
            setAdding(false);
          }}
        />
      )}
      {toast.node}
    </section>
  );
}

function Preview({ slides, transition }: { slides: { url: string; fileName: string; durationMs: number; kind: "image" | "video"; thumbnailUrl: string | null }[]; transition: "none" | "fade" }) {
  const [index, setIndex] = useState(0);
  useEffect(() => { setIndex(0); }, [slides]);
  useEffect(() => {
    if (slides.length < 2) return;
    if (slides[index]?.kind === "video") return;
    const ms = Math.max(1000, slides[index]?.durationMs || 10000);
    const timer = window.setTimeout(() => setIndex((current) => (current + 1) % slides.length), ms);
    return () => window.clearTimeout(timer);
  }, [slides, index]);
  const current = slides[index];
  return (
    <div aria-label="Slideshow preview">
      <h2 className="font-semibold mb-2">Preview</h2>
      <div className="relative aspect-video bg-black rounded-md overflow-hidden border border-ink">
        {slides.length === 0 ? (
          <p className="absolute inset-0 grid place-items-center text-sm text-white/70 px-4 text-center">Add images or videos to preview the loop.</p>
        ) : slides.map((slide, i) => slide.kind === "video" ? (
          <video key={`${slide.url}-${i}`} src={i === index ? slide.url : undefined} poster={slide.thumbnailUrl || undefined}
            muted playsInline autoPlay={i === index} preload={i === index ? "auto" : "none"}
            onEnded={(event) => {
              if (slides.length < 2) {
                event.currentTarget.currentTime = 0;
                void event.currentTarget.play();
                return;
              }
              setIndex((current) => (current + 1) % slides.length);
            }}
            className={`absolute inset-0 size-full object-contain ${i === index ? "opacity-100" : "opacity-0"}`} />
        ) : (
          <img key={`${slide.url}-${i}`} src={slide.url} alt={i === index ? `Preview slide ${i + 1} of ${slides.length}, ${slide.fileName}` : ""}
            className={`absolute inset-0 size-full object-contain motion-reduce:transition-none ${transition === "fade" ? "transition-opacity duration-700" : ""} ${i === index ? "opacity-100" : "opacity-0"}`} />
        ))}
      </div>
      {current && <p className="text-sm text-muted mt-2 truncate">{index + 1} / {slides.length} · {current.fileName}</p>}
    </div>
  );
}

function AddImages({ existing, onClose, onAdd }: {
  existing: Slide[];
  onClose: () => void;
  onAdd: (slides: Slide[]) => void;
}) {
  const media = useApi<MediaItem[]>("/api/media");
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center" onClick={onClose}>
      <div role="dialog" aria-label="Add images" className="bg-paper w-full md:max-w-2xl max-h-[85dvh] overflow-y-auto rounded-t-2xl md:rounded-2xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Add images</h2>
          <button type="button" className="btn px-3" onClick={onClose}>Close</button>
        </div>
        {!media.data ? <p className="text-muted">{media.error || "Loading…"}</p> : media.data.length === 0 ? (
          <p className="text-muted">Upload an image in Media first.</p>
        ) : (
          <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {media.data.map((item) => (
              <li key={item.id}>
                <label className="block">
                  <span className="block aspect-video bg-black rounded-md overflow-hidden">
                    {item.kind === "video" ? (
                      item.thumbnailUrl ? <img src={item.thumbnailUrl} alt="" className="size-full object-contain" /> : <span className="grid size-full place-items-center text-xs text-white/70">Video</span>
                    ) : (
                      item.url && <img src={item.url} alt="" className="size-full object-contain" />
                    )}
                  </span>
                  <span className="mt-1 flex items-center gap-2 text-sm">
                    <input type="checkbox" className="size-5" aria-label={item.fileName} checked={!!picked[item.id]}
                      onChange={(e) => setPicked({ ...picked, [item.id]: e.target.checked })} />
                    <span className="truncate">{item.fileName}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="btn btn-primary w-full mt-5" onClick={() => {
          const chosen = (media.data ?? []).filter((item) => picked[item.id]);
          onAdd(chosen.map((item) => ({
            key: `${item.id}-${existing.length}-${Math.random().toString(36).slice(2, 8)}`,
            mediaId: item.id,
            fileName: item.fileName,
            url: item.url,
            thumbnailUrl: item.thumbnailUrl ?? null,
            kind: item.kind === "video" ? "video" : "image",
            mediaDurationMs: item.durationMs ?? null,
            seconds: "",
          })));
        }}>Add selected</button>
      </div>
    </div>
  );
}
