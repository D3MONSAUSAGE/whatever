import { db } from "@/lib/server/supabase";
import { requireAdmin } from "@/lib/server/auth";
import { isUuid } from "@/lib/server/crypto";
import { isMissingSchema, SCHEDULES_UNAVAILABLE } from "@/lib/server/schema";
import { loadRulesForDisplay } from "@/lib/server/playback";
import { buildTimeline, PREVIEW_MAX_DAYS, scheduleNow } from "@/lib/server/schedule";
import { fail, json } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RESOLUTION = "A rule on this screen beats a rule on a group. Higher priority wins next. The most recently updated rule wins next. The lowest id breaks a remaining tie. Anything left plays the screen's saved assignment.";

export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const url = new URL(req.url);
  const displayId = url.searchParams.get("displayId") || "";
  if (!isUuid(displayId)) return fail("Display not found.", 404);
  const days = Number(url.searchParams.get("days") || "7");
  if (!Number.isInteger(days) || days < 1 || days > PREVIEW_MAX_DAYS) {
    return fail("Preview covers 1 to 14 days.", 400);
  }

  const loaded = await loadRulesForDisplay(displayId, admin.accountId);
  if (loaded.kind === "missing") return fail(SCHEDULES_UNAVAILABLE, 503);
  if (loaded.kind === "error") return fail("Couldn't build the preview.", 500);
  if (loaded.kind === "absent") return fail("Display not found.", 404);

  const from = scheduleNow();
  const until = new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
  const segments = buildTimeline(loaded.rules, from, until, loaded.timeZone);
  const rules = new Map(loaded.rules.map((rule) => [rule.id, rule]));

  const display = await db()
    .from("displays")
    .select("assigned_media_id, assigned_playlist_id")
    .eq("id", displayId)
    .eq("account_id", admin.accountId)
    .maybeSingle();
  if (display.error && !isMissingSchema(display.error)) return fail("Couldn't build the preview.", 500);

  const playlistIds = [...new Set([
    ...loaded.rules.map((rule) => rule.playlistId),
    display.data?.assigned_playlist_id ? String(display.data.assigned_playlist_id) : "",
  ].filter(Boolean))];
  const playlistNames = new Map<string, string>();
  if (playlistIds.length) {
    const lists = await db().from("playlists").select("id, name").eq("account_id", admin.accountId).in("id", playlistIds);
    if (lists.error && !isMissingSchema(lists.error)) return fail("Couldn't build the preview.", 500);
    for (const list of lists.data ?? []) playlistNames.set(String(list.id), String(list.name));
  }
  let mediaName: string | null = null;
  const mediaId = display.data?.assigned_media_id ? String(display.data.assigned_media_id) : null;
  if (mediaId) {
    const media = await db().from("media").select("file_name").eq("id", mediaId).eq("account_id", admin.accountId).maybeSingle();
    if (!media.error && media.data) mediaName = String(media.data.file_name);
  }
  const defaultPlaylistId = display.data?.assigned_playlist_id ? String(display.data.assigned_playlist_id) : null;

  return json({
    displayId,
    timezone: loaded.timeZone,
    from: from.toISOString(),
    until: until.toISOString(),
    resolution: RESOLUTION,
    defaultAssignment: {
      playlistId: defaultPlaylistId,
      playlistName: defaultPlaylistId ? playlistNames.get(defaultPlaylistId) ?? "" : null,
      mediaId,
      mediaName,
    },
    segments: segments.map((segment) => {
      const rule = segment.ruleId ? rules.get(segment.ruleId) : undefined;
      return {
        start: segment.start,
        end: segment.end,
        date: segment.date,
        source: rule ? "schedule" : "default",
        scheduleId: rule?.id ?? null,
        scheduleName: rule?.name ?? null,
        playlistId: rule?.playlistId ?? defaultPlaylistId,
        playlistName: rule
          ? playlistNames.get(rule.playlistId) ?? ""
          : defaultPlaylistId
            ? playlistNames.get(defaultPlaylistId) ?? ""
            : null,
        target: rule?.target ?? null,
        priority: rule?.priority ?? null,
      };
    }),
  });
}
