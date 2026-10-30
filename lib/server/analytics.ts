import { db } from "./supabase";
import { ONLINE_MS } from "./limits";
import { isMissingSchema } from "./schema";
import { readPlaybackSchedule } from "./playback";

/** Analytics needs migration 0005. Routes answer 503 with this message until it is applied. */
export const ANALYTICS_UNAVAILABLE = "Analytics isn't set up on this server yet.";
const DAY = 86_400_000;
const PAGE = 1000;

export type DisplayRow = {
  id: string;
  name: string;
  created_at: string;
  last_seen_at: string | null;
  location_id: string | null;
  assigned_media_id: string | null;
  assigned_playlist_id: string | null;
  content_version: number;
  confirmed_version: number | null;
  confirmed_at: string | null;
};

type Err = { kind: "error"; missing: boolean };
const err = (e: { code?: string; message?: string } | null): Err => ({ kind: "error", missing: !!e && isMissingSchema(e) });
export const isErr = (v: unknown): v is Err => !!v && typeof v === "object" && (v as Err).kind === "error";

export function isOnline(lastSeenAt: string | null, now = Date.now()) {
  if (!lastSeenAt) return false;
  const seen = new Date(lastSeenAt).getTime();
  return !Number.isNaN(seen) && now - seen < ONLINE_MS;
}

export async function loadDisplays(accountId: string): Promise<DisplayRow[] | Err> {
  const rows: DisplayRow[] = [];
  for (let from = 0; from < 50_000; from += PAGE) {
    const r = await db()
      .from("displays")
      .select("id, name, created_at, last_seen_at, location_id, assigned_media_id, assigned_playlist_id, content_version, confirmed_version, confirmed_at")
      .eq("account_id", accountId)
      .eq("status", "active")
      .order("created_at")
      .range(from, from + PAGE - 1);
    if (r.error) return err(r.error);
    rows.push(...((r.data ?? []) as DisplayRow[]));
    if ((r.data ?? []).length < PAGE) break;
  }
  return rows;
}

export type Expected = { version: number; source: "schedule" | "playlist" | "image" | "none"; playlistId: string | null; mediaId: string | null };

/** What the server is sending this screen right now (published or scheduled; not proof it is showing). */
export async function expectedFor(d: DisplayRow): Promise<Expected | Err> {
  const s = await readPlaybackSchedule(d.id, Number(d.content_version));
  if (s.kind === "error") return { kind: "error", missing: false };
  if (s.kind === "on" && s.overridePlaylistId) {
    return { version: s.version, source: "schedule", playlistId: s.overridePlaylistId, mediaId: null };
  }
  const version = s.kind === "on" ? s.version : Number(d.content_version);
  if (d.assigned_media_id) return { version, source: "image", playlistId: null, mediaId: d.assigned_media_id };
  if (d.assigned_playlist_id) return { version, source: "playlist", playlistId: d.assigned_playlist_id, mediaId: null };
  return { version, source: "none", playlistId: null, mediaId: null };
}

export type PlaybackStatus = "confirmed" | "unconfirmed" | "nothing";

/**
 * confirmed: the TV itself reported painting exactly the content the server expects.
 * unconfirmed: content is published/scheduled for the screen, but the TV has not confirmed it
 * (offline, older player page, or still loading). Never shown as verified.
 */
export function playbackStatus(d: DisplayRow, e: Expected): PlaybackStatus {
  if (e.source === "none") return "nothing";
  if (d.confirmed_version != null && Number(d.confirmed_version) === e.version && isOnline(d.last_seen_at)) return "confirmed";
  return "unconfirmed";
}

export async function coverageStart(): Promise<string | null | Err> {
  const r = await db().rpc("analytics_coverage_start");
  if (r.error) return err(r.error);
  return r.data ? new Date(String(r.data)).toISOString() : null;
}

export type DailyRow = { display_id: string; day: string; online_seconds: number };

export async function uptimeDaily(accountId: string, since: Date): Promise<DailyRow[] | Err> {
  const r = await db().rpc("analytics_uptime_daily", { p_account: accountId, p_since: since.toISOString() });
  if (r.error) return err(r.error);
  return ((r.data ?? []) as DailyRow[]).map((x) => ({ ...x, online_seconds: Number(x.online_seconds) }));
}

/** Window for a screen: the later of (now - days), when it was paired, and when analytics started. */
export function windowFor(d: { created_at: string }, days: number, coverage: string | null, now = Date.now()) {
  const starts = [now - days * DAY, new Date(d.created_at).getTime()];
  if (coverage) starts.push(new Date(coverage).getTime());
  const start = Math.max(...starts);
  return { start, seconds: Math.max(0, Math.floor((now - start) / 1000)) };
}

