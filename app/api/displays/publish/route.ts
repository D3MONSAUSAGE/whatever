import { ONLINE_MS, PUBLISH_MAX_PER_USER, PUBLISH_RATE_MESSAGE, PUBLISH_WINDOW_SECONDS } from "@/lib/server/limits";
import { requireAdmin } from "@/lib/server/auth";
import { isUuid } from "@/lib/server/crypto";
import { loadDisplaySchedules } from "@/lib/server/display-schedules";
import { enforceLimit, fail, json, readJson } from "@/lib/server/http";
import { isMissingSchema, PLAYLISTS_UNAVAILABLE } from "@/lib/server/schema";
import { publishImpact } from "@/lib/server/screen-publish";
import { db } from "@/lib/server/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Dry-run unless commit is true. Without replace, screens already on this
 * playlist stay on it. replace:true passes only the selection to publish_playlist,
 * which is what clears the others. POST /api/playlists/:id/publish is unchanged.
 */
export async function POST(req: Request) {
  const started = Date.now();
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const body = await readJson(req);
  const playlistId = body.playlistId;
  if (!isUuid(playlistId)) return fail("Playlist not found.", 404);
  const commit = body.commit === true;
  const replace = body.replace === true;
  const requested = Array.isArray(body.displayIds) ? body.displayIds.filter(isUuid) : null;
  const groupId = isUuid(body.groupId) ? body.groupId : null;
  if (body.groupId != null && body.groupId !== "" && !groupId) return fail("Screen group not found.", 404);

  const playlistQuery = db().from("playlists").select("id").eq("id", playlistId).eq("account_id", admin.accountId).maybeSingle();
  const displayQuery = db()
    .from("displays")
    .select("id, name, assigned_playlist_id, last_seen_at, token_hash, location_id")
    .eq("account_id", admin.accountId)
    .eq("status", "active");
  const groupQuery = groupId
    ? db().from("screen_groups").select("id").eq("id", groupId).eq("account_id", admin.accountId).maybeSingle()
    : Promise.resolve({ data: { id: "" }, error: null });
  const memberQuery = groupId
    ? db().from("screen_group_members").select("display_id").eq("group_id", groupId).eq("account_id", admin.accountId)
    : Promise.resolve({ data: [] as { display_id: string }[], error: null });
  const [playlist, displays, group, members] = await Promise.all([playlistQuery, displayQuery, groupQuery, memberQuery]);
  if (playlist.error || displays.error || group.error || members.error) return fail("Couldn't preview that publish.", 500);
  if (!playlist.data) return fail("Playlist not found.", 404);
  if (groupId && !group.data) return fail("Screen group not found.", 404);

  const memberIds = groupId ? (members.data ?? []).map((row) => String(row.display_id)) : null;
  const rows = displays.data ?? [];
  const known = new Set(rows.map((row) => String(row.id)));

  let selectedIds: string[];
  if (requested && requested.length) {
    if (requested.some((id) => !known.has(id))) return fail("One of those screens isn't in this account.", 400);
    if (memberIds && requested.some((id) => !memberIds!.includes(id))) return fail("One of those screens isn't in this group.", 400);
    selectedIds = requested;
  } else if (memberIds) {
    selectedIds = memberIds.filter((id) => known.has(id));
  } else {
    return fail("Choose at least one screen.", 400);
  }
  if (!selectedIds.length || selectedIds.length > 50) return fail("Choose at least one screen.", 400);

  // Commit assigns in one playlist publish. It does not walk each screen's schedule again.
  const schedules = commit ? new Map<string, { currentSchedule?: { name: string; target: "display" | "group" } | null }>() : await loadDisplaySchedules(
    admin.accountId,
    rows.map((row) => ({ id: String(row.id), timeZone: null })),
  );
  if (schedules === null) return fail("Couldn't preview that publish.", 500);
  const now = Date.now();
  const asScreen = (row: (typeof rows)[number]) => {
    const current = schedules.get(String(row.id))?.currentSchedule ?? null;
    const seen = row.last_seen_at ? new Date(String(row.last_seen_at)).getTime() : NaN;
    return {
      id: String(row.id),
      name: String(row.name),
      playlistId: row.assigned_playlist_id ? String(row.assigned_playlist_id) : null,
      online: !!row.token_hash && !Number.isNaN(seen) && now - seen < ONLINE_MS,
      scheduleName: current?.name ?? null,
      scheduleTarget: current?.target ?? null,
    };
  };
  const selectedSet = new Set(selectedIds);
  const selected = rows.filter((row) => selectedSet.has(String(row.id))).map(asScreen);
  const others = rows.filter((row) => !selectedSet.has(String(row.id))).map(asScreen);
  const impact = publishImpact(playlistId, selected, others);

  if (!commit) return json({ commit: false, replace, playlistId, ...impact });

  const keepIds = replace ? [] : rows
    .filter((row) => String(row.assigned_playlist_id ?? "") === playlistId && !selectedSet.has(String(row.id)))
    .map((row) => String(row.id));
  const publishIds = [...new Set([...selectedIds, ...keepIds])];
  if (publishIds.length > 50) return fail("Choose fewer screens. Fifty is the limit for one publish.", 400);

  const limited = await enforceLimit(`publish:${admin.userId}`, PUBLISH_WINDOW_SECONDS, PUBLISH_MAX_PER_USER, PUBLISH_RATE_MESSAGE);
  if (limited) return limited;
  const published = await db().rpc("publish_playlist", {
    p_account_id: admin.accountId,
    p_playlist_id: playlistId,
    p_display_ids: publishIds,
  });
  if (published.error) {
    console.error("display publish failed", published.error.message);
    if (isMissingSchema(published.error)) return fail(PLAYLISTS_UNAVAILABLE, 503);
    return fail("Couldn't publish the playlist.", 500);
  }
  if (!published.data) {
    console.error("display publish returned no row", playlistId);
    return fail("Add at least one image, then choose screens from this account.", 400);
  }
  const ms = Date.now() - started;
  console.info(JSON.stringify({ event: "display-publish", commit: true, ms, screens: publishIds.length }));
  if (ms > 8000) console.error(JSON.stringify({ event: "display-publish-slow", ms, screens: publishIds.length }));
  return json({ commit: true, replace, playlistId, ...impact });
}
