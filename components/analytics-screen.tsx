"use client";
import Link from "next/link";
import { useState } from "react";
import { api, useApi, type ActivityEvent, type AnalyticsSummary, type ScreenAnalytics, type UptimeReport } from "@/lib/api";
import { IconChart, IconImage, IconList, IconTv, IconCalendar } from "@/components/icons";
import { EmptyState, LoadState, PageHeader, Stat } from "@/components/ui";
import { useLocale } from "@/lib/i18n/client";
import type { T } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/index";

export type AnalyticsFixture = { summary: AnalyticsSummary; uptime: UptimeReport; activity: ActivityEvent[] };

const pct = (v: number | null) => (v === null ? "—" : `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}%`);

export function formatBytes(n: number) {
  if (n < 1024 * 1024) return `${Math.max(0, Math.round(n / 1024))} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function formatDuration(seconds: number, daysWord = "days") {
  if (seconds < 90) return `${Math.max(1, Math.round(seconds))} s`;
  const m = Math.round(seconds / 60);
  if (m < 90) return `${m} min`;
  const h = Math.round(seconds / 360) / 10;
  if (h < 48) return `${h} h`;
  return `${Math.round(h / 24)} ${daysWord}`;
}

function useWhen() {
  const { locale, t } = useLocale();
  return (iso: string | null) => {
    if (!iso) return t("an.never");
    return new Date(iso).toLocaleString(locale === "es" ? "es" : undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  };
}

const KINDS = ["playlist.published", "screen.content_changed", "screen.paired", "screen.removed", "schedule.created", "schedule.updated", "schedule.deleted", "media.uploaded", "media.deleted"];
function kindLabel(kind: string, t: T) {
  return KINDS.includes(kind) ? t(`an.kind.${kind.replace("_", "-")}` as MessageKey) : kind;
}

export function AnalyticsScreen({ fixture }: { fixture?: AnalyticsFixture }) {
  const summaryLive = useApi<AnalyticsSummary>(fixture ? null : "/api/analytics/summary", fixture ? undefined : 30_000);
  const [days, setDays] = useState<7 | 30>(7);
  const uptimeLive = useApi<UptimeReport>(fixture ? null : `/api/analytics/uptime?days=${days}`, fixture ? undefined : 60_000);
  const summary = fixture?.summary ?? summaryLive.data;
  const { t } = useLocale();
  const when = useWhen();
  const uptime = fixture?.uptime ?? uptimeLive.data;

  return (
    <section className="an-root">
      <PageHeader title={t("an.title")} icon={<IconChart />} lede={t("an.lede")} />
      {fixture ? null : <p className="-mt-2 mb-6 text-sm"><Link href="/dashboard/alerts" className="underline font-semibold">{t("an.offlineAlerts")}</Link> · <Link href="/dashboard/settings#alerts" className="underline">{t("an.alertSettings")}</Link></p>}
      {!summary ? (
        <LoadState error={summaryLive.error} label={t("common.loading")} />
      ) : summary.screens.total === 0 ? (
        <EmptyState title={t("an.noScreens")}>
          {t("an.noScreensBody")} <Link href="/dashboard/displays" className="underline font-semibold">{t("an.pairFirst")}</Link>.
        </EmptyState>
      ) : (
        <div className="grid gap-8">
          <div>
            <div className="an-stats grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat icon={<IconTv />} label={t("an.screens")} value={summary.screens.total} />
              <Stat tone="live" label={t("an.online")} value={summary.screens.online} />
              <Stat tone="danger" label={t("an.offline")} value={summary.screens.offline} />
              <Stat label={t("an.neverConnected")} value={summary.screens.neverConnected} />
              <Stat label={t("an.uptime7")} value={pct(summary.uptime.pct7)} />
              <Stat label={t("an.uptime30")} value={pct(summary.uptime.pct30)} />
            </div>
            <p className="text-xs text-muted mt-2">
              {t("an.onlineNote")}
              {summary.uptime.coverageFrom ? t("an.coverageFrom", { date: when(summary.uptime.coverageFrom) }) : t("an.coverageNone")}
            </p>
          </div>

          <div className="an-sec">
            <h2 className="font-semibold mb-1">{t("an.onScreenTitle")}</h2>
            <p className="text-sm text-muted mb-3">{t("an.onScreenNote")}</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" data-testid="playback-summary">
              <Stat tone="live" label={t("an.confirmed")} value={summary.playback.confirmed} />
              <Stat label={t("an.unconfirmed")} value={summary.playback.unconfirmed} />
              <Stat label={t("an.nothingAssigned")} value={summary.playback.nothingAssigned} />
            </div>
          </div>

          <div className="an-sec an-rel">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h2 className="font-semibold">{t("an.reliability")}</h2>
              <div className="seg" role="group" aria-label={t("an.period")}>
                {[7, 30].map((d) => (
                  <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d as 7 | 30)}>{t("an.days", { n: d })}</button>
                ))}
              </div>
            </div>
            {!uptime ? <LoadState error={uptimeLive.error} label={t("common.loading")} /> : (
              <ul className="an-rel-list card divide-y divide-line overflow-hidden">
                {uptime.screens.map((s) => <ScreenRow key={s.id} screen={s} fixture={!!fixture} />)}
              </ul>
            )}
          </div>

          <div>
            <h2 className="font-semibold mb-3">{t("an.content")}</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat icon={<IconList />} label={t("an.playlists")} value={t("an.ofLive", { n: summary.playlists.published, total: summary.playlists.total })} />
              <Stat label={t("an.publishes30")} value={summary.playlists.publishes30d} />
              <Stat icon={<IconCalendar />} label={t("an.schedulesOn")} value={t("an.ofTotal", { n: summary.schedules.enabled, total: summary.schedules.total })} />
              <Stat label={t("an.scheduleChanges")} value={summary.schedules.changes30d} />
              <Stat icon={<IconImage />} label={t("an.mediaFiles")} value={t("an.imagesVideos", { images: summary.media.images, videos: summary.media.videos })} />
              <Stat label={t("an.storage")} value={formatBytes(summary.media.bytes)} />
              <Stat label={t("an.inPlaylists")} value={summary.media.inPlaylists} />
              <Stat label={t("an.unused")} value={summary.media.unused} />
            </div>
            <p className="text-xs text-muted mt-2">{t("an.storageNote")}</p>
          </div>

          <Activity fixture={fixture?.activity} />
        </div>
      )}
    </section>
  );
}

function Bars({ daily }: { daily: { date: string; uptimePct: number | null }[] }) {
  const { t } = useLocale();
  return (
    <div className="flex items-end gap-[2px] h-8" aria-hidden>
      {daily.map((d) => (
        <span key={d.date} title={`${d.date}: ${d.uptimePct === null ? t("an.noData") : `${d.uptimePct}%`}`}
          data-low={d.uptimePct !== null && d.uptimePct < 95 ? "1" : undefined}
          className={`an-bar w-1.5 sm:w-2 rounded-sm ${d.uptimePct === null ? "bg-line" : d.uptimePct >= 95 ? "bg-live-strong" : d.uptimePct >= 50 ? "bg-amber-400" : "bg-danger"}`}
          style={{ height: `${d.uptimePct === null ? 15 : Math.max(10, d.uptimePct)}%` }} />
      ))}
    </div>
  );
}

function ScreenRow({ screen, fixture }: { screen: UptimeReport["screens"][number]; fixture: boolean }) {
  const [open, setOpen] = useState(false);
  const { t } = useLocale();
  const when = useWhen();
  return (
    <li data-screen={screen.id}>
      <button type="button" className="w-full text-left px-4 py-3 flex flex-wrap items-center gap-3 hover:bg-paper" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className={`an-dot size-2.5 rounded-full ${screen.online ? "bg-live" : "bg-danger is-off"}`} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="font-semibold block truncate">{screen.name}</span>
          <span className="text-xs text-muted">{t("an.lastSeen", { status: screen.online ? t("an.online") : t("an.offline"), when: when(screen.lastSeenAt) })}</span>
        </span>
        <Bars daily={screen.daily} />
        <span className="w-16 text-right font-semibold tabular-nums">{pct(screen.uptimePct)}</span>
      </button>
      {open ? <ScreenDetail id={screen.id} fixture={fixture} /> : null}
    </li>
  );
}

function ScreenDetail({ id, fixture }: { id: string; fixture: boolean }) {
  const detail = useApi<ScreenAnalytics>(fixture ? null : `/api/analytics/screens/${id}`);
  const { t } = useLocale();
  const when = useWhen();
  if (fixture) return <p className="px-4 pb-4 text-sm text-muted">{t("an.detailsFixture")}</p>;
  if (!detail.data) return <p role={detail.error ? "alert" : "status"} className="px-4 pb-4 text-sm text-muted">{detail.error || t("common.loading")}</p>;
  const d = detail.data;
  const p = d.playback;
  const source = p.expected.source === "schedule" ? t("an.src.schedule") : p.expected.source === "playlist" ? t("an.src.playlist") : p.expected.source === "image" ? t("an.src.image") : t("an.nothingAssigned");
  return (
    <div className="px-4 pb-4 grid gap-4 md:grid-cols-2 text-sm">
      <div>
        <h3 className="font-semibold mb-1">{t("an.onScreenNow")}</h3>
        <p>{source}{p.expected.name ? <>: <strong>{p.expected.name}</strong></> : null}</p>
        <p className="mt-1" data-testid="playback-status">
          {p.status === "confirmed" ? <span className="badge badge-live">{t("an.confirmedAt", { when: when(p.confirmed?.at ?? null) })}</span>
            : p.status === "nothing" ? <span className="badge">{t("an.nothingToPlay")}</span>
            : <span className="badge badge-warn">{t("an.notConfirmed")}</span>}
        </p>
        {p.status === "unconfirmed" ? <p className="text-xs text-muted mt-1">{t("an.unconfirmedNote")}</p> : null}
        <p className="text-xs text-muted mt-2">{t("an.uptimeLine", { d7: pct(d.uptime7), d30: pct(d.uptime30) })}</p>
        {p.history.length ? (
          <>
            <h4 className="font-semibold mt-3 mb-1">{t("an.confirmations")}</h4>
            <ul className="text-xs text-muted grid gap-0.5">{p.history.slice(0, 8).map((h) => <li key={h.at}>{t("an.newContent", { when: when(h.at) })}</li>)}</ul>
          </>
        ) : null}
      </div>
      <div>
        <h3 className="font-semibold mb-1">{t("an.offlineHistory")}</h3>
        {d.offline.length === 0 ? <p className="text-muted">{d.coverageFrom ? t("an.noOutagesSince", { when: when(d.coverageFrom) }) : t("an.noOutages")}</p> : (
          <ul className="grid gap-1">
            {d.offline.slice(0, 10).map((o) => (
              <li key={o.startedAt} className="flex justify-between gap-2">
                <span>{when(o.startedAt)} → {o.endedAt ? when(o.endedAt) : <strong className="text-danger">{t("an.stillOffline")}</strong>}</span>
                <span className="text-muted tabular-nums">{formatDuration(o.seconds, t("an.daysWord"))}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Activity({ fixture }: { fixture?: ActivityEvent[] }) {
  const first = useApi<{ events: ActivityEvent[]; nextBefore: string | null }>(fixture ? null : "/api/analytics/activity?limit=20", fixture ? undefined : 60_000);
  const [more, setMore] = useState<ActivityEvent[]>([]);
  const [next, setNext] = useState<string | null | undefined>(undefined);
  const events = fixture ?? [...(first.data?.events ?? []), ...more];
  const { t } = useLocale();
  const when = useWhen();
  const cursor = next === undefined ? first.data?.nextBefore ?? null : next;
  async function loadMore() {
    if (!cursor) return;
    const page = await api<{ events: ActivityEvent[]; nextBefore: string | null }>(`/api/analytics/activity?limit=20&before=${encodeURIComponent(cursor)}`);
    setMore((m) => [...m, ...page.events]);
    setNext(page.nextBefore);
  }
  return (
    <div>
      <h2 className="font-semibold mb-1">{t("an.activity")}</h2>
      <p className="text-sm text-muted mb-3">{t("an.activityNote")}</p>
      {!fixture && !first.data ? <LoadState error={first.error} label={t("common.loading")} /> : events.length === 0 ? (
        <EmptyState title={t("an.nothingYet")}>{t("an.nothingYetBody")}</EmptyState>
      ) : (
        <ul className="card divide-y divide-line" data-testid="activity">
          {events.map((e, i) => (
            <li key={`${e.at}-${i}`} className="px-4 py-2.5 flex flex-wrap justify-between gap-2 text-sm">
              <span><strong>{kindLabel(e.kind, t)}</strong>{e.subjectName ? <> · {e.subjectName}</> : null}</span>
              <span className="text-muted">{when(e.at)}</span>
            </li>
          ))}
        </ul>
      )}
      {cursor && !fixture ? <button type="button" className="btn btn-quiet mt-3" onClick={loadMore}>{t("an.showOlder")}</button> : null}
    </div>
  );
}
