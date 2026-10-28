"use client";
import { useState } from "react";
import { api, useApi, type DisplayItem, type MediaItem } from "@/lib/api";
import { Status, Tv } from "@/components/tv";
import { useToast } from "@/components/toast";

export default function Displays() {
  const displays = useApi<DisplayItem[]>("/api/displays", 10_000);
  const [picking, setPicking] = useState<DisplayItem | null>(null);
  const toast = useToast();

  async function rename(d: DisplayItem) {
    const name = prompt("Name this TV", d.name)?.trim();
    if (!name || name === d.name) return;
    try { await api(`/api/displays/${d.id}`, { method: "PATCH", body: JSON.stringify({ name }) }); toast.show("Renamed"); displays.reload(); }
    catch (e) { toast.show((e as Error).message, true); }
  }
  async function disconnect(d: DisplayItem) {
    if (!confirm(`Disconnect “${d.name}”? The TV will go back to showing a pairing code.`)) return;
    try { await api(`/api/displays/${d.id}`, { method: "DELETE" }); toast.show("Disconnected"); displays.reload(); }
    catch (e) { toast.show((e as Error).message, true); }
  }

  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight mb-6">Displays</h1>
      <PairForm onPaired={() => { toast.show("Connected. The TV will switch over in a few seconds."); displays.reload(); }}
        onError={(m) => toast.show(m, true)} />

      {!displays.data ? (
        <p className="text-muted mt-8">{displays.error || "Loading…"}</p>
      ) : (
        <ul className="mt-8 grid gap-8 sm:grid-cols-2">
          {displays.data.map((d) => (
            <li key={d.id}>
              <Tv display={d} onClick={() => d.media?.url && window.open(d.media.url, "_blank")} />
              <div className="mt-3 flex items-center justify-between gap-3">
                <h2 className="font-semibold truncate">{d.name}</h2>
                <Status display={d} />
              </div>
              <p className="text-sm text-muted truncate">
                {d.media ? `Showing ${d.media.fileName}` : d.playlist ? `Showing playlist ${d.playlist.name}` : "Nothing published yet"}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="btn btn-primary flex-1" onClick={() => setPicking(d)}>Change image</button>
                <button className="btn btn-quiet" onClick={() => rename(d)}>Rename</button>
                <button className="btn btn-quiet text-danger" onClick={() => disconnect(d)}>Disconnect</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {picking && (
        <Picker display={picking} onClose={() => setPicking(null)}
          onPublished={(label) => { setPicking(null); toast.show(label); displays.reload(); }}
          onError={(m) => toast.show(m, true)} />
      )}
      {toast.node}
    </section>
  );
}

function PairForm({ onPaired, onError }: { onPaired: () => void; onError: (m: string) => void }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/displays/pair", { method: "POST", body: JSON.stringify({ code, name }) });
      setCode(""); setName(""); onPaired();
    } catch (err) { onError((err as Error).message); }
    finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="rounded-lg bg-white border border-line p-4 md:p-5">
      <h2 className="font-semibold">Connect a TV</h2>
      <p className="text-sm text-muted mb-4">Open <strong>/player</strong> in the TV&apos;s browser, then enter the code it shows.</p>
      <div className="grid gap-3 md:grid-cols-[10rem_1fr_auto]">
        <input className="field text-xl tracking-[0.2em] font-semibold" inputMode="numeric" autoComplete="one-time-code"
          placeholder="123 456" maxLength={7} required value={code}
          onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ""))} aria-label="Code on the TV" />
        <input className="field" placeholder="Name, like Front counter" maxLength={60} required
          value={name} onChange={(e) => setName(e.target.value)} aria-label="TV name" />
        <button className="btn btn-primary" disabled={busy}>{busy ? "Connecting…" : "Connect TV"}</button>
      </div>
    </form>
  );
}

function Picker({ display, onClose, onPublished, onError }: {
  display: DisplayItem; onClose: () => void; onPublished: (label: string) => void; onError: (m: string) => void;
}) {
  const media = useApi<MediaItem[]>("/api/media");
  const [busy, setBusy] = useState(false);
  async function publish(mediaId: string | null) {
    setBusy(true);
    try {
      await api(`/api/displays/${display.id}`, { method: "PATCH", body: JSON.stringify({ mediaId }) });
      onPublished(mediaId ? `Published to ${display.name}` : `Cleared ${display.name}`);
    } catch (e) { onError((e as Error).message); setBusy(false); }
  }
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center" onClick={onClose}>
      <div role="dialog" aria-label={`Choose an image for ${display.name}`}
        className="bg-paper w-full md:max-w-2xl max-h-[85dvh] overflow-y-auto rounded-t-2xl md:rounded-2xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold">Publish to {display.name}</h2>
          <button className="btn px-3" onClick={onClose} aria-label="Close">Close</button>
        </div>
        <p className="text-sm text-muted mb-4">
          Tap an image. The TV updates within about 10 seconds.
          {display.playlist ? " This replaces the playlist on this TV." : ""}
        </p>
        {!media.data ? <p className="text-muted">{media.error || "Loading…"}</p> : media.data.length === 0 ? (
          <p className="text-muted">Upload an image in Media first.</p>
        ) : (
          <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {media.data.map((m) => {
              const current = display.media?.id === m.id;
              return (
                <li key={m.id}>
                  <button disabled={busy || current} onClick={() => publish(m.id)}
                    className={`w-full text-left ${current ? "opacity-60" : ""}`}>
                    <span className="block aspect-video bg-black rounded-md overflow-hidden">
                      {m.url && <img src={m.url} alt="" className="size-full object-contain" />}
                    </span>
                    <span className="block mt-1 text-sm truncate">{current ? "On screen now" : m.fileName}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {display.media && (
          <button className="btn btn-quiet w-full mt-5" disabled={busy} onClick={() => publish(null)}>Clear screen</button>
        )}
      </div>
    </div>
  );
}
