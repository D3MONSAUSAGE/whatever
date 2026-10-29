"use client";
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
  return <span className="badge" title={ONLINE_HINT}>Offline</span>;
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
