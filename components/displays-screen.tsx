"use client";
import { usePeekWeb } from "@/lib/peek-flag";
import { CodeInput, btnClass, OverflowMenu as PeekOverflowMenu } from "@/components/peek/ui";
import { Dialog } from "@/components/dialog";
import { useEffect, useRef, useState } from "react";
import { api, useApi, type DisplayItem, type LocationItem, type MediaItem, type PlaylistSummary } from "@/lib/api";
import { OfflineAlert, ScreenCard, onlineHint } from "@/components/tv";
import { useLocale, useT } from "@/lib/i18n/client";
import { OrientationChoice } from "@/components/screen-orientation";
import type { BoardOrientation } from "@/lib/board-orientation";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm";
import { IconTv } from "@/components/icons";
import { EmptyState, LoadState, PageHeader, useRequiredMessage } from "@/components/ui";
import { byName, SEARCH_FROM } from "@/components/playlist-list";
import { screenNameWarning } from "@/lib/screen-names";
import { syncLine } from "@/lib/sync-line";
import { assignBusyFor } from "@/lib/assign-publish";
import { publishSavedCopy, publishSavedCopyForTargets, publishTimingCopy } from "@/lib/screen-actions-ui";

const PAIR_WATCH_MS = 3_000;
const PAIR_WATCH_FOR_MS = 2 * 60_000;

export type PairWatch = { id: string | null; before: string[] };

/**
 * True once the screen just paired has its token and a first heartbeat. Other screens (for example
 * one that is offline) never hold the "Connecting" banner up. Without the new id, the first screen
 * that was not in the list before pairing is used.
 */
