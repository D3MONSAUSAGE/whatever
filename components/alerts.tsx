"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api, useApi, type AlertFeed, type AlertItem, type AlertPrefs } from "@/lib/api";
import { EmptyState, LoadState, PageHeader } from "@/components/ui";
import { IconBell } from "@/components/icons";
import { ALERTS_CHANGED, DayGroups, NoticeRow, groupHref, useNotifications, type NoticeItem } from "@/components/notifications";
import { groupAlerts, type NotificationGroup } from "@/lib/notifications";
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

/**
 * Notification history (/dashboard/notifications, also /dashboard/alerts). Same /api/alerts feed and
 * "Show older" paging as the old alerts page, shown as the notification center's grouped rows, with the
 * billing and rollout notices pinned on top. Nothing is deleted: every alert keeps its row in the database.
 */
export function AlertsScreen({ fixture }: { fixture?: AlertItem[] } = {}) {
  const live = useApi<AlertFeed>(fixture ? null : "/api/alerts?limit=50", 60_000);
  const first = fixture ? { data: { alerts: fixture, unread: fixture.filter((a) => !a.read).length, nextBefore: null } as AlertFeed, error: null, reload: async () => {} } : live;
  const nc = useNotifications();
  const router = useRouter();
  const [more, setMore] = useState<AlertItem[]>([]);
  const [next, setNext] = useState<string | null | undefined>(undefined);
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set());
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const { t } = useLocale();
  const { reload } = first;
  useEffect(() => {
    const onChange = () => { void reload(); };
    window.addEventListener(ALERTS_CHANGED, onChange);
    return () => window.removeEventListener(ALERTS_CHANGED, onChange);
  }, [reload]);
  const cursor = next === undefined ? first.data?.nextBefore ?? null : next;
  const alerts = useMemo(
    () => [...(first.data?.alerts ?? []), ...more].map((a) => (readIds.has(a.id) ? { ...a, read: true } : a)),
    [first.data, more, readIds],
  );
  const groups = useMemo(() => groupAlerts(alerts), [alerts]);
  const unreadGroups = groups.filter((g) => !g.read);
  const shown = filter === "unread" ? unreadGroups : groups;
  const notices = filter === "unread" ? nc.notices.filter((n) => !n.read) : nc.notices;
  async function loadMore() {
    if (!cursor) return;
    const page = await api<AlertFeed>(`/api/alerts?limit=50&before=${encodeURIComponent(cursor)}`);
    setMore((m) => [...m, ...page.alerts]);
    setNext(page.nextBefore);
  }
  async function markAll() {
    setReadIds(new Set(alerts.map((a) => a.id)));
    await nc.markAll();
  }
  function openGroup(g: NotificationGroup) {
    setReadIds((cur) => new Set([...cur, ...g.ids]));
    void nc.markGroup(g);
    router.push(groupHref(g));
  }
  function openNotice(n: NoticeItem) {
    nc.markNotice(n);
    if (n.href) router.push(n.href);
  }
  const unreadCount = unreadGroups.length + nc.notices.filter((n) => !n.read).length;
  return (
    <section>
      <PageHeader title={t("dash.nav.notifications")} eyebrow="Pekko" icon={<IconBell />} lede={t("nc.lede")} />
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="seg" role="group" aria-label={t("nc.filterAria")}>
          <button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>{t("nc.all")}</button>
          <button type="button" aria-pressed={filter === "unread"} onClick={() => setFilter("unread")}>{t("nc.filterUnread", { n: unreadCount })}</button>
        </div>
        <span className="flex-1" />
        <Link href="/dashboard/settings#alerts" className="btn btn-quiet">{t("nc.settings")}</Link>
        <button type="button" className="btn btn-quiet" onClick={() => void markAll()} disabled={!unreadCount}>{t("alerts.markAll")}</button>
      </div>
      {!first.data ? <LoadState error={first.error} /> : !shown.length && !notices.length ? (
        <EmptyState title={filter === "unread" ? t("nc.empty") : t("alerts.emptyTitle")}>{filter === "unread" ? null : t("alerts.emptyBody")}</EmptyState>
      ) : (
        <ul className="card nc-list" data-testid="alerts-list">
          {notices.map((n) => <NoticeRow key={n.key} notice={n} onOpen={openNotice} />)}
          <DayGroups groups={shown} onOpen={openGroup} />
        </ul>
      )}
      {cursor ? <button type="button" className="btn btn-quiet mt-3" onClick={() => void loadMore()}>{t("alerts.older")}</button> : null}
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
