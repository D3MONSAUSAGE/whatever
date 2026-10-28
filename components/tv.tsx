"use client";
import { timeAgo, type DisplayItem } from "@/lib/api";

export function Tv({ display, onClick }: { display: DisplayItem; onClick?: () => void }) {
  const url = display.media?.url || display.playlist?.url || null;
  return (
    <button type="button" onClick={onClick} disabled={!url || !onClick}
      aria-label={url ? `Preview what ${display.name} shows` : undefined}
      className="tv w-full grid place-items-center text-sm text-white/60">
      {url ? <img src={url} alt="" /> : <span>{display.connected ? "No content assigned" : "Waiting for TV"}</span>}
    </button>
  );
}

export function Status({ display }: { display: DisplayItem }) {
  if (!display.connected) return <span className="text-sm text-muted">Waiting for the TV to finish connecting</span>;
  return (
    <span className="inline-flex items-center gap-2 text-sm">
      <span className={`size-2.5 rounded-full ${display.online ? "bg-live" : "bg-muted/40"}`} />
      {display.online ? "Online" : <span className="text-muted">Offline, last seen {timeAgo(display.lastSeenAt)}</span>}
    </span>
  );
}

