import { db } from "@/lib/server/supabase";
import { requireAdmin } from "@/lib/server/auth";
import { json } from "@/lib/server/http";
import {
  DAY, buildUptime, countSince, coverageStart, expectedFor, isErr, isOnline, loadDisplays, locationZones, playbackStatus, uptimeDaily,
} from "@/lib/server/analytics";
import { analyticsFail } from "@/lib/server/analytics-routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const accountId = admin.accountId;
  const now = Date.now();

  const displays = await loadDisplays(accountId);
  if (isErr(displays)) return analyticsFail(displays);
  const [coverage, zones, rows] = await Promise.all([coverageStart(), locationZones(accountId), uptimeDaily(accountId, new Date(now - 30 * DAY))]);
  if (isErr(coverage)) return analyticsFail(coverage);
  if (isErr(zones)) return analyticsFail(zones);
  if (isErr(rows)) return analyticsFail(rows);
  const recent = rows.filter((r) => new Date(String(r.day)).getTime() >= now - 8 * DAY);
  const u7 = buildUptime(displays, recent, 7, coverage, zones, now);
  const u30 = buildUptime(displays, rows, 30, coverage, zones, now);

  const playback = { confirmed: 0, unconfirmed: 0, nothingAssigned: 0 };
  for (const d of displays) {
    const e = await expectedFor(d);
    if (isErr(e)) return analyticsFail(e);
    const s = playbackStatus(d, e);
    if (s === "confirmed") playback.confirmed++;
    else if (s === "unconfirmed") playback.unconfirmed++;
    else playback.nothingAssigned++;
  }

  const since30 = new Date(now - 30 * DAY);
  const [playlists, schedules, media, used, publishes, scheduleChanges] = await Promise.all([
    db().from("playlists").select("id, published_at").eq("account_id", accountId).limit(5000),
    db().from("schedules").select("id, enabled").eq("account_id", accountId).limit(5000),
    db().from("media").select("id, kind, size_bytes").eq("account_id", accountId).limit(20000),
    db().from("playlist_items").select("media_id").eq("account_id", accountId).limit(20000),
    countSince("activity_events", accountId, ["playlist.published"], since30),
    countSince("activity_events", accountId, ["schedule.created", "schedule.updated", "schedule.deleted"], since30),
  ]);
  if (playlists.error || schedules.error || media.error || used.error) return analyticsFail({ missing: false });
  if (isErr(publishes)) return analyticsFail(publishes);
  if (isErr(scheduleChanges)) return analyticsFail(scheduleChanges);

  const mediaRows = (media.data ?? []) as { id: string; kind: string | null; size_bytes: number | null }[];
  const usedIds = new Set(((used.data ?? []) as { media_id: string }[]).map((x) => x.media_id));
  for (const d of displays) if (d.assigned_media_id) usedIds.add(d.assigned_media_id);
  const inPlaylists = new Set(((used.data ?? []) as { media_id: string }[]).map((x) => x.media_id));
  const online = displays.filter((d) => isOnline(d.last_seen_at, now)).length;
  const neverConnected = displays.filter((d) => !d.last_seen_at).length;

  return json({
    screens: { total: displays.length, online, offline: displays.length - online - neverConnected, neverConnected },
    uptime: { pct7: u7.overall, pct30: u30.overall, coverageFrom: coverage },
    playback,
    playlists: {
      total: (playlists.data ?? []).length,
      published: ((playlists.data ?? []) as { published_at: string | null }[]).filter((p) => p.published_at).length,
      publishes30d: publishes,
    },
    schedules: {
      total: (schedules.data ?? []).length,
      enabled: ((schedules.data ?? []) as { enabled: boolean }[]).filter((s) => s.enabled).length,
      changes30d: scheduleChanges,
    },
    media: {
      count: mediaRows.length,
      images: mediaRows.filter((m) => (m.kind ?? "image") !== "video").length,
      videos: mediaRows.filter((m) => m.kind === "video").length,
      bytes: mediaRows.reduce((sum, m) => sum + Number(m.size_bytes ?? 0), 0),
      inPlaylists: mediaRows.filter((m) => inPlaylists.has(m.id)).length,
      unused: mediaRows.filter((m) => !usedIds.has(m.id)).length,
    },
    // Not measured per account. Shown as unavailable rather than estimated.
    bandwidth: null,
  });
}
