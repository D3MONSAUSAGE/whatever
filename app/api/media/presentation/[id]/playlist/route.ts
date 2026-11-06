import { db } from "@/lib/server/supabase";
import { requireAdmin } from "@/lib/server/auth";
import { isUuid } from "@/lib/server/crypto";
import { PRESENTATION_UNAVAILABLE, presentationSchemaReady } from "@/lib/server/pptx";
import { GROUP_DEFAULT_DURATION_MS, presentationGroupsReady } from "@/lib/server/presentation-groups";
import { createGroupPlaylist } from "@/lib/server/presentation-upload";
import { PLAYLIST_MAX_ITEMS } from "@/lib/server/limits";
import { normalizePlaybackMode, normalizePlaylistName } from "@/lib/server/validate";
import { fail, json, readJson } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Add a presentation to a playlist as one item, or create a new playlist for it.
 * `expandSlides: true` keeps the pre-group behavior (one playlist item per slide).
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const groups = await presentationGroupsReady();
  if (!groups && !(await presentationSchemaReady())) return fail(PRESENTATION_UNAVAILABLE, 503);

  const { id } = await ctx.params;
  if (!isUuid(id)) return fail("Presentation not found.", 404);

  const source = await db()
    .from("media")
    .select("id, file_name, kind, group_duration_ms, processing_status, slide_count")
    .eq("id", id)
    .eq("account_id", admin.accountId)
    .maybeSingle();
  if (source.error) return fail("Couldn't create the playlist.", 500);
  if (!source.data || source.data.kind !== "presentation") return fail("Presentation not found.", 404);
  if (groups && source.data.processing_status && source.data.processing_status !== "ready") {
    return fail("That presentation is not ready yet.", 409);
  }

  const body = await readJson(req);
  const playbackMode = normalizePlaybackMode(body.playbackMode) ?? (body.expandSlides === true ? "manual" : "auto");
  const name = normalizePlaylistName(body.name)
    ?? (String(source.data.file_name || "Presentation").replace(/\.pptx$/i, "").replace(/\.pdf$/i, "").slice(0, 80) || "Presentation");
  const duration = Number(source.data.group_duration_ms ?? GROUP_DEFAULT_DURATION_MS);

  if (isUuid(body.playlistId)) {
    const appended = await appendGroup(admin.accountId, String(body.playlistId), id, duration);
    if (appended instanceof Response) return appended;
    return json({ id: body.playlistId, playbackMode, asGroup: true }, 201);
  }

  if (body.expandSlides === true || !groups) {
    const created = await db().rpc("presentation_create_playlist", {
      p_account_id: admin.accountId,
      p_source_media_id: id,
      p_name: name,
      p_playback_mode: playbackMode,
    });
    if (created.error || !created.data) {
      return fail("Couldn't create a playlist from that presentation. Check it still has slides.", 400);
    }
    return json({ id: String(created.data), playbackMode, asGroup: false }, 201);
  }

  const created = await createGroupPlaylist(admin.accountId, id, name, playbackMode, duration);
  if (!created) return fail("Couldn't create a playlist from that presentation.", 400);
  return json({ id: created, playbackMode, asGroup: true }, 201);
}

async function appendGroup(accountId: string, playlistId: string, mediaId: string, durationMs: number) {
  const playlist = await db().from("playlists").select("id").eq("id", playlistId).eq("account_id", accountId).maybeSingle();
  if (playlist.error) return fail("Couldn't add that presentation.", 500);
  if (!playlist.data) return fail("Playlist not found.", 404);
  const items = await db()
    .from("playlist_items")
    .select("id, media_id, position")
    .eq("playlist_id", playlistId)
    .eq("account_id", accountId)
    .eq("kind", "draft");
  if (items.error) return fail("Couldn't add that presentation.", 500);
  const rows = items.data ?? [];
  if (rows.some((row) => row.media_id === mediaId)) return json({ id: playlistId, already: true });
  if (rows.length >= PLAYLIST_MAX_ITEMS) return fail("A playlist holds up to 40 items.", 400);
  const position = rows.reduce((max, row) => Math.max(max, Number(row.position)), -1) + 1;
  const inserted = await db().from("playlist_items").insert({
    playlist_id: playlistId,
    account_id: accountId,
    media_id: mediaId,
    kind: "draft",
    position,
    duration_ms: durationMs,
  });
  if (inserted.error) return fail("Couldn't add that presentation.", 500);
  return null;
}
