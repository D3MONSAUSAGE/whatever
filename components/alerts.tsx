"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, useApi, type AlertFeed, type AlertItem, type AlertPrefs } from "@/lib/api";
import { EmptyState, LoadState, PageHeader } from "@/components/ui";
import { IconTv } from "@/components/icons";
import { useLocale } from "@/lib/i18n/client";
import { makeT, type Locale, type T } from "@/lib/i18n";

const EN: T = makeT("en");

function when(iso: string, locale?: Locale) {
  return new Date(iso).toLocaleString(locale === "es" ? "es" : undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
function dur(s: number | null) {
  const m = Math.max(1, Math.round((s ?? 0) / 60));
  return m < 120 ? `${m} min` : `${Math.round(m / 6) / 10} h`;
}
export function alertText(a: AlertItem, t: T = EN, locale?: Locale) {
  return a.kind === "screen.offline"
    ? t("alerts.wentOffline", { name: a.screenName, when: when(a.offlineSince, locale) })
    : t("alerts.backOnline", { name: a.screenName, dur: dur(a.offlineSeconds) });
}

const ALERTS_CHANGED = "seemple-alerts-changed";

/** Banner at the top of every dashboard page while there are unread alerts. */
export function AlertsBanner() {
  const feed = useApi<AlertFeed>("/api/alerts?unread=1&limit=3", 60_000);
  const [busy, setBusy] = useState(false);
  const { t, locale } = useLocale();
  const { reload } = feed;
  // Parity Phase 1 (W3): on a phone the banner starts as one line (headline + All alerts) so the page
  // content stays above the fold; View opens the list. Wider screens start open, as before.
  const [open, setOpen] = useState(true);
  useEffect(() => {
    if (typeof window.matchMedia === "function" && window.matchMedia("(max-width: 639px)").matches) setOpen(false);
  }, []);
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
  const headline = feed.data.unread === 1 ? t("alerts.oneNew") : t("alerts.manyNew", { n: feed.data.unread });
  const offlineCount = feed.data.alerts.filter((a) => a.kind === "screen.offline").length;
  const summary = offlineCount
    ? (offlineCount === 1 ? t("alerts.oneOffline") : t("alerts.manyOffline", { n: offlineCount }))
    : headline;
  return (
    <details data-testid="alerts-banner" className={`group card mb-3 sm:mb-4 px-3 py-1 sm:py-2 border-l-4 ${offline ? "border-l-danger" : "border-l-live-strong"}`} open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="flex items-center justify-between gap-3 min-h-11 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <p className="font-semibold min-w-0 truncate text-sm sm:text-base" role="status">{headline}{offlineCount ? ` · ${summary}` : ""}</p>
        <Link href="/dashboard/alerts" className="sm:hidden text-sm font-semibold underline underline-offset-4 shrink-0 min-h-11 inline-flex items-center" onClick={(event) => event.stopPropagation()}>{t("alerts.all")}</Link>
        <span className="text-sm font-medium underline underline-offset-4 shrink-0">
          <span className="group-open:hidden">{t("tv.view")}</span>
          <span className="hidden group-open:inline">{t("tv.hide")}</span>
        </span>
      </summary>
      <div className="flex flex-wrap items-start justify-between gap-2 pb-2">
        <div className="min-w-0">
          <ul className="text-sm mt-1 grid gap-0.5">
            {feed.data.alerts.map((a) => (
              <li key={a.id}><span aria-hidden>{a.kind === "screen.offline" ? "🔴 " : "🟢 "}</span>{alertText(a, t, locale)}</li>
            ))}
          </ul>
        </div>
        <div className="flex gap-2 shrink-0">
          <span className="hidden sm:inline-flex"><Link href="/dashboard/alerts" className="btn btn-quiet min-h-11">{t("alerts.all")}</Link></span>
          <button type="button" className="btn btn-quiet min-h-11" disabled={busy} onClick={markAll}>{t("alerts.markRead")}</button>
        </div>
      </div>
    </details>
  );
}

export function AlertsScreen() {
  const first = useApi<AlertFeed>("/api/alerts?limit=30", 60_000);
  const [more, setMore] = useState<AlertItem[]>([]);
  const [next, setNext] = useState<string | null | undefined>(undefined);
  const { t, locale } = useLocale();
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
      <PageHeader title={t("alerts.title")} eyebrow="Pekko" icon={<IconTv />}
        lede={t("alerts.lede")} />
      <div className="flex flex-wrap gap-2 mb-4">
        <Link href="/dashboard/settings#alerts" className="btn btn-quiet">{t("alerts.settings")}</Link>
        {first.data && first.data.unread > 0 ? <button type="button" className="btn btn-quiet" onClick={markAll}>{t("alerts.markAll")}</button> : null}
      </div>
      {!first.data ? <LoadState error={first.error} /> : alerts.length === 0 ? (
        <EmptyState title={t("alerts.emptyTitle")}>{t("alerts.emptyBody")}</EmptyState>
      ) : (
        <ul className="card divide-y divide-line" data-testid="alerts-list">
          {alerts.map((a) => (
            <li key={a.id} className={`px-4 py-3 flex flex-wrap justify-between gap-2 text-sm ${a.read ? "" : "bg-paper"}`}>
              <span>
                <span aria-hidden>{a.kind === "screen.offline" ? "🔴 " : "🟢 "}</span>
                <strong>{a.kind === "screen.offline" ? t("alerts.offline") : t("alerts.back")}</strong> · {alertText(a, t, locale)}
                {a.read ? null : <span className="badge badge-warn ml-2">{t("alerts.new")}</span>}
              </span>
              <span className="text-muted">{when(a.at, locale)}</span>
            </li>
          ))}
        </ul>
      )}
      {cursor ? <button type="button" className="btn btn-quiet mt-3" onClick={loadMore}>{t("alerts.older")}</button> : null}
    </section>
  );
}

/** Settings card: on/off, threshold, email, phone notifications. */
export function AlertSettings() {
  const prefs = useApi<AlertPrefs>("/api/alerts/preferences");
  const [minutes, setMinutes] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const { t } = useLocale();
  if (!prefs.data) return <div id="alerts" className="card p-4"><p role={prefs.error ? "alert" : "status"} className="text-sm text-muted">{prefs.error || t("alerts.loadingSettings")}</p></div>;
  const p = prefs.data;
  async function save(patch: Record<string, unknown>) {
    setBusy(true); setMsg(null);
    try { await api("/api/alerts/preferences", { method: "PATCH", body: JSON.stringify(patch) }); await prefs.reload(); setMsg(t("alerts.saved")); }
    catch (e) { setMsg((e as Error).message); }
    finally { setBusy(false); }
  }
  const value = minutes ?? String(p.thresholdMinutes);
  return (
    <div id="alerts" className="card p-4 md:p-5 grid gap-4">
      <div>
        <h2 className="font-semibold">{t("alerts.cardTitle")}</h2>
        <p className="text-sm text-muted">{t("alerts.cardBody")}</p>
      </div>
      <label className="flex items-center gap-3">
        <input type="checkbox" className="size-5" checked={p.enabled} disabled={busy} onChange={(e) => save({ enabled: e.target.checked })} />
        <span>{t("alerts.enable")}</span>
      </label>
      <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); const n = Number(value); save({ thresholdMinutes: n }); setMinutes(null); }}>
        <div>
          <label className="form-label" htmlFor="alert-minutes">{t("alerts.after")}</label>
          <input id="alert-minutes" className="field w-28" type="number" inputMode="numeric" min={p.limits.minMinutes} max={p.limits.maxMinutes} step={1}
            value={value} disabled={busy || !p.enabled} onChange={(e) => setMinutes(e.target.value)} />
        </div>
        <button className="btn btn-quiet" disabled={busy || !p.enabled || value === String(p.thresholdMinutes)}>{t("alerts.save")}</button>
      </form>
      <label className="flex items-start gap-3">
        <input type="checkbox" className="size-5 mt-0.5" checked={p.email.enabled} disabled={busy || !p.enabled} onChange={(e) => save({ emailEnabled: e.target.checked })} />
        <span>
          {t("alerts.alsoEmail")} <strong className="break-all">{p.email.address}</strong>
          {p.email.available ? null : <span className="block text-xs text-muted">{t("alerts.emailOff")}</span>}
        </span>
      </label>
      {p.push ? (
        <label className="flex items-start gap-3">
          <input type="checkbox" className="size-5 mt-0.5" checked={p.push.enabled} disabled={busy || !p.enabled} onChange={(e) => save({ pushEnabled: e.target.checked })} />
          <span>
            {t("alerts.alsoPush")}
            <span className="block text-xs text-muted">{p.push.available ? t("alerts.pushHint") : t("alerts.pushOff")}</span>
          </span>
        </label>
      ) : null}
      {msg ? <p className="text-sm" role="status">{msg}</p> : null}
    </div>
  );
}
