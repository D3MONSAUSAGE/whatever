"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, useApi, type AlertFeed, type AlertItem, type AlertPrefs } from "@/lib/api";
import { EmptyState, LoadState, PageHeader } from "@/components/ui";
import { IconTv } from "@/components/icons";

function when(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
function dur(s: number | null) {
  const m = Math.max(1, Math.round((s ?? 0) / 60));
  return m < 120 ? `${m} min` : `${Math.round(m / 6) / 10} h`;
}
export function alertText(a: AlertItem) {
  return a.kind === "screen.offline"
    ? `"${a.screenName}" went offline around ${when(a.offlineSince)}`
    : `"${a.screenName}" is back online after ${dur(a.offlineSeconds)}`;
}

const ALERTS_CHANGED = "seemple-alerts-changed";

/** Banner at the top of every dashboard page while there are unread alerts. */
export function AlertsBanner() {
  const feed = useApi<AlertFeed>("/api/alerts?unread=1&limit=3", 60_000);
  const [busy, setBusy] = useState(false);
  const { reload } = feed;
  useEffect(() => {
    window.addEventListener(ALERTS_CHANGED, reload);
    return () => window.removeEventListener(ALERTS_CHANGED, reload);
  }, [reload]);
  if (!feed.data || feed.data.unread === 0) return null;
  const offline = feed.data.alerts.some((a) => a.kind === "screen.offline");
  async function markAll() {
    setBusy(true);
    try { await api("/api/alerts/read", { method: "POST", body: JSON.stringify({ all: true }) }); await feed.reload(); } finally { setBusy(false); }
  }
  return (
    <div role="status" data-testid="alerts-banner" className={`card mb-5 p-3 md:p-4 border-l-4 ${offline ? "border-l-danger" : "border-l-live-strong"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">{feed.data.unread === 1 ? "1 new screen alert" : `${feed.data.unread} new screen alerts`}</p>
          <ul className="text-sm mt-1 grid gap-0.5">
            {feed.data.alerts.map((a) => (
              <li key={a.id}><span aria-hidden>{a.kind === "screen.offline" ? "🔴 " : "🟢 "}</span>{alertText(a)}</li>
            ))}
          </ul>
        </div>
        <div className="flex gap-2 shrink-0">
          <Link href="/dashboard/alerts" className="btn btn-quiet">All alerts</Link>
          <button type="button" className="btn btn-quiet" disabled={busy} onClick={markAll}>Mark as read</button>
        </div>
      </div>
    </div>
  );
}

export function AlertsScreen() {
  const first = useApi<AlertFeed>("/api/alerts?limit=30", 60_000);
  const [more, setMore] = useState<AlertItem[]>([]);
  const [next, setNext] = useState<string | null | undefined>(undefined);
  const cursor = next === undefined ? first.data?.nextBefore ?? null : next;
  const alerts = [...(first.data?.alerts ?? []), ...more];
  async function loadMore() {
    if (!cursor) return;
    const page = await api<AlertFeed>(`/api/alerts?limit=30&before=${encodeURIComponent(cursor)}`);
    setMore((m) => [...m, ...page.alerts]);
    setNext(page.nextBefore);
  }
  async function markAll() {
    await api("/api/alerts/read", { method: "POST", body: JSON.stringify({ all: true }) });
    setMore((m) => m.map((a) => ({ ...a, read: true })));
    await first.reload();
    window.dispatchEvent(new Event(ALERTS_CHANGED));
  }
  return (
    <section>
      <PageHeader title="Alerts" eyebrow="Pekko" icon={<IconTv />}
        lede="We let you know when a screen stops checking in, and again when it comes back. Alerts are kept for 90 days." />
      <div className="flex flex-wrap gap-2 mb-4">
        <Link href="/dashboard/settings#alerts" className="btn btn-quiet">Alert settings</Link>
        {first.data && first.data.unread > 0 ? <button type="button" className="btn btn-quiet" onClick={markAll}>Mark all as read</button> : null}
      </div>
      {!first.data ? <LoadState error={first.error} label="Loading…" /> : alerts.length === 0 ? (
        <EmptyState title="No alerts">When a screen goes offline for longer than your alert time, it shows up here.</EmptyState>
      ) : (
        <ul className="card divide-y divide-line" data-testid="alerts-list">
          {alerts.map((a) => (
            <li key={a.id} className={`px-4 py-3 flex flex-wrap justify-between gap-2 text-sm ${a.read ? "" : "bg-paper"}`}>
              <span>
                <span aria-hidden>{a.kind === "screen.offline" ? "🔴 " : "🟢 "}</span>
                <strong>{a.kind === "screen.offline" ? "Offline" : "Back online"}</strong> · {alertText(a)}
                {a.read ? null : <span className="badge badge-warn ml-2">New</span>}
              </span>
              <span className="text-muted">{when(a.at)}</span>
            </li>
          ))}
        </ul>
      )}
      {cursor ? <button type="button" className="btn btn-quiet mt-3" onClick={loadMore}>Show older</button> : null}
    </section>
  );
}

/** Settings card: on/off, threshold, email. */
export function AlertSettings() {
  const prefs = useApi<AlertPrefs>("/api/alerts/preferences");
  const [minutes, setMinutes] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (!prefs.data) return <div id="alerts" className="card p-4"><p role={prefs.error ? "alert" : "status"} className="text-sm text-muted">{prefs.error || "Loading alert settings…"}</p></div>;
  const p = prefs.data;
  async function save(patch: Record<string, unknown>) {
    setBusy(true); setMsg(null);
    try { await api("/api/alerts/preferences", { method: "PATCH", body: JSON.stringify(patch) }); await prefs.reload(); setMsg("Saved."); }
    catch (e) { setMsg((e as Error).message); }
    finally { setBusy(false); }
  }
  const value = minutes ?? String(p.thresholdMinutes);
  return (
    <div id="alerts" className="card p-4 md:p-5 grid gap-4">
      <div>
        <h2 className="font-semibold">Screen alerts</h2>
        <p className="text-sm text-muted">Get an alert when a screen stops checking in, and when it&apos;s back.</p>
      </div>
      <label className="flex items-center gap-3">
        <input type="checkbox" className="size-5" checked={p.enabled} disabled={busy} onChange={(e) => save({ enabled: e.target.checked })} />
        <span>Alert me when a screen goes offline</span>
      </label>
      <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); const n = Number(value); save({ thresholdMinutes: n }); setMinutes(null); }}>
        <div>
          <label className="form-label" htmlFor="alert-minutes">Alert after (minutes offline)</label>
          <input id="alert-minutes" className="field w-28" type="number" inputMode="numeric" min={p.limits.minMinutes} max={p.limits.maxMinutes} step={1}
            value={value} disabled={busy || !p.enabled} onChange={(e) => setMinutes(e.target.value)} />
        </div>
        <button className="btn btn-quiet" disabled={busy || !p.enabled || value === String(p.thresholdMinutes)}>Save</button>
      </form>
      <label className="flex items-start gap-3">
        <input type="checkbox" className="size-5 mt-0.5" checked={p.email.enabled} disabled={busy || !p.enabled} onChange={(e) => save({ emailEnabled: e.target.checked })} />
        <span>
          Also email me at <strong className="break-all">{p.email.address}</strong>
          {p.email.available ? null : <span className="block text-xs text-muted">Email alerts aren&apos;t switched on for Pekko yet. Alerts still appear here in the dashboard.</span>}
        </span>
      </label>
      {msg ? <p className="text-sm" role="status">{msg}</p> : null}
    </div>
  );
}
