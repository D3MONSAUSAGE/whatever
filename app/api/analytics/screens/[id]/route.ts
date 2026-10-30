import { db } from "@/lib/server/supabase";
import { requireAdmin } from "@/lib/server/auth";
import { fail, json } from "@/lib/server/http";
import { isUuid } from "@/lib/server/crypto";
import {
  DAY, buildUptime, coverageStart, expectedFor, isErr, isOnline, loadDisplays, locationZones, offlineHistory, playbackStatus, uptimeDaily,
} from "@/lib/server/analytics";
import { analyticsFail } from "@/lib/server/analytics-routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const { id } = await params;
  if (!isUuid(id)) return fail("Screen not found.", 404);
  const all = await loadDisplays(admin.accountId);
  if (isErr(all)) return analyticsFail(all);
  const d = all.find((x) => x.id === id);
  if (!d) return fail("Screen not found.", 404);
  const now = Date.now();

  const [coverage, zones, rows, offline, expected, events] = await Promise.all([
    coverageStart(), locationZones(admin.accountId), uptimeDaily(admin.accountId, new Date(now - 31 * DAY)),
    offlineHistory(d, 50, now), expectedFor(d),
    db().from("playback_events").select("version, at").eq("display_id", d.id).order("at", { ascending: false }).limit(20),
  ]);
  for (const v of [coverage, zones, rows, offline, expected]) if (isErr(v)) return analyticsFail(v);
  if (events.error) return analyticsFail({ missing: false });
  const mine = (rows as { display_id: string; day: string; online_seconds: number }[]).filter((r) => r.display_id === d.id);
  const cov = coverage as string | null;
  const z = zones as Map<string, string>;
  const u7 = buildUptime([d], mine.filter((r) => new Date(String(r.day)).getTime() >= now - 8 * DAY), 7, cov, z, now).screens[0];
  const u30 = buildUptime([d], mine, 30, cov, z, now).screens[0];
  const e = expected as Exclude<typeof expected, { kind: "error" }>;

  let name: string | null = null;
  if (e.playlistId) {
    const p = await db().from("playlists").select("name").eq("id", e.playlistId).eq("account_id", admin.accountId).maybeSingle();
    name = (p.data as { name?: string } | null)?.name ?? null;
  } else if (e.mediaId) {
    const m = await db().from("media").select("file_name").eq("id", e.mediaId).eq("account_id", admin.accountId).maybeSingle();
    name = (m.data as { file_name?: string } | null)?.file_name ?? null;
  }
  const status = playbackStatus(d, e);

  return json({
    id: d.id,
    name: d.name,
    online: isOnline(d.last_seen_at, now),
    lastSeenAt: d.last_seen_at,
    uptime7: u7.uptimePct,
    uptime30: u30.uptimePct,
    daily: u30.daily,
    coverageFrom: cov,
    offline,
    playback: {
      status,
      confirmed: d.confirmed_version != null ? { version: Number(d.confirmed_version), at: d.confirmed_at } : null,
      expected: { version: e.version, source: e.source, name },
      match: d.confirmed_version == null ? null : Number(d.confirmed_version) === e.version,
      history: ((events.data ?? []) as { version: number; at: string }[]).map((x) => ({ version: Number(x.version), at: x.at })),
    },
  });
}
