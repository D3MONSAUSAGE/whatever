"use client";
import { useEffect } from "react";
import { timeAgo, type DisplayItem } from "@/lib/api";
import { ONLINE_MS } from "@/lib/server/limits";

export const ONLINE_HINT = `A screen is online when its player has sent a heartbeat in the last ${Math.round(ONLINE_MS / 1000)} seconds.`;

export function contentLabel(display: DisplayItem) {
  if (display.media) return display.media.fileName;
  if (display.playlist) return display.playlist.name;
  if (!display.connected) return "Waiting for the TV to finish pairing";
  return "No content assigned";
}

export function heartbeatLabel(iso: string | null) {
  if (!iso) return "No heartbeat yet";
  return `Last heartbeat ${timeAgo(iso)}`;
}

export function Tv({ display, onClick }: { display: DisplayItem; onClick?: () => void }) {
  const url = display.media?.url || display.playlist?.url || null;
  return (
    <button type="button" onClick={onClick} disabled={!url || !onClick}
      aria-label={url ? `Preview what ${display.name} shows` : undefined}
      className="tv w-full grid place-items-center text-sm text-white/60">
      {url ? <img src={url} alt="" /> : <span className="px-4 text-center">{display.connected ? "No content assigned" : "Waiting for TV"}</span>}
    </button>
  );
}

export function Status({ display }: { display: DisplayItem }) {
  if (!display.connected) return <span className="badge">Waiting</span>;
  if (display.online) {
    return (
      <span className="badge badge-live" title={ONLINE_HINT}>
        <span className="size-1.5 rounded-full bg-live" aria-hidden />
        Online
      </span>
    );
  }
  return (
    <span className="badge badge-danger" title={ONLINE_HINT}>
      <span className="size-1.5 rounded-full bg-danger" aria-hidden />
      Offline{display.lastSeenAt ? ` · ${offlineFor(display.lastSeenAt)}` : ""}
    </span>
  );
}

export function ScreenCard({
  display,
  actions,
}: {
  display: DisplayItem;
  actions?: React.ReactNode;
}) {
  return (
    <article id={display.id} className="card overflow-hidden scroll-mt-20 flex flex-col">
      <div className="p-3 pb-0">
        <Tv display={display} onClick={() => displayPreview(display)} />
      </div>
      <div className="p-4 flex flex-col gap-2 flex-1">
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-semibold truncate">{display.name}</h2>
          <Status display={display} />
        </div>
        <p className="text-sm truncate">{contentLabel(display)}</p>
        {display.location ? <p className="text-xs text-muted truncate">{display.location.name} · {display.location.timezone}</p> : null}
        <p className="text-xs text-muted">
          <time dateTime={display.lastSeenAt ?? undefined}>{heartbeatLabel(display.lastSeenAt)}</time>
        </p>
        {display.playerError ? <p className="text-sm text-danger" role="alert">{display.playerError}</p> : null}
        {actions ? <div className="mt-auto pt-2 flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </article>
  );
}

function displayPreview(display: DisplayItem) {
  const url = display.media?.url || display.playlist?.url;
  if (url) window.open(url, "_blank", "noopener");
}

/** "19 h", "3 min", "2 days": how long since the last heartbeat. */
export function offlineFor(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min`;
  if (s < 86400) return `${Math.round(s / 3600)} h`;
  const d = Math.round(s / 86400);
  return `${d} day${d === 1 ? "" : "s"}`;
}

/** Paired screens that stopped sending heartbeats. Unpaired screens are not counted. */
export function offlineScreens(displays: DisplayItem[]) {
  return displays.filter((d) => d.connected && !d.online);
}

/** Shows which screens are offline, and puts the count in the browser tab title. */
export function OfflineAlert({ displays, linkToDisplays = false }: { displays: DisplayItem[]; linkToDisplays?: boolean }) {
  const offline = offlineScreens(displays);
  useEffect(() => {
    const apply = () => {
      const base = document.title.replace(/^\(\d+ offline\) /, "");
      const next = offline.length ? `(${offline.length} offline) ${base}` : base;
      if (document.title !== next) document.title = next;
    };
    apply();
    // Next.js can set the page title after this effect on first load; re-apply when it does.
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { subtree: true, childList: true, characterData: true });
    return () => { observer.disconnect(); document.title = document.title.replace(/^\(\d+ offline\) /, ""); };
  }, [offline.length]);
  if (offline.length === 0) return null;
  const names = offline.slice(0, 4);
  return (
    <div role="status" data-testid="offline-alert" className="note-error mb-6 flex flex-col gap-1.5">
      <p className="font-semibold">
        {offline.length === 1 ? "1 screen is offline" : `${offline.length} screens are offline`}
      </p>
      <ul className="text-sm">
        {names.map((d) => (
          <li key={d.id}>
            <a href={`/dashboard/displays#${d.id}`} className="underline">{d.name}</a>
            {d.lastSeenAt ? ` — no heartbeat for ${offlineFor(d.lastSeenAt)}` : " — never sent a heartbeat"}
          </li>
        ))}
        {offline.length > names.length ? <li>and {offline.length - names.length} more</li> : null}
      </ul>
      <p className="text-sm text-ink/80">
        Check that the TV is on, connected to Wi-Fi, and showing the Seemple player.
        {linkToDisplays ? <> <a href="/dashboard/displays" className="underline">Open Displays</a>.</> : null}
        {" "}This page refreshes every 10 seconds.
      </p>
    </div>
  );
}