export function uptimePct(onlineSeconds: number, windowSeconds: number) {
  if (windowSeconds < 600) return null; // under 10 minutes of coverage: not enough to say
  return Math.round(Math.min(100, (onlineSeconds / windowSeconds) * 100) * 10) / 10;
}

export function localDate(instant: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(instant));
  return parts; // YYYY-MM-DD
}

export async function locationZones(accountId: string): Promise<Map<string, string> | Err> {
  const r = await db().from("locations").select("id, timezone").eq("account_id", accountId);
  if (r.error) return err(r.error);
  return new Map((r.data ?? []).map((l: { id: string; timezone: string | null }) => [l.id, l.timezone || "UTC"]));
}

export type UptimeScreen = {
  id: string; name: string; online: boolean; lastSeenAt: string | null;
  uptimePct: number | null; onlineSeconds: number; windowSeconds: number;
  daily: { date: string; uptimePct: number | null }[];
};

/** Per-screen uptime from hourly buckets. Online seconds only count heartbeat gaps of at most 90 s. */
export function buildUptime(
  displays: DisplayRow[], rows: DailyRow[], days: number, coverage: string | null, zones: Map<string, string>, now = Date.now(),
): { screens: UptimeScreen[]; overall: number | null } {
  const byDisplay = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const m = byDisplay.get(r.display_id) ?? new Map<string, number>();
    m.set(String(r.day).slice(0, 10), (m.get(String(r.day).slice(0, 10)) ?? 0) + r.online_seconds);
    byDisplay.set(r.display_id, m);
  }
  let totalOnline = 0, totalWindow = 0;
  const screens = displays.map((d) => {
    const tz = (d.location_id && zones.get(d.location_id)) || "UTC";
    const w = windowFor(d, days, coverage, now);
    const perDay = byDisplay.get(d.id) ?? new Map<string, number>();
    // Only count buckets inside the window (the SQL lower bound is whole hours).
    let online = 0;
    perDay.forEach((v) => { online += v; });
    online = Math.min(online, w.seconds);
    if (coverage) { totalOnline += online; totalWindow += w.seconds; }
    const daily: { date: string; uptimePct: number | null }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const at = now - i * DAY;
      const date = localDate(at, tz);
      const startOfDay = at - secondsIntoLocalDay(at, tz) * 1000;
      const endOfDay = i === 0 ? now : startOfDay + DAY;
      const winSec = Math.max(0, Math.floor((endOfDay - Math.max(startOfDay, w.start)) / 1000));
      daily.push({ date, uptimePct: coverage ? uptimePct(Math.min(perDay.get(date) ?? 0, winSec), winSec) : null });
    }
    return {
      id: d.id, name: d.name, online: isOnline(d.last_seen_at, now), lastSeenAt: d.last_seen_at,
      uptimePct: coverage ? uptimePct(online, w.seconds) : null, onlineSeconds: online, windowSeconds: w.seconds, daily,
    };
  });
  return { screens, overall: coverage ? uptimePct(totalOnline, totalWindow) : null };
}

function secondsIntoLocalDay(instant: number, timeZone: string) {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(instant));
  const get = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0);
  return get("hour") * 3600 + get("minute") * 60 + get("second");
}

export type OfflinePeriod = { startedAt: string; endedAt: string | null; seconds: number };

/** Closed periods from the table, plus the current outage when the screen is offline now. */
export async function offlineHistory(d: DisplayRow, limit = 50, now = Date.now()): Promise<OfflinePeriod[] | Err> {
  const r = await db()
    .from("display_offline_periods")
    .select("started_at, ended_at")
    .eq("display_id", d.id)
    .order("ended_at", { ascending: false })
    .limit(limit);
  if (r.error) return err(r.error);
  const out: OfflinePeriod[] = [];
  if (d.last_seen_at && !isOnline(d.last_seen_at, now)) {
    const start = new Date(d.last_seen_at).getTime() + ONLINE_MS;
    out.push({ startedAt: new Date(start).toISOString(), endedAt: null, seconds: Math.max(0, Math.floor((now - start) / 1000)) });
  }
  for (const p of (r.data ?? []) as { started_at: string; ended_at: string }[]) {
    const s = new Date(p.started_at).getTime(), e = new Date(p.ended_at).getTime();
    out.push({ startedAt: new Date(s).toISOString(), endedAt: new Date(e).toISOString(), seconds: Math.max(0, Math.floor((e - s) / 1000)) });
  }
  return out.slice(0, limit);
}

export async function countSince(table: "activity_events", accountId: string, kinds: string[], since: Date): Promise<number | Err> {
  const r = await db().from(table).select("id", { count: "exact", head: true })
    .eq("account_id", accountId).in("kind", kinds).gte("at", since.toISOString());
  if (r.error) return err(r.error);
  return r.count ?? 0;
}

export { DAY };
