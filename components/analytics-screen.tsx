"use client";
import Link from "next/link";
import { useState } from "react";
import { api, useApi, type ActivityEvent, type AnalyticsSummary, type ScreenAnalytics, type UptimeReport } from "@/lib/api";
import { IconChart, IconImage, IconList, IconTv, IconCalendar } from "@/components/icons";
import { EmptyState, LoadState, PageHeader, Stat } from "@/components/ui";

export type AnalyticsFixture = { summary: AnalyticsSummary; uptime: UptimeReport; activity: ActivityEvent[] };

const pct = (v: number | null) => (v === null ? "—" : `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}%`);

export function formatBytes(n: number) {
  if (n < 1024 * 1024) return `${Math.max(0, Math.round(n / 1024))} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function formatDuration(seconds: number) {
  if (seconds < 90) return `${Math.max(1, Math.round(seconds))} s`;
  const m = Math.round(seconds / 60);
  if (m < 90) return `${m} min`;
  const h = Math.round(seconds / 360) / 10;
  if (h < 48) return `${h} h`;
  return `${Math.round(h / 24)} days`;
}

function when(iso: string | null) {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const KIND_LABEL: Record<string, string> = {
  "playlist.published": "Playlist published",
  "screen.content_changed": "Screen content changed",
  "screen.paired": "Screen paired",
  "screen.removed": "Screen removed",
  "schedule.created": "Schedule created",
  "schedule.updated": "Schedule changed",
  "schedule.deleted": "Schedule deleted",
  "media.uploaded": "Media uploaded",
  "media.deleted": "Media deleted",
};

export function AnalyticsScreen({ fixture }: { fixture?: AnalyticsFixture }) {
  const summaryLive = useApi<AnalyticsSummary>(fixture ? null : "/api/analytics/summary", fixture ? undefined : 30_000);
  const [days, setDays] = useState<7 | 30>(7);
  const uptimeLive = useApi<UptimeReport>(fixture ? null : `/api/analytics/uptime?days=${days}`, fixture ? undefined : 60_000);
  const summary = fixture?.summary ?? summaryLive.data;
  const uptime = fixture?.uptime ?? uptimeLive.data;

  return (
    <section>
      <PageHeader title="Analytics" eyebrow="Pekko" icon={<IconChart />}
        lede="How your screens are doing: what's online, how reliable each screen has been, and what changed recently." />
      {fixture ? null : <p className="-mt-2 mb-6 text-sm"><Link href="/dashboard/alerts" className="underline font-semibold">Offline alerts</Link> · <Link href="/dashboard/settings#alerts" className="underline">alert settings</Link></p>}
      {!summary ? (
        <LoadState error={summaryLive.error} label="Loading…" />
      ) : summary.screens.total === 0 ? (
        <EmptyState title="No screens yet">
          Analytics starts once a TV is paired. <Link href="/dashboard/displays" className="underline font-semibold">Pair your first screen</Link>.
        </EmptyState>
      ) : (
        <div className="grid gap-8">
          <div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat icon={<IconTv />} label="Screens" value={summary.screens.total} />
              <Stat tone="live" label="Online" value={summary.screens.online} />
              <Stat tone="danger" label="Offline" value={summary.screens.offline} />
              <Stat label="Never connected" value={summary.screens.neverConnected} />
              <Stat label="Uptime · 7 days" value={pct(summary.uptime.pct7)} />
              <Stat label="Uptime · 30 days" value={pct(summary.uptime.pct30)} />
            </div>
            <p className="text-xs text-muted mt-2">
              A screen is online when its TV checked in within the last 90 seconds. Uptime is measured from those check-ins
              {summary.uptime.coverageFrom ? <>, starting {when(summary.uptime.coverageFrom)}. Earlier time isn&apos;t counted.</> : <>. Measuring starts with the first check-in, so there&apos;s no figure yet.</>}
            </p>
          </div>

          <div>
            <h2 className="font-semibold mb-1">What&apos;s on screen</h2>
            <p className="text-sm text-muted mb-3">&ldquo;Confirmed by the TV&rdquo; means the TV itself reported showing the current content. Published or scheduled content the TV hasn&apos;t confirmed is listed separately and isn&apos;t counted as verified.</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" data-testid="playback-summary">
              <Stat tone="live" label="Confirmed by the TV" value={summary.playback.confirmed} />
              <Stat label="Published, not confirmed" value={summary.playback.unconfirmed} />
              <Stat label="Nothing assigned" value={summary.playback.nothingAssigned} />
            </div>
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h2 className="font-semibold">Screen reliability</h2>
              <div className="inline-flex rounded-xl border border-line overflow-hidden" role="group" aria-label="Period">
                {[7, 30].map((d) => (
                  <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d as 7 | 30)}
                    className={`px-3 py-1.5 text-sm font-semibold ${days === d ? "bg-primary text-white" : "bg-white"}`}>{d} days</button>
                ))}
              </div>
            </div>
            {!uptime ? <LoadState error={uptimeLive.error} label="Loading…" /> : (
              <ul className="card divide-y divide-line overflow-hidden">
                {uptime.screens.map((s) => <ScreenRow key={s.id} screen={s} fixture={!!fixture} />)}
              </ul>
            )}
          </div>

          <div>
            <h2 className="font-semibold mb-3">Content and storage</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat icon={<IconList />} label="Playlists" value={`${summary.playlists.published} of ${summary.playlists.total} live`} />
              <Stat label="Publishes · 30 days" value={summary.playlists.publishes30d} />
              <Stat icon={<IconCalendar />} label="Schedules on" value={`${summary.schedules.enabled} of ${summary.schedules.total}`} />
              <Stat label="Schedule changes · 30 days" value={summary.schedules.changes30d} />
              <Stat icon={<IconImage />} label="Media files" value={`${summary.media.images} images · ${summary.media.videos} videos`} />
              <Stat label="Storage used" value={formatBytes(summary.media.bytes)} />
              <Stat label="In playlists" value={summary.media.inPlaylists} />
              <Stat label="Not used anywhere" value={summary.media.unused} />
            </div>
            <p className="text-xs text-muted mt-2">Storage is the exact size of your uploaded files. Bandwidth isn&apos;t shown: it can&apos;t be measured accurately per account, and TVs now keep a copy, so most files are downloaded once.</p>
          </div>

          <Activity fixture={fixture?.activity} />
        </div>
      )}
    </section>
  );
}

function Bars({ daily }: { daily: { date: string; uptimePct: number | null }[] }) {
  return (
    <div className="flex items-end gap-[2px] h-8" aria-hidden>
      {daily.map((d) => (
        <span key={d.date} title={`${d.date}: ${d.uptimePct === null ? "no data" : `${d.uptimePct}%`}`}
          className={`w-1.5 sm:w-2 rounded-sm ${d.uptimePct === null ? "bg-line" : d.uptimePct >= 95 ? "bg-live-strong" : d.uptimePct >= 50 ? "bg-amber-400" : "bg-danger"}`}
          style={{ height: `${d.uptimePct === null ? 15 : Math.max(10, d.uptimePct)}%` }} />
      ))}
    </div>
  );
}

function ScreenRow({ screen, fixture }: { screen: UptimeReport["screens"][number]; fixture: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <li data-screen={screen.id}>
      <button type="button" className="w-full text-left px-4 py-3 flex flex-wrap items-center gap-3 hover:bg-paper" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className={`size-2.5 rounded-full ${screen.online ? "bg-live" : "bg-danger"}`} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="font-semibold block truncate">{screen.name}</span>
          <span className="text-xs text-muted">{screen.online ? "Online" : "Offline"} · last seen {when(screen.lastSeenAt)}</span>
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
  if (fixture) return <p className="px-4 pb-4 text-sm text-muted">Details load from your account.</p>;
  if (!detail.data) return <p role={detail.error ? "alert" : "status"} className="px-4 pb-4 text-sm text-muted">{detail.error || "Loading…"}</p>;
  const d = detail.data;
  const p = d.playback;
  const source = p.expected.source === "schedule" ? "Scheduled" : p.expected.source === "playlist" ? "Published playlist" : p.expected.source === "image" ? "Published image" : "Nothing assigned";
  return (
    <div className="px-4 pb-4 grid gap-4 md:grid-cols-2 text-sm">
      <div>
        <h3 className="font-semibold mb-1">On screen now</h3>
        <p>{source}{p.expected.name ? <>: <strong>{p.expected.name}</strong></> : null}</p>
        <p className="mt-1" data-testid="playback-status">
          {p.status === "confirmed" ? <span className="badge badge-live">Confirmed by the TV {when(p.confirmed?.at ?? null)}</span>
            : p.status === "nothing" ? <span className="badge">Nothing to play</span>
            : <span className="badge badge-warn">Not confirmed by the TV</span>}
        </p>
        {p.status === "unconfirmed" ? <p className="text-xs text-muted mt-1">The server is sending this, but the TV hasn&apos;t confirmed it. It may be offline, still loading, or running an older player page (reload the TV page).</p> : null}
        <p className="text-xs text-muted mt-2">Uptime: {pct(d.uptime7)} over 7 days · {pct(d.uptime30)} over 30 days</p>
        {p.history.length ? (
          <>
            <h4 className="font-semibold mt-3 mb-1">TV confirmations</h4>
            <ul className="text-xs text-muted grid gap-0.5">{p.history.slice(0, 8).map((h) => <li key={h.at}>{when(h.at)}: new content on screen</li>)}</ul>
          </>
        ) : null}
      </div>
      <div>
        <h3 className="font-semibold mb-1">Offline history</h3>
        {d.offline.length === 0 ? <p className="text-muted">No outages recorded{d.coverageFrom ? ` since ${when(d.coverageFrom)}` : ""}.</p> : (
          <ul className="grid gap-1">
            {d.offline.slice(0, 10).map((o) => (
              <li key={o.startedAt} className="flex justify-between gap-2">
                <span>{when(o.startedAt)} → {o.endedAt ? when(o.endedAt) : <strong className="text-danger">still offline</strong>}</span>
                <span className="text-muted tabular-nums">{formatDuration(o.seconds)}</span>
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
  const cursor = next === undefined ? first.data?.nextBefore ?? null : next;
  async function loadMore() {
    if (!cursor) return;
    const page = await api<{ events: ActivityEvent[]; nextBefore: string | null }>(`/api/analytics/activity?limit=20&before=${encodeURIComponent(cursor)}`);
    setMore((m) => [...m, ...page.events]);
    setNext(page.nextBefore);
  }
  return (
    <div>
      <h2 className="font-semibold mb-1">Recent activity</h2>
      <p className="text-sm text-muted mb-3">Publishing, screen content, schedules, and uploads. Kept for 90 days.</p>
      {!fixture && !first.data ? <LoadState error={first.error} label="Loading…" /> : events.length === 0 ? (
        <EmptyState title="Nothing yet">Changes you make from now on show up here.</EmptyState>
      ) : (
        <ul className="card divide-y divide-line" data-testid="activity">
          {events.map((e, i) => (
            <li key={`${e.at}-${i}`} className="px-4 py-2.5 flex flex-wrap justify-between gap-2 text-sm">
              <span><strong>{KIND_LABEL[e.kind] ?? e.kind}</strong>{e.subjectName ? <> · {e.subjectName}</> : null}</span>
              <span className="text-muted">{when(e.at)}</span>
            </li>
          ))}
        </ul>
      )}
      {cursor && !fixture ? <button type="button" className="btn btn-quiet mt-3" onClick={loadMore}>Show older</button> : null}
    </div>
  );
}
