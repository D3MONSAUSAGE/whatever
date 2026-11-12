"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, useApi, type MediaItem, type PlaylistDetail } from "@/lib/api";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";
import { LimitNote, PageHeader, atLimit } from "@/components/ui";

/** Same as PLAYLIST_MAX_ITEMS on the server. */
const MAX_SLIDES = 40;
import { IconList } from "@/components/icons";

type Slide = {
  key: string; mediaId: string; fileName: string; url: string | null; thumbnailUrl: string | null;
  kind: "image" | "video" | "presentation"; mediaDurationMs: number | null; seconds: string;
  slideCount?: number;
  groupDurationMs?: number | null;
  parts?: { url: string | null; fileName: string; durationMs: number | null; width: number | null; height: number | null }[];
};

export function PlaylistEditor({ seed }: { seed?: PlaylistDetail }) {
  const params = useParams<{ id: string }>();
  const id = seed?.id ?? params.id;
  const live = useApi<PlaylistDetail>(seed ? null : `/api/playlists/${id}`);
  const playlist = seed ? { data: seed, error: null, reload: async () => {} } : live;
  const toast = useToast();
  const confirm = useConfirm();
  const router = useRouter();
  const [name, setName] = useState("");
  const [defaultSeconds, setDefaultSeconds] = useState("10");
  const [transition, setTransition] = useState<"none" | "fade">("none");
  const [playbackMode, setPlaybackMode] = useState<"auto" | "manual">("auto");
  const [slides, setSlides] = useState<Slide[]>([]);
  const [chosen, setChosen] = useState<Record<string, boolean>>({});
  const [adding, setAdding] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const dragRef = useRef<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const data = playlist.data;
    if (!data) return;
    setName(data.name);
    setDefaultSeconds(String(Math.round(data.defaultDurationMs / 1000)));
    setTransition(data.transition);
    setPlaybackMode(data.playbackMode === "manual" ? "manual" : "auto");
    setSlides(data.items.map((item) => ({
      key: item.id,
      mediaId: item.mediaId,
      fileName: item.fileName,
      url: item.url,
      thumbnailUrl: item.thumbnailUrl ?? null,
      kind: item.kind === "video" ? "video" : item.kind === "presentation" ? "presentation" : "image",
      mediaDurationMs: item.mediaDurationMs ?? null,
      seconds: item.durationMs == null ? "" : String(Math.round(item.durationMs / 1000)),
      slideCount: item.slideCount,
      groupDurationMs: item.groupDurationMs ?? null,
      parts: item.slides?.map((slide) => ({
        url: slide.url,
        fileName: slide.fileName,
        durationMs: slide.durationMs,
        width: slide.width,
        height: slide.height,
      })),
    })));
    const next: Record<string, boolean> = {};
    for (const display of data.displays) next[display.id] = display.assigned;
    setChosen(next);
    setReady(true);
  }, [playlist.data]);

  const defaultMs = Math.round(Number(defaultSeconds) * 1000);
  const previewSlides = useMemo(
    () => slides.flatMap((slide) => {
      const base = slide.seconds.trim() === "" || !Number.isFinite(Number(slide.seconds))
        ? (Number.isFinite(defaultMs) && defaultMs >= 1000 ? defaultMs : 10000)
        : Math.round(Number(slide.seconds) * 1000);
      if (slide.kind === "presentation") {
        const parts = (slide.parts ?? []).filter((part) => part.url);
        if (!parts.length && slide.url) {
          return [{ url: slide.url, fileName: slide.fileName, kind: "image" as const, thumbnailUrl: slide.thumbnailUrl, durationMs: Math.max(3000, base) }];
        }
        return parts.map((part) => ({
          url: part.url as string,
          fileName: part.fileName,
          kind: "image" as const,
          thumbnailUrl: null,
          durationMs: part.durationMs ?? Math.max(3000, base),
        }));
      }
      if (!slide.url) return [];
      return [{
        url: slide.url,
        fileName: slide.fileName,
        kind: slide.kind,
        thumbnailUrl: slide.thumbnailUrl,
        durationMs: slide.kind === "video"
          ? (slide.mediaDurationMs && slide.mediaDurationMs >= 500 ? slide.mediaDurationMs : 5000)
          : base,
      }];
    }),
    [slides, defaultMs],
  );
  const estimatedMs = previewSlides.reduce((sum, slide) => sum + (slide.kind === "video" ? slide.durationMs : slide.durationMs), 0);

  function payload() {
    const items = slides.map((slide) => ({
      mediaId: slide.mediaId,
      durationMs: slide.kind === "video" || slide.seconds.trim() === "" ? null : Math.round(Number(slide.seconds) * 1000),
    }));
    return {
      name: name.trim(),
      defaultDurationMs: Math.round(Number(defaultSeconds) * 1000),
      transition,
      playbackMode,
      items,
    };
  }

  function invalidTiming(body: ReturnType<typeof payload>) {
    if (!body.name) return "Give the playlist a name.";
    if (!Number.isInteger(body.defaultDurationMs) || body.defaultDurationMs < 1000 || body.defaultDurationMs > 600000) {
      return "Default duration must be between 1 and 600 seconds.";
    }
    for (let index = 0; index < body.items.length; index++) {
      const item = body.items[index];
      const slide = slides[index];
      if (item.durationMs === null) continue;
      if (slide?.kind === "presentation") {
        if (!Number.isInteger(item.durationMs) || item.durationMs < 3000 || item.durationMs > 3_600_000) {
          return "Each presentation stays between 3 and 3600 seconds per slide.";
        }
      } else if (!Number.isInteger(item.durationMs) || item.durationMs < 1000 || item.durationMs > 600000) {
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
      toast.show("Published. Screens playing this playlist update when they're online.");
      await playlist.reload();
    } catch (err) {
      toast.show((err as Error).message, true);
    } finally {
      setBusy(null);
    }
  }

  async function duplicate() {
    const body = payload();
    const problem = invalidTiming(body);
    if (problem) return toast.show(problem, true);
    const copyName = `Copy of ${body.name}`.slice(0, 80);
    setBusy("Duplicating…");
    let createdId = "";
    try {
      const created = await api<{ id: string }>("/api/playlists", { method: "POST", body: JSON.stringify({ name: copyName }) });
      createdId = created.id;
      await api(`/api/playlists/${created.id}`, { method: "PATCH", body: JSON.stringify({ ...body, name: copyName }) });
      toast.show("Duplicated as a draft");
      router.push(`/dashboard/playlists/${created.id}`);
    } catch (err) {
      if (createdId) await api(`/api/playlists/${createdId}`, { method: "DELETE" }).catch(() => undefined);
      toast.show((err as Error).message, true);
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!playlist.data) return;
    const ok = await confirm.ask({
      title: "Delete this playlist?",
      body: `Delete “${playlist.data.name}”? TVs showing it will switch to “No content assigned”.`,
      confirmLabel: "Delete playlist",
      danger: true,
    });
    if (ok !== true) return;
    try {
      await api(`/api/playlists/${id}`, { method: "DELETE" });
      router.push("/dashboard/playlists");
    } catch (err) {
      toast.show((err as Error).message, true);
    }
  }

  function moveTo(from: number, to: number) {
    if (!Number.isInteger(from) || from === to || from < 0 || to < 0 || from >= slides.length || to >= slides.length) return;
    const copy = slides.slice();
    const [row] = copy.splice(from, 1);
    copy.splice(to, 0, row);
    setSlides(copy);
  }

  function move(index: number, direction: -1 | 1) {
    moveTo(index, index + direction);
  }

  if (!playlist.data || !ready) {
    return <p className="text-muted">{playlist.error || "Loading…"}</p>;
  }

  const using = playlist.data.displays.filter((display) => display.assigned);

  return (
    <section>
      <p className="text-sm mb-3"><Link href="/dashboard/playlists" className="underline">Playlists</Link></p>
      <PageHeader title="Edit playlist" eyebrow="Playlists" icon={<IconList />} lede="Drafts never change a screen. Publish to send this order to every screen that plays it." />
      <div className="mb-4 flex flex-wrap gap-2">
        <button type="button" className="btn btn-quiet" disabled={!!busy} onClick={duplicate}>Duplicate</button>
        <button type="button" className="btn btn-quiet text-danger" onClick={remove}>Delete</button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="grid gap-6">
          <div className="card p-4 grid gap-4">
            <label className="grid gap-1">
              <span className="text-sm font-medium">Name</span>
              <input className="field" maxLength={80} aria-label="Playlist name" value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1">
                <span className="text-sm font-medium">Default seconds</span>
                <input className="field" type="number" min={1} max={600} inputMode="numeric" aria-label="Default seconds"
                  value={defaultSeconds} onChange={(event) => setDefaultSeconds(event.target.value)}
                  disabled={playbackMode === "manual"} />
              </label>
              <label className="grid gap-1">
                <span className="text-sm font-medium">Transition</span>
                <select className="field" aria-label="Transition" value={transition} onChange={(event) => setTransition(event.target.value as "none" | "fade")}>
                  <option value="none">None</option>
                  <option value="fade">Fade</option>
                </select>
              </label>
              <label className="grid gap-1 sm:col-span-2">
                <span className="text-sm font-medium">Playback</span>
                <select className="field" aria-label="Playback" value={playbackMode}
                  onChange={(event) => setPlaybackMode(event.target.value as "auto" | "manual")}>
                  <option value="auto">Automatic</option>
                  <option value="manual">Manual slideshow</option>
                </select>
                <span className="text-xs text-muted mt-1">
                  {playbackMode === "manual"
                    ? "Screens show one slide until someone advances with on-screen controls or left/right keys. Image timing is ignored. Videos play once, then hold until the next advance."
                    : "Screens advance each slide on its own using the durations above."}
                </span>
              </label>
            </div>
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <h2 className="font-semibold">Slides</h2>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn btn-quiet" disabled={!slides.length} onClick={() => setPreviewing(true)}>Full preview</button>
                <button type="button" className="btn btn-primary" disabled={atLimit(slides.length, MAX_SLIDES)} onClick={() => setAdding(true)}>Add images</button>
              </div>
            </div>
            <div className="mb-3"><LimitNote count={slides.length} max={MAX_SLIDES} noun="slides in a playlist" /></div>
            <p className="text-sm text-muted mb-3">Drag a slide to reorder. On a phone, use Up and Down. Estimated length {formatClock(estimatedMs)}.</p>
            {slides.length === 0 ? (
              <p className="text-sm text-muted">Nothing in this playlist yet. Add images or videos from your library.</p>
            ) : (
              <ol className="grid gap-3">
                {slides.map((slide, index) => (
                  <li key={slide.key}
                    className={`card p-3 grid gap-3 sm:grid-cols-[7rem_minmax(0,1fr)] ${dragFrom === index ? "opacity-60" : ""}`}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      const raw = event.dataTransfer.getData("text/plain");
                      const from = raw === "" ? dragRef.current : Number(raw);
                      if (from !== null) moveTo(from, index);
                      dragRef.current = null;
                      setDragFrom(null);
                    }}>
                    <span className="block aspect-video bg-black rounded-md overflow-hidden">
                      {slide.kind === "video" ? (
                        <video poster={slide.thumbnailUrl || undefined} src={slide.url || undefined} muted playsInline preload="none" className="size-full object-contain" />
                      ) : (
                        slide.url && <img src={slide.url} alt="" className="size-full object-contain" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium truncate">{index + 1}. {slide.fileName}{slide.kind === "presentation" ? ` · ${slide.slideCount ?? slide.parts?.length ?? 0} slides` : ""}</p>
                      {slide.kind === "video" ? (
                        <p className="mt-2 text-sm text-muted">Plays until the end{slide.mediaDurationMs ? ` (${Math.round(slide.mediaDurationMs / 1000)}s)` : ""}.</p>
                      ) : (
                        <label className="mt-2 grid gap-1">
                          <span className="text-xs text-muted">{slide.kind === "presentation" ? "Seconds for each slide (blank uses the playlist default). Slides with their own time keep it." : "Seconds (blank uses the default)"}</span>
                          <input className="field" type="number" min={slide.kind === "presentation" ? 3 : 1} max={slide.kind === "presentation" ? 3600 : 600} inputMode="numeric"
                            aria-label={`Seconds for ${slide.fileName}`} placeholder={defaultSeconds || "10"}
                            value={slide.seconds}
                            onChange={(event) => setSlides(slides.map((row, i) => i === index ? { ...row, seconds: event.target.value } : row))} />
                        </label>
                      )}
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button type="button" className="btn btn-quiet cursor-grab" draggable aria-label={`Drag ${slide.fileName}`}
                          onDragStart={(event) => {
                            event.dataTransfer.effectAllowed = "move";
                            event.dataTransfer.setData("text/plain", String(index));
                            dragRef.current = index;
                            setDragFrom(index);
                          }}
                          onDragEnd={() => { dragRef.current = null; setDragFrom(null); }}>Drag</button>
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

          <div className="card p-4">
            <h2 className="font-semibold mb-1">Publish</h2>
            <p className="text-sm text-muted mb-3">Choose one or more screens. They switch within about 10 seconds. A single image published later replaces this playlist on that screen.</p>
            <p className="text-sm mb-4">
              {using.length
                ? <>On {using.map((display) => display.name).join(", ")}.</>
                : "Not on a screen yet."}
            </p>
            {playlist.data.displays.length === 0 ? (
              <p className="text-sm text-muted">Connect a TV under Displays first.</p>
            ) : (
              <ul className="grid gap-2 mb-4">
                {playlist.data.displays.map((display) => (
                  <li key={display.id}>
                    <label className="flex items-center gap-3 min-h-11">
                      <input type="checkbox" className="size-5" checked={!!chosen[display.id]} aria-label={display.name}
                        onChange={(event) => setChosen({ ...chosen, [display.id]: event.target.checked })} />
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
          <Preview slides={previewSlides} transition={transition} playbackMode={playbackMode} label="Slideshow preview" />
        </div>
      </div>

      {previewing && (
        <div className="fixed inset-0 z-50 bg-ink/80 flex items-center justify-center p-4" onClick={() => setPreviewing(false)}>
          <div role="dialog" aria-label="Full playlist preview" className="bg-paper w-full max-w-4xl rounded-2xl p-4 md:p-5" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">Full preview</h2>
              <button type="button" className="btn btn-quiet" onClick={() => setPreviewing(false)}>Close</button>
            </div>
            <Preview slides={previewSlides} transition={transition} playbackMode={playbackMode} label="Full playlist preview" large />
          </div>
        </div>
      )}

      {adding && (
        <AddImages
          existing={slides}
          onClose={() => setAdding(false)}
          onAdd={(picked) => {
            const room = MAX_SLIDES - slides.length;
            if (picked.length > room) toast.show(`A playlist holds up to ${MAX_SLIDES} slides, so only the first ${Math.max(0, room)} were added.`);
            setSlides(slides.concat(picked.slice(0, Math.max(0, room))));
            setAdding(false);
          }}
        />
      )}
      {toast.node}
      {confirm.node}
    </section>
  );
}

function formatClock(ms: number) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes ? `${minutes}m ${rest}s` : `${rest}s`;
}

function Preview({ slides, transition, playbackMode, label, large = false }: {
  slides: { url: string; fileName: string; durationMs: number; kind: "image" | "video"; thumbnailUrl: string | null }[];
  transition: "none" | "fade";
  playbackMode: "auto" | "manual";
  label: string;
  large?: boolean;
}) {
  const [index, setIndex] = useState(0);
  useEffect(() => { setIndex(0); }, [slides, playbackMode]);
  useEffect(() => {
    if (playbackMode === "manual") return;
    if (slides.length < 2) return;
    if (slides[index]?.kind === "video") return;
    const ms = Math.max(1000, slides[index]?.durationMs || 10000);
    const timer = window.setTimeout(() => setIndex((current) => (current + 1) % slides.length), ms);
    return () => window.clearTimeout(timer);
  }, [slides, index, playbackMode]);
  useEffect(() => {
    if (playbackMode !== "manual") return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "ArrowRight") setIndex((current) => slides.length ? (current + 1) % slides.length : 0);
      if (event.key === "ArrowLeft") setIndex((current) => slides.length ? (current - 1 + slides.length) % slides.length : 0);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playbackMode, slides.length]);
  const current = slides[index];
  function step(delta: number) {
    if (!slides.length) return;
    setIndex((currentIndex) => (currentIndex + delta + slides.length) % slides.length);
  }
  return (
    <div aria-label={label}>
      {!large && <h2 className="font-semibold mb-2">Preview</h2>}
      <div className={`relative aspect-video bg-black rounded-md overflow-hidden border border-ink ${large ? "max-h-[70dvh]" : ""}`}>
        {slides.length === 0 ? (
          <p className="absolute inset-0 grid place-items-center text-sm text-white/70 px-4 text-center">Add images or videos to preview the loop.</p>
        ) : slides.map((slide, i) => slide.kind === "video" ? (
          <video key={`${slide.url}-${i}`} src={i === index ? slide.url : undefined} poster={slide.thumbnailUrl || undefined}
            muted playsInline autoPlay={i === index} preload={i === index ? "auto" : "none"}
            onEnded={(event) => {
              if (playbackMode === "manual") return;
              if (slides.length < 2) {
                event.currentTarget.currentTime = 0;
                void event.currentTarget.play();
                return;
              }
              setIndex((currentIndex) => (currentIndex + 1) % slides.length);
            }}
            className={`absolute inset-0 size-full object-contain ${i === index ? "opacity-100" : "opacity-0"}`} />
        ) : (
          <img key={`${slide.url}-${i}`} src={slide.url} alt={i === index ? `Preview slide ${i + 1} of ${slides.length}, ${slide.fileName}` : ""}
            className={`absolute inset-0 size-full object-contain motion-reduce:transition-none ${transition === "fade" ? "transition-opacity duration-700" : ""} ${i === index ? "opacity-100" : "opacity-0"}`} />
        ))}
        {playbackMode === "manual" && slides.length > 0 ? (
          <div className="absolute inset-x-0 bottom-2 flex items-center justify-center gap-2">
            <button type="button" className="btn btn-quiet bg-black/50 text-white border-white/20" aria-label="Previous slide" onClick={() => step(-1)}>Previous</button>
            <button type="button" className="btn btn-quiet bg-black/50 text-white border-white/20" aria-label="Next slide" onClick={() => step(1)}>Next</button>
          </div>
        ) : null}
      </div>
      {current && <p className="text-sm text-muted mt-2 truncate">{index + 1} / {slides.length} · {current.fileName}{playbackMode === "manual" ? " · Manual" : ""}</p>}
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
  const [openDeck, setOpenDeck] = useState<string | null>(null);
  const [deckSlides, setDeckSlides] = useState<Record<string, { id: string; fileName: string; url: string | null }[]>>({});
  const rows = (media.data ?? []).filter((item) => !item.sourceMediaId);
  async function showSlides(id: string) {
    setOpenDeck(openDeck === id ? null : id);
    if (deckSlides[id]) return;
    const detail = await api<{ slides: { id: string; fileName: string; url: string | null }[] }>(`/api/media/presentation/${id}`);
    setDeckSlides((current) => ({ ...current, [id]: detail.slides }));
  }
  return (
    <div className="fixed inset-0 z-50 bg-ink/50 flex items-end md:items-center justify-center" onClick={onClose}>
      <div role="dialog" aria-label="Add images" className="bg-paper w-full md:max-w-2xl max-h-[85dvh] overflow-y-auto rounded-t-2xl md:rounded-2xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
        onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Add images</h2>
          <button type="button" className="btn btn-quiet px-3" onClick={onClose}>Close</button>
        </div>
        {!media.data ? <p className="text-muted">{media.error || "Loading…"}</p> : rows.length === 0 ? (
          <p className="text-muted">Upload an image in Media first.</p>
        ) : (
          <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {rows.map((item) => (
              <li key={item.id}>
                <label className="block">
                  <span className="block aspect-video bg-black rounded-md overflow-hidden">
                    {item.kind === "video" ? (
                      item.thumbnailUrl ? <img src={item.thumbnailUrl} alt="" className="size-full object-contain" /> : <span className="grid size-full place-items-center text-xs text-white/70">Video</span>
                    ) : item.kind === "presentation" ? (
                      item.coverUrl ? <img src={item.coverUrl} alt="" className="size-full object-contain" /> : <span className="grid size-full place-items-center text-xs text-white/70">Presentation</span>
                    ) : (
                      item.url && <img src={item.url} alt="" className="size-full object-contain" />
                    )}
                  </span>
                  <span className="mt-1 flex items-center gap-2 text-sm min-h-11">
                    <input type="checkbox" className="size-5" aria-label={item.fileName} checked={!!picked[item.id]}
                      onChange={(event) => setPicked({ ...picked, [item.id]: event.target.checked })} />
                    <span className="truncate">{item.fileName}{item.kind === "presentation" ? ` (${item.slideCount ?? 0})` : ""}</span>
                  </span>
                </label>
                {item.kind === "presentation" ? (
                  <button type="button" className="text-sm text-primary underline mt-1" onClick={() => void showSlides(item.id)}>Choose individual slides</button>
                ) : null}
                {openDeck === item.id ? (
                  <ul className="mt-2 grid gap-1">
                    {(deckSlides[item.id] ?? []).map((slide) => (
                      <li key={slide.id}>
                        <label className="flex items-center gap-2 text-sm">
                          <input type="checkbox" className="size-4" aria-label={slide.fileName} checked={!!picked[slide.id]}
                            onChange={(event) => setPicked({ ...picked, [slide.id]: event.target.checked })} />
                          <span className="truncate">{slide.fileName}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="btn btn-primary w-full mt-5" onClick={() => {
          const chosen = rows.filter((item) => picked[item.id]);
          const singles = Object.entries(deckSlides).flatMap(([, slides]) => slides.filter((slide) => picked[slide.id]));
          onAdd([
            ...chosen.map((item) => ({
              key: `${item.id}-${existing.length}-${Math.random().toString(36).slice(2, 8)}`,
              mediaId: item.id,
              fileName: item.fileName,
              url: item.kind === "presentation" ? item.coverUrl ?? null : item.url,
              thumbnailUrl: item.thumbnailUrl ?? null,
              kind: item.kind === "video" ? "video" as const : item.kind === "presentation" ? "presentation" as const : "image" as const,
              mediaDurationMs: item.durationMs ?? null,
              seconds: item.kind === "presentation" && item.defaultDurationMs ? String(Math.round(item.defaultDurationMs / 1000)) : "",
              slideCount: item.slideCount ?? undefined,
              groupDurationMs: item.defaultDurationMs ?? null,
            })),
            ...singles.map((slide) => ({
              key: `${slide.id}-${existing.length}-${Math.random().toString(36).slice(2, 8)}`,
              mediaId: slide.id,
              fileName: slide.fileName,
              url: slide.url,
              thumbnailUrl: null,
              kind: "image" as const,
              mediaDurationMs: null,
              seconds: "",
            })),
          ]);
        }}>Add selected</button>
      </div>
    </div>
  );
}
