"use client";
import { useEffect, useState } from "react";
import { api, useApi, type DisplayItem, type LocationItem, type MediaItem, type PlaylistSummary } from "@/lib/api";
import { ONLINE_HINT, OfflineAlert, ScreenCard } from "@/components/tv";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";
import { IconTv } from "@/components/icons";
import { EmptyState, LoadState, PageHeader } from "@/components/ui";
import { byName, SEARCH_FROM } from "@/components/playlist-list";

export function Displays({ fixture }: { fixture?: DisplayItem[] }) {
  const live = useApi<DisplayItem[]>(fixture ? null : "/api/displays", fixture ? undefined : 10_000);
  const locations = useApi<LocationItem[]>(fixture ? null : "/api/locations");
  const displays = fixture
    ? { data: fixture, error: null as string | null, reload: async () => {} }
    : live;
  const [picking, setPicking] = useState<DisplayItem | null>(null);
  const [search, setSearch] = useState("");
  const [assigning, setAssigning] = useState<string[] | null>(null);
  const toast = useToast();
  const confirm = useConfirm();

  async function rename(display: DisplayItem) {
    const name = await confirm.ask({
      title: "Rename this screen",
      body: "This only changes the name in your dashboard.",
      confirmLabel: "Save name",
      input: { label: "Name", ariaLabel: "New TV name", defaultValue: display.name, maxLength: 60 },
    });
    if (typeof name !== "string" || name === display.name) return;
    try {
      await api(`/api/displays/${display.id}`, { method: "PATCH", body: JSON.stringify({ name }) });
      toast.show("Renamed");
      displays.reload();
    } catch (err) {
      toast.show((err as Error).message, true);
    }
  }

  async function disconnect(display: DisplayItem) {
    const ok = await confirm.ask({
      title: "Disconnect this screen?",
      body: `Disconnect “${display.name}”? The TV will go back to showing a pairing code.`,
      confirmLabel: "Disconnect this TV",
      danger: true,
    });
    if (ok !== true) return;
    try {
      await api(`/api/displays/${display.id}`, { method: "DELETE" });
      toast.show("Disconnected");
      displays.reload();
    } catch (err) {
      toast.show((err as Error).message, true);
    }
  }

  return (
    <section>
      <PageHeader title="Displays" icon={<IconTv />} lede={ONLINE_HINT}>
        <a href="#add-screen" className="btn btn-primary" data-testid="add-screen"
          onClick={(event) => { event.preventDefault(); const form = document.getElementById("add-screen"); form?.scrollIntoView({ behavior: "smooth", block: "start" }); (form?.querySelector("input") as HTMLInputElement | null)?.focus({ preventScroll: true }); }}>
          Add screen
        </a>
        <button type="button" className="btn" onClick={() => setAssigning([])}>Assign playlist</button>
      </PageHeader>
      {displays.data ? <OfflineAlert displays={displays.data} /> : null}
      <PairForm onPaired={() => { toast.show("Connected. The TV will switch over in a few seconds."); displays.reload(); }}
        onError={(message) => toast.show(message, true)} />

      {!displays.data ? (
        <div className="mt-8"><LoadState error={displays.error} label="Loading…" /></div>
      ) : displays.data.length === 0 ? (
        <div className="mt-8"><EmptyState title="No screens yet">Open the TV address on a smart TV or browser, then type the code it shows into the box above.</EmptyState></div>
      ) : (
        <>
        {displays.data.length >= SEARCH_FROM ? (
          <input className="field mt-8" type="search" aria-label="Search screens" placeholder="Search screens" value={search} onChange={(e) => setSearch(e.target.value)} />
        ) : null}
        {byName(displays.data, search).length === 0 ? <div className="mt-8"><EmptyState title="No screens match that search">Try another name, or clear the search.</EmptyState></div> : null}
        <ul className="mt-8 grid gap-4 lg:grid-cols-2">
          {byName(displays.data, search).map((display) => (
            <li key={display.id}>
              <ScreenCard display={display} actions={
                <>
                  {display.currentSchedule ? (
                    <p className="w-full text-xs text-muted" data-testid="current-schedule">
                      <span className="badge badge-live mr-1">Scheduled</span>
                      {display.currentSchedule.name} plays {display.currentSchedule.playlistName || "a playlist"}
                      {display.currentSchedule.until ? ` until ${new Date(display.currentSchedule.until).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}` : ""}
                    </p>
                  ) : null}
                  {locations.data && locations.data.length > 0 ? (
                    <label className="w-full text-xs font-semibold text-muted">
                      Location
                      <select
                        aria-label={`Location for ${display.name}`}
                        className="field mt-1"
                        value={display.location?.id ?? ""}
                        onChange={async (event) => {
                          const locationId = event.target.value || null;
                          try {
                            await api(`/api/displays/${display.id}`, { method: "PATCH", body: JSON.stringify({ locationId }) });
                            toast.show("Location saved");
                            displays.reload();
                          } catch (err) {
                            toast.show((err as Error).message, true);
                          }
                        }}
                      >
                        <option value="">No location (UTC)</option>
                        {locations.data.map((location) => (
                          <option key={location.id} value={location.id}>{location.name}</option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <button type="button" className="btn btn-primary" onClick={() => setPicking(display)}>Change image</button>
                  <button type="button" className="btn btn-quiet" onClick={() => setAssigning([display.id])}>Assign to this screen</button>
                  <button type="button" className="btn btn-quiet" onClick={() => rename(display)}>Rename</button>
                  <button type="button" className="btn btn-quiet text-danger" onClick={() => disconnect(display)}>Disconnect</button>
                </>
              } />
            </li>
          ))}
        </ul>
        </>
      )}

      {picking && (
        <Picker display={picking} onClose={() => setPicking(null)}
          onPublished={(label) => { setPicking(null); toast.show(label); displays.reload(); }}
          onError={(message) => toast.show(message, true)} />
      )}
      {assigning && displays.data && (
        <AssignPlaylist
          displays={displays.data}
          initialIds={assigning}
          onClose={() => setAssigning(null)}
          onDone={(label) => { setAssigning(null); toast.show(label); displays.reload(); }}
          onError={(message) => toast.show(message, true)}
        />
      )}
      {toast.node}
      {confirm.node}
    </section>
  );
}

function PairForm({ onPaired, onError }: { onPaired: () => void; onError: (message: string) => void }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api("/api/displays/pair", { method: "POST", body: JSON.stringify({ code, name }) });
      setCode("");
      setName("");
      onPaired();
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form id="add-screen" onSubmit={submit} className="card p-4 md:p-5 scroll-mt-20 md:scroll-mt-4" aria-labelledby="add-screen-title">
      <h2 id="add-screen-title" className="font-semibold">Add a screen</h2>
      <ol className="mt-2 mb-4 grid gap-2 text-sm text-muted list-decimal pl-5">
        <li>On the TV (or any browser on it), open this address:
          <PlayerUrl />
        </li>
        <li>The TV shows a 6-digit code.</li>
        <li>Type the code and a name below, then press <strong className="text-ink">Connect TV</strong>. The TV switches over in a few seconds.</li>
      </ol>
      <div className="grid gap-3 lg:grid-cols-[10rem_1fr_auto]">
        <input className="field text-xl tracking-[0.2em] font-semibold" inputMode="numeric" autoComplete="one-time-code"
          placeholder="123 456" maxLength={7} required value={code}
          onChange={(event) => setCode(event.target.value.replace(/[^\d ]/g, ""))} aria-label="Code on the TV" />
        <input className="field" placeholder="Name, like Front counter" maxLength={60} required
          value={name} onChange={(event) => setName(event.target.value)} aria-label="TV name" />
        <button className="btn btn-primary" disabled={busy}>{busy ? "Connecting…" : "Connect TV"}</button>
      </div>
      <p className="text-xs text-muted mt-3">The TV address is also in <a className="underline" href="/dashboard/settings" aria-label="Open the page with the TV address">Settings</a>.</p>
    </form>
  );
}

function PlayerUrl() {
  const [url, setUrl] = useState("/player");
  const [copied, setCopied] = useState(false);
  useEffect(() => { setUrl(`${window.location.origin}/player`); }, []);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const area = document.createElement("textarea");
      area.value = url;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <span className="mt-2 flex flex-wrap items-center gap-2">
      <code data-testid="player-url" className="rounded-lg border border-line bg-white px-3 py-2 text-base font-semibold text-ink break-all">{url}</code>
      <button type="button" className="btn" onClick={copy} aria-label="Copy TV address">{copied ? "Copied" : "Copy"}</button>
      <span role="status" className="sr-only">{copied ? "TV address copied" : ""}</span>
    </span>
  );
}

function Picker({ display, onClose, onPublished, onError }: {
  display: DisplayItem; onClose: () => void; onPublished: (label: string) => void; onError: (message: string) => void;
}) {
  const media = useApi<MediaItem[]>("/api/media");
  const [busy, setBusy] = useState(false);
  async function publish(mediaId: string | null) {
    setBusy(true);
    try {
      await api(`/api/displays/${display.id}`, { method: "PATCH", body: JSON.stringify({ mediaId }) });
      onPublished(mediaId ? `Published to ${display.name}` : `Cleared ${display.name}`);
    } catch (err) {
      onError((err as Error).message);
      setBusy(false);
    }
  }
  const images = (media.data ?? []).filter((item) => item.kind !== "video");
  return (
    <div className="fixed inset-0 z-50 bg-ink/50 flex items-end md:items-center justify-center" onClick={onClose}>
      <div role="dialog" aria-label={`Choose an image for ${display.name}`}
        className="bg-paper w-full md:max-w-2xl max-h-[85dvh] overflow-y-auto rounded-t-2xl md:rounded-2xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
        onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold">Publish to {display.name}</h2>
          <button type="button" className="btn btn-quiet px-3" onClick={onClose} aria-label="Close">Close</button>
        </div>
        <p className="text-sm text-muted mb-4">
          Tap an image. The TV updates within about 10 seconds.
          {display.playlist ? " This replaces the playlist on this TV." : ""}
        </p>
        {!media.data ? <LoadState error={media.error} /> : images.length === 0 ? (
          <p className="text-muted">Upload an image in Media first. Videos play from a playlist.</p>
        ) : (
          <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {images.map((item) => {
              const current = display.media?.id === item.id;
              return (
                <li key={item.id}>
                  <button type="button" disabled={busy || current} onClick={() => publish(item.id)}
                    className={`w-full text-left rounded-lg ${current ? "opacity-60" : ""}`}>
                    <span className="block aspect-video bg-black rounded-md overflow-hidden">
                      {item.url ? <img src={item.url} alt="" className="size-full object-contain" /> : null}
                    </span>
                    <span className="block mt-1 text-sm truncate">{current ? "On screen now" : item.fileName}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {display.media ? (
          <button type="button" className="btn btn-quiet w-full mt-5" disabled={busy} onClick={() => publish(null)}>Clear screen</button>
        ) : null}
      </div>
    </div>
  );
}

function AssignPlaylist({ displays, initialIds, onClose, onDone, onError }: {
  displays: DisplayItem[];
  initialIds: string[];
  onClose: () => void;
  onDone: (label: string) => void;
  onError: (message: string) => void;
}) {
  const playlists = useApi<PlaylistSummary[]>("/api/playlists");
  const [playlistId, setPlaylistId] = useState("");
  const [chosen, setChosen] = useState<Record<string, boolean>>(() => {
    const next: Record<string, boolean> = {};
    for (const id of initialIds) next[id] = true;
    return next;
  });
  const [busy, setBusy] = useState(false);

  function pickPlaylist(id: string) {
    setPlaylistId(id);
    const next: Record<string, boolean> = {};
    for (const display of displays) next[display.id] = display.playlist?.id === id || initialIds.includes(display.id);
    setChosen(next);
  }

  async function publish() {
    const displayIds = Object.entries(chosen).filter(([, on]) => on).map(([id]) => id);
    if (!playlistId) return onError("Choose a playlist.");
    if (!displayIds.length) return onError("Choose at least one screen.");
    setBusy(true);
    try {
      await api(`/api/playlists/${playlistId}/publish`, { method: "POST", body: JSON.stringify({ displayIds }) });
      onDone("Published to the selected screens. They update within about 10 seconds.");
    } catch (err) {
      onError((err as Error).message);
      setBusy(false);
    }
  }

  const selected = playlists.data?.find((playlist) => playlist.id === playlistId);
  return (
    <div className="fixed inset-0 z-50 bg-ink/50 flex items-end md:items-center justify-center" onClick={onClose}>
      <div role="dialog" aria-label="Assign playlist" className="bg-paper w-full md:max-w-lg max-h-[85dvh] overflow-y-auto rounded-t-2xl md:rounded-2xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
        onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold">Assign playlist</h2>
          <button type="button" className="btn btn-quiet px-3" onClick={onClose}>Close</button>
        </div>
        <p className="text-sm text-muted mb-4">
          This publishes the playlist&apos;s saved draft to every screen you check. Screens already playing this playlist start checked. Unchecking one takes the playlist off that screen.
        </p>
        {!playlists.data ? <LoadState error={playlists.error} /> : playlists.data.length === 0 ? (
          <p className="text-muted">Create a playlist first.</p>
        ) : (
          <>
            <label className="grid gap-1 mb-4">
              <span className="text-sm font-medium">Playlist</span>
              <select className="field" aria-label="Playlist to assign" value={playlistId} onChange={(event) => pickPlaylist(event.target.value)}>
                <option value="">Choose a playlist</option>
                {playlists.data.map((playlist) => (
                  <option key={playlist.id} value={playlist.id}>{playlist.name}</option>
                ))}
              </select>
            </label>
            {selected ? <p className="text-xs text-muted mb-3">{selected.slideCount} {selected.slideCount === 1 ? "slide" : "slides"} in the draft.</p> : null}
            <ul className="grid gap-2 mb-4">
              {displays.map((display) => (
                <li key={display.id}>
                  <label className="flex items-center gap-3 min-h-11">
                    <input type="checkbox" className="size-5" checked={!!chosen[display.id]} aria-label={`Assign ${display.name}`}
                      onChange={(event) => setChosen({ ...chosen, [display.id]: event.target.checked })} />
                    <span>{display.name}</span>
                  </label>
                </li>
              ))}
            </ul>
            <button type="button" className="btn btn-primary w-full" disabled={busy} onClick={publish}>
              {busy ? "Publishing…" : "Publish to selected screens"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function DisplaysPage() {
  return <Displays />;
}