export function pairingSettled(list: DisplayItem[] | null | undefined, watch: PairWatch): boolean {
  if (!list) return false;
  const ready = (display: DisplayItem) => display.connected && Boolean(display.lastSeenAt);
  if (watch.id) {
    const paired = list.find((display) => display.id === watch.id);
    return paired ? ready(paired) : false;
  }
  return list.some((display) => !watch.before.includes(display.id) && ready(display));
}

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
  const t = useT();
  const peek = usePeekWeb();
  const { locale } = useLocale();
  // After pairing, check every few seconds (even if this tab is behind the TV window) until the
  // new screen reports in, so the card flips from "Waiting" to "Online" by itself (QA B1-08).
  const [watchUntil, setWatchUntil] = useState(0);
  const [watch, setWatch] = useState<PairWatch>({ id: null, before: [] });
  const beforePair = useRef<string[]>([]);
  const reloadDisplays = displays.reload;
  const settled = pairingSettled(displays.data, watch);
  useEffect(() => {
    if (!watchUntil || fixture) return;
    if (settled) { setWatchUntil(0); return; }
    const timer = setInterval(() => {
      if (Date.now() > watchUntil) { setWatchUntil(0); return; }
      reloadDisplays();
    }, PAIR_WATCH_MS);
    return () => clearInterval(timer);
  }, [watchUntil, settled, reloadDisplays, fixture]);

  async function rename(display: DisplayItem) {
    const name = await confirm.ask({
      title: t("disp.renameTitle"),
      body: t("disp.renameBody"),
      confirmLabel: t("disp.saveName"),
      input: { label: t("disp.name"), ariaLabel: t("disp.newName"), defaultValue: display.name, maxLength: 60 },
    });
    if (typeof name !== "string" || name === display.name) return;
    const others = (displays.data ?? []).filter((item) => item.id !== display.id).map((item) => item.name);
    const dup = screenNameWarning(name, others, t);
    if (dup) toast.show(t("disp.suggested", { warning: dup.nameWarning, name: dup.suggestedName }));
    try {
      await api(`/api/displays/${display.id}`, { method: "PATCH", body: JSON.stringify({ name }) });
      toast.show(t("disp.renamed"));
      displays.reload();
    } catch (err) {
      toast.show((err as Error).message, true);
    }
  }

  async function disconnect(display: DisplayItem) {
    const ok = await confirm.ask({
      title: t("disp.disconnectTitle"),
      body: t("disp.disconnectBody", { name: display.name }),
      confirmLabel: t("disp.disconnectConfirm"),
      danger: true,
    });
    if (ok !== true) return;
    try {
      await api(`/api/displays/${display.id}`, { method: "DELETE" });
      toast.show(t("disp.disconnected"));
      displays.reload();
    } catch (err) {
      toast.show((err as Error).message, true);
    }
  }

  return (
    <section>
      <PageHeader title={t("disp.title")} icon={<IconTv />} lede={onlineHint(t)}
        action={
          <a href="#add-screen" className="btn btn-primary" data-testid="add-screen"
            onClick={(event) => { event.preventDefault(); const form = document.getElementById("add-screen"); form?.scrollIntoView({ behavior: "smooth", block: "start" }); (form?.querySelector("input") as HTMLInputElement | null)?.focus({ preventScroll: true }); }}>
            {t("screens.add")}
          </a>
        }
      />
      <div className="mb-4">
        <button type="button" className="btn btn-quiet" onClick={() => setAssigning([])}>{t("disp.assignPlaylist")}</button>
      </div>
      {displays.data ? <OfflineAlert displays={displays.data} /> : null}
      {watchUntil ? (
        <p role="status" className="card p-3 mb-3 text-sm" data-testid="pair-watch">{t("disp.connecting")}</p>
      ) : null}
      <PairForm names={(displays.data ?? []).map((display) => display.name)}
        onPaired={(warning, id) => {
          toast.show(warning || t("disp.connected"));
          // Guest editor (Show on my TV): the menu made before sign-up opens next, with this TV to publish to.
          const guestMenu = new URLSearchParams(location.search).get("menu");
          if (guestMenu && /^[0-9a-f-]{36}$/i.test(guestMenu) && id) { location.assign(`/dashboard/media/menus?board=${guestMenu}&screen=${id}`); return; }
          setWatch({ id: id ?? null, before: beforePair.current });
          displays.reload();
          setWatchUntil(Date.now() + PAIR_WATCH_FOR_MS);
        }}
        onSubmitting={() => { beforePair.current = (displays.data ?? []).map((display) => display.id); }}
        onError={(message) => toast.show(message, true)} />

      {!displays.data ? (
        <div className="mt-8"><LoadState error={displays.error} label={t("screens.loading")} /></div>
      ) : displays.data.length === 0 ? (
        <div className="mt-8"><EmptyState title={t("screens.emptyTitle")}>{t("disp.emptyBody")}</EmptyState></div>
      ) : (
        <>
        {displays.data.length >= SEARCH_FROM ? (
          <input className="field mt-8" type="search" aria-label={t("disp.search")} placeholder={t("disp.search")} value={search} onChange={(e) => setSearch(e.target.value)} />
        ) : null}
        {byName(displays.data, search).length === 0 ? <div className="mt-8"><EmptyState title={t("disp.noMatchTitle")}>{t("disp.noMatchBody")}</EmptyState></div> : null}
        <ul className="mt-8 grid gap-4 lg:grid-cols-2">
          {byName(displays.data, search).map((display) => (
            <li key={display.id}>
              <ScreenCard display={display} actions={
                <>
                  {display.connected && display.reportedState && display.reportedState !== "unknown" ? (
                    <p className="w-full text-xs text-muted" data-testid="sync-state">
                      {syncLine(display, t)}
                    </p>
                  ) : null}
                  {display.nextChange ? (
                    <p className="w-full text-xs text-muted">{t("screens.nextChange", { label: display.nextChange.label })}</p>
                  ) : null}
                  {display.currentSchedule ? (
                    <p className="w-full text-xs text-muted" data-testid="current-schedule">
                      <span className="badge badge-live mr-1">{t("disp.scheduled")}</span>
                      {t("disp.schedulePlays", { name: display.currentSchedule.name, playlist: display.currentSchedule.playlistName || t("disp.aPlaylist") })}
                      {display.currentSchedule.until ? t("disp.until", { when: new Date(display.currentSchedule.until).toLocaleString(locale === "es" ? "es" : [], { weekday: "short", hour: "numeric", minute: "2-digit", hour12: locale !== "es" }) }) : ""}
                    </p>
                  ) : null}
                  {locations.data && locations.data.length > 0 ? (
                    <label className="w-full text-xs font-semibold text-muted">
                      {t("disp.location")}
                      <select
                        aria-label={t("disp.locationFor", { name: display.name })}
                        className="field mt-1"
                        value={display.location?.id ?? ""}
                        onChange={async (event) => {
                          const locationId = event.target.value || null;
                          try {
                            await api(`/api/displays/${display.id}`, { method: "PATCH", body: JSON.stringify({ locationId }) });
                            toast.show(t("disp.locationSaved"));
                            displays.reload();
                          } catch (err) {
                            toast.show((err as Error).message, true);
                          }
                        }}
                      >
                        <option value="">{t("disp.noLocation")}</option>
                        {locations.data.map((location) => (
                          <option key={location.id} value={location.id}>{location.name}</option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  {peek ? (
                    // Peek preview: same actions and confirmations; secondary ones move into the ⋯ menu (sheet on phones).
                    <div className="w-full flex items-center gap-2">
                      <button type="button" className={btnClass("tint", "default", "flex-1")} onClick={() => setPicking(display)}>{t("disp.changeImage")}</button>
                      <PeekOverflowMenu label={t("screens.moreFor", { name: display.name })} items={[
                        { id: "assign", label: t("disp.assignHere"), onSelect: () => setAssigning([display.id]) },
                        { id: "rename", label: t("disp.rename"), onSelect: () => { void rename(display); } },
                        { id: "disconnect", label: t("disp.disconnect"), danger: true, onSelect: () => { void disconnect(display); } },
                      ]} />
                    </div>
                  ) : (
                  <>
                  <button type="button" className="btn btn-primary" onClick={() => setPicking(display)}>{t("disp.changeImage")}</button>
                  <button type="button" className="btn btn-quiet" onClick={() => setAssigning([display.id])}>{t("disp.assignHere")}</button>
                  <button type="button" className="btn btn-quiet" onClick={() => rename(display)}>{t("disp.rename")}</button>
                  <button type="button" className="btn btn-quiet text-danger" onClick={() => disconnect(display)}>{t("disp.disconnect")}</button>
                  </>
                  )}
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

function PairForm({ names, onPaired, onSubmitting, onError }: { names: string[]; onPaired: (warning?: string, id?: string) => void; onSubmitting?: () => void; onError: (message: string) => void }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [orientation, setOrientation] = useState<BoardOrientation>("landscape");
  const [busy, setBusy] = useState(false);
  const t = useT();
  const requiredMsg = useRequiredMessage();
  const peek = usePeekWeb();
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    onSubmitting?.();
    try {
      const paired = await api<{ id?: string; nameWarning?: string; suggestedName?: string }>("/api/displays/pair", { method: "POST", body: JSON.stringify(orientation === "portrait" ? { code, name, orientation } : { code, name }) });
      // The server warning is English; show the same check in the UI language (I18N-2).
      const local = screenNameWarning(name, names, t);
      setCode("");
      setName("");
      setOrientation("landscape");
      onPaired(paired.nameWarning ? t("disp.suggested", { warning: local?.nameWarning ?? paired.nameWarning, name: paired.suggestedName ?? local?.suggestedName ?? "" }) : undefined, typeof paired.id === "string" ? paired.id : undefined);
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form id="add-screen" onSubmit={submit} className={`card p-4 md:p-5 scroll-mt-20 md:scroll-mt-4${peek ? " pk-pair" : ""}`} aria-labelledby="add-screen-title">
      <h2 id="add-screen-title" className="font-semibold">{t("disp.addTitle")}</h2>
      <ol className="mt-2 mb-4 grid gap-2 text-sm text-muted list-decimal pl-5">
        <li>{t("disp.step1")}
          <PlayerUrl />
        </li>
        <li>{t("disp.step2")}</li>
        <li>{t("disp.step3a")} <strong className="text-ink">{t("disp.connectTv")}</strong>. {t("disp.step3b")}</li>
      </ol>
      <div className={peek ? "grid gap-3 lg:grid-cols-[auto_1fr_auto] lg:items-center pk-pair-row" : "grid gap-3 lg:grid-cols-[10rem_1fr_auto]"}>
        {/* Peek preview: the same single input drawn as 6 boxes (03-COMPONENTS). The server normalizes either form. */}
        {peek ? <CodeInput value={code} onChange={setCode} label={t("disp.codeLabel")} required inputProps={requiredMsg} /> : (
        <input className="field text-xl tracking-[0.2em] font-semibold" inputMode="numeric" autoComplete="one-time-code"
          placeholder="123 456" maxLength={7} required {...requiredMsg} value={code}
          onChange={(event) => setCode(event.target.value.replace(/[^\d ]/g, ""))} aria-label={t("disp.codeLabel")} />
        )}
        <input className="field" placeholder={t("disp.namePlaceholder")} maxLength={60} required {...requiredMsg}
          value={name} onChange={(event) => setName(event.target.value)} aria-label={t("disp.tvName")} />
        <button className="btn btn-primary" disabled={busy}>{busy ? t("disp.connectingShort") : t("disp.connectTv")}</button>
      </div>
      <div className="mt-3"><OrientationChoice name="pair" value={orientation} onChange={setOrientation} disabled={busy} /></div>
      {screenNameWarning(name, names, t) ? (
        <p role="status" className="text-sm mt-3">{screenNameWarning(name, names, t)?.nameWarning}</p>
      ) : null}
      <p className="text-xs text-muted mt-3">{t("disp.addressAlsoIn")} <a className="underline" href="/dashboard/settings" aria-label={t("disp.openSettingsAria")}>{t("disp.settings")}</a>.</p>
    </form>
  );
}

function PlayerUrl() {
  const [url, setUrl] = useState("/pair");
  const [copied, setCopied] = useState(false);
  const t = useT();
  useEffect(() => { setUrl(`${window.location.origin}/pair`); }, []);
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
      <span className="text-sm text-muted">{t("disp.samePlayer", { host: url.replace(/^https?:\/\//, "").replace(/\/pair$/, "/tv") })}</span>
      <button type="button" className="btn" onClick={copy} aria-label={t("disp.copyAddress")}>{copied ? t("disp.copied") : t("disp.copy")}</button>
      <span role="status" className="sr-only">{copied ? t("disp.addressCopied") : ""}</span>
    </span>
  );
}

function Picker({ display, onClose, onPublished, onError }: {
  display: DisplayItem; onClose: () => void; onPublished: (label: string) => void; onError: (message: string) => void;
}) {
  const media = useApi<MediaItem[]>("/api/media");
  const [busy, setBusy] = useState(false);
  const t = useT();
  async function publish(mediaId: string | null) {
    setBusy(true);
    try {
      await api(`/api/displays/${display.id}`, { method: "PATCH", body: JSON.stringify({ mediaId }) });
      onPublished(mediaId ? publishSavedCopy(display, t) : t("disp.cleared", { name: display.name }));
    } catch (err) {
      onError((err as Error).message);
      setBusy(false);
    }
  }
  const images = (media.data ?? []).filter((item) => item.kind !== "video");
  return (
    <Dialog onClose={onClose} label={t("disp.chooseImageFor", { name: display.name })}
        className="bg-paper w-full md:max-w-2xl max-h-[85dvh] overflow-y-auto rounded-t-2xl md:rounded-2xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold">{t("disp.publishTo", { name: display.name })}</h2>
          <button type="button" className="btn btn-quiet px-3" onClick={onClose} aria-label={t("disp.close")}>{t("disp.close")}</button>
        </div>
        <p className="text-sm text-muted mb-4">
          {t("disp.tapImage")} {publishTimingCopy(display, t)}
          {display.playlist ? t("disp.replacesPlaylist") : ""}
        </p>
        {!media.data ? <LoadState error={media.error} /> : images.length === 0 ? (
          <p className="text-muted">{t("disp.uploadFirst")}</p>
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
                    <span className="block mt-1 text-sm truncate">{current ? t("disp.onScreenNow") : item.fileName}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {display.media ? (
          <button type="button" className="btn btn-quiet w-full mt-5" disabled={busy} onClick={() => publish(null)}>{t("disp.clearScreen")}</button>
        ) : null}
      </Dialog>
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
  const confirm = useConfirm();
  const t = useT();
  const [playlistId, setPlaylistId] = useState("");
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState<null | "checking" | "publishing">(null);
  const [chosen, setChosen] = useState<Record<string, boolean>>(() => {
    const next: Record<string, boolean> = {};
    for (const id of initialIds) next[id] = true;
    return next;
  });

  function pickPlaylist(id: string) {
    setPlaylistId(id);
    const next: Record<string, boolean> = {};
    for (const display of displays) next[display.id] = display.playlist?.id === id || initialIds.includes(display.id);
    setChosen(next);
  }

  async function publish() {
    const displayIds = Object.entries(chosen).filter(([, on]) => on).map(([id]) => id);
    if (!playlistId) return onError(t("disp.choosePlaylist"));
    if (!displayIds.length) return onError(t("disp.chooseScreen"));
    setBusy(assignBusyFor("preview"));
    let committing = false;
    try {
      const preview = await api<{
        affected: { name: string; change: "assign" }[];
        kept: { name: string }[];
        willBeCleared: { name: string }[];
        overriddenBySchedule: { name: string; scheduleName: string }[];
        offline: { name: string }[];
      }>("/api/displays/publish", {
        method: "POST",
        signal: AbortSignal.timeout(20_000),
        body: JSON.stringify({ playlistId, displayIds, commit: false }),
      });
      // Clear 'Checking…' before the confirm so it cannot stick while the dialog is open.
      setBusy(assignBusyFor("confirm"));
      const assign = preview.affected.map((item) => item.name);
      const cleared = preview.willBeCleared.map((item) => item.name);
      const ok = await confirm.ask({
        title: replace ? t("disp.replaceTitle") : t("disp.publishTitle"),
        body: [
          assign.length ? t("disp.willPlay", { names: assign.join(", ") }) : t("disp.alreadyPlay"),
          cleared.length && replace ? t("disp.willTakeOff", { names: cleared.join(", ") }) : "",
          cleared.length && !replace ? t("disp.willKeep", { names: cleared.join(", ") }) : "",
          preview.kept.length ? t("disp.keptOthers", { n: preview.kept.length }) : "",
          preview.overriddenBySchedule.length ? t("disp.scheduleWins", { names: preview.overriddenBySchedule.map((item) => item.name).join(", ") }) : "",
          preview.offline.length ? t("disp.offlineUntil", { names: preview.offline.map((item) => item.name).join(", ") }) : "",
        ].filter(Boolean).join(" "),
        confirmLabel: replace ? t("disp.replaceAndPublish") : t("disp.publish"),
      });
      if (ok !== true) return;
      committing = true;
      setBusy(assignBusyFor("commit"));
      await api("/api/displays/publish", {
        method: "POST",
        signal: AbortSignal.timeout(20_000),
        body: JSON.stringify({ playlistId, displayIds, commit: true, replace }),
      });
      const offlineNames = new Set(preview.offline.map((item) => item.name));
      const targets = displays.filter((item) => displayIds.includes(item.id)).map((item) => ({
        online: item.online && !offlineNames.has(item.name),
        connected: item.connected,
      }));
      onDone(publishSavedCopyForTargets(targets, t));
    } catch (err) {
      const timedOut = err instanceof DOMException && (err.name === "TimeoutError" || err.name === "AbortError");
      if (timedOut && committing) onDone(t("disp.stillPublishing"));
      else onError(timedOut ? t("disp.previewSlow") : (err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const selected = playlists.data?.find((playlist) => playlist.id === playlistId);
  return (
    <>
    <Dialog onClose={onClose} label={t("disp.assignPlaylist")} className="bg-paper w-full md:max-w-lg max-h-[85dvh] overflow-y-auto rounded-t-2xl md:rounded-2xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold">{t("disp.assignPlaylist")}</h2>
          <button type="button" className="btn btn-quiet px-3" onClick={onClose}>{t("disp.close")}</button>
        </div>
        <p className="text-sm text-muted mb-4">
          {t("disp.assignHelp")}
        </p>
        {!playlists.data ? <LoadState error={playlists.error} /> : playlists.data.length === 0 ? (
          <p className="text-muted">{t("disp.createPlaylistFirst")}</p>
        ) : (
          <>
            <label className="grid gap-1 mb-4">
              <span className="text-sm font-medium">{t("disp.playlist")}</span>
              <select className="field" aria-label={t("disp.playlistToAssign")} value={playlistId} onChange={(event) => pickPlaylist(event.target.value)}>
                <option value="">{t("disp.choosePlaylistOption")}</option>
                {playlists.data.map((playlist) => (
                  <option key={playlist.id} value={playlist.id}>{playlist.name}</option>
                ))}
              </select>
            </label>
            {selected ? <p className="text-xs text-muted mb-3">{t(selected.slideCount === 1 ? "disp.oneSlide" : "disp.manySlides", { n: selected.slideCount })}</p> : null}
            <ul className="grid gap-2 mb-4">
              {displays.map((display) => (
                <li key={display.id}>
                  <label className="flex items-center gap-3 min-h-11">
                    <input type="checkbox" className="size-5" checked={!!chosen[display.id]} aria-label={t("disp.assignName", { name: display.name })}
                      onChange={(event) => setChosen({ ...chosen, [display.id]: event.target.checked })} />
                    <span>{display.name}</span>
                  </label>
                </li>
              ))}
            </ul>
            <label className="flex items-center gap-3 min-h-11 mb-4 text-sm">
              <input type="checkbox" className="size-5" checked={replace} onChange={(event) => setReplace(event.target.checked)} aria-label={t("disp.replaceAria")} />
              <span>{t("disp.replaceLabel")}</span>
            </label>
            <button type="button" className="btn btn-primary w-full" disabled={busy !== null} onClick={publish}>
              {busy === "checking" ? t("disp.checking") : busy === "publishing" ? t("disp.publishing") : t("disp.publishSelected")}
            </button>
          </>
        )}
      </Dialog>
    {confirm.node}
    </>
  );
}

export default function DisplaysPage() {
  return <Displays />;
}
