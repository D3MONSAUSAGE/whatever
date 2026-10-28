import { BUCKET, db } from "@/lib/server/supabase";
import { requireAdmin } from "@/lib/server/auth";
import { isUuid } from "@/lib/server/crypto";
import { PLAYLIST_MAX_DURATION_MS, PLAYLIST_MIN_DURATION_MS } from "@/lib/server/limits";
import { isMissingSchema, PLAYLISTS_UNAVAILABLE } from "@/lib/server/schema";
import { normalizePlaylistName, normalizeTransition, parseDraftItems } from "@/lib/server/validate";
import { fail, json, readJson } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };
type MediaRef = {
  id: string;
  file_name: string;
  storage_path: string;
  kind?: string | null;
  duration_ms?: number | null;
  thumbnail_path?: string | null;
};

export async function GET(req: Request, { params }: Ctx) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const { id } = await params;
  if (!isUuid(id)) return fail("Playlist not found.", 404);

  const { data: playlist, error } = await db()
    .from("playlists")
    .select("id, name, default_duration_ms, transition, published_at, published_transition, revision, updated_at")
    .eq("id", id)
    .eq("account_id", admin.accountId)
    .maybeSingle();
  if (error) {
    if (isMissingSchema(error)) return fail(PLAYLISTS_UNAVAILABLE, 503);
    return fail("Couldn't load the playlist.", 500);
  }
  if (!playlist) return fail("Playlist not found.", 404);

  const { data: itemRows, error: itemError } = await db()
    .from("playlist_items")
    .select("id, media_id, position, duration_ms")
    .eq("playlist_id", id)
    .eq("account_id", admin.accountId)
    .eq("kind", "draft")
    .order("position");
  if (itemError) return fail("Couldn't load the playlist.", 500);

  const mediaIds = [...new Set((itemRows ?? []).map((item) => item.media_id))];
  const mediaById = new Map<string, MediaRef>();
  if (mediaIds.length) {
    const rich = await db()
      .from("media")
      .select("id, file_name, storage_path, kind, duration_ms, thumbnail_path")
      .eq("account_id", admin.accountId)
      .in("id", mediaIds);
    let mediaRows = rich.data as MediaRef[] | null;
    let mediaError = rich.error;
    if (mediaError && isMissingSchema(mediaError)) {
      const plain = await db()
        .from("media")
        .select("id, file_name, storage_path")
        .eq("account_id", admin.accountId)
        .in("id", mediaIds);
      mediaRows = plain.data as MediaRef[] | null;
      mediaError = plain.error;
    }
    if (mediaError) return fail("Couldn't load the playlist.", 500);
    for (const media of mediaRows ?? []) mediaById.set(media.id, media);
  }
  const urls = new Map<string, string>();
  const paths = [...new Set([...mediaById.values()].flatMap((media) => [media.storage_path, media.thumbnail_path].filter(Boolean)))] as string[];
  if (paths.length) {
    const { data: signed } = await db().storage.from(BUCKET).createSignedUrls(paths, 3600);
    signed?.forEach((item) => item.path && item.signedUrl && urls.set(item.path, item.signedUrl));
  }

  const { data: displays, error: displayError } = await db()
    .from("displays")
    .select("id, name, assigned_playlist_id")
    .eq("account_id", admin.accountId)
    .eq("status", "active")
    .order("created_at");
  if (displayError) {
    if (isMissingSchema(displayError)) return fail(PLAYLISTS_UNAVAILABLE, 503);
    return fail("Couldn't load the playlist.", 500);
  }

  return json({
    id: playlist.id,
    name: playlist.name,
    defaultDurationMs: playlist.default_duration_ms,
    transition: playlist.transition,
    publishedAt: playlist.published_at,
    publishedTransition: playlist.published_transition,
    revision: playlist.revision,
    updatedAt: playlist.updated_at,
    items: (itemRows ?? []).map((item) => {
      const media = mediaById.get(item.media_id);
      return {
        id: item.id,
        mediaId: item.media_id,
        fileName: media?.file_name ?? "Image",
        url: media ? urls.get(media.storage_path) ?? null : null,
        thumbnailUrl: media?.thumbnail_path ? urls.get(media.thumbnail_path) ?? null : null,
        kind: media?.kind === "video" ? "video" : "image",
        mediaDurationMs: media?.duration_ms ?? null,
        durationMs: item.duration_ms,
        position: item.position,
      };
    }),
    displays: (displays ?? []).map((display) => ({
      id: display.id,
      name: display.name,
      assigned: display.assigned_playlist_id === id,
    })),
  });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const { id } = await params;
  if (!isUuid(id)) return fail("Playlist not found.", 404);
  const body = await readJson(req);

  const name = normalizePlaylistName(body.name);
  const transition = normalizeTransition(body.transition);
  const defaultDurationMs = body.defaultDurationMs;
  const items = parseDraftItems(body.items);
  if (!name) return fail("Give the playlist a name.", 400);
  if (!transition) return fail("Choose a transition.", 400);
  if (typeof defaultDurationMs !== "number" || !Number.isInteger(defaultDurationMs)) {
    return fail("Set a default duration in seconds.", 400);
  }
  if (defaultDurationMs < PLAYLIST_MIN_DURATION_MS || defaultDurationMs > PLAYLIST_MAX_DURATION_MS) {
    return fail("Default duration must be between 1 and 600 seconds.", 400);
  }
  if (!items) return fail("Check the slides and try again.", 400);

  const { data: ok, error } = await db().rpc("save_playlist", {
    p_account_id: admin.accountId,
    p_playlist_id: id,
    p_name: name,
    p_default_duration_ms: defaultDurationMs,
    p_transition: transition,
    p_items: items,
  });
  if (error) {
    if (isMissingSchema(error)) return fail(PLAYLISTS_UNAVAILABLE, 503);
    return fail("Couldn't save the playlist.", 500);
  }
  if (!ok) return fail("Couldn't save the playlist. Check that the images are still in your library.", 400);
  return json({ ok: true });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const { id } = await params;
  if (!isUuid(id)) return fail("Playlist not found.", 404);

  const { data: ok, error } = await db().rpc("delete_playlist", {
    p_account_id: admin.accountId,
    p_playlist_id: id,
  });
  if (error) {
    if (isMissingSchema(error)) return fail(PLAYLISTS_UNAVAILABLE, 503);
    return fail("Couldn't delete the playlist.", 500);
  }
  if (!ok) return fail("Playlist not found.", 404);
  return json({ ok: true });
}
