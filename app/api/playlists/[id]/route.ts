import { BUCKET, db } from "@/lib/server/supabase";
import { requireAdmin } from "@/lib/server/auth";
import { isUuid } from "@/lib/server/crypto";
import { PLAYLIST_MAX_DURATION_MS, PLAYLIST_MIN_DURATION_MS } from "@/lib/server/limits";
import { isMissingSchema, PLAYLISTS_UNAVAILABLE } from "@/lib/server/schema";
import { normalizePlaybackMode, normalizePlaylistName, normalizeTransition, parseDraftItems } from "@/lib/server/validate";
import { GROUP_MAX_DURATION_MS, GROUP_MIN_DURATION_MS } from "@/lib/server/presentation-groups";
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
  group_duration_ms?: number | null;
  group_revision?: number | null;
  slide_count?: number | null;
};

export async function GET(req: Request, { params }: Ctx) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const { id } = await params;
  if (!isUuid(id)) return fail("Playlist not found.", 404);

  const { data: playlist, error } = await db()
    .from("playlists")
    .select("id, name, default_duration_ms, transition, playback_mode, published_at, published_transition, published_playback_mode, revision, updated_at")
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
      .select("id, file_name, storage_path, kind, duration_ms, thumbnail_path, group_duration_ms, group_revision, slide_count")
      .eq("account_id", admin.accountId)
      .in("id", mediaIds);
    let mediaRows = rich.data as MediaRef[] | null;
    let mediaError = rich.error;
    if (mediaError && isMissingSchema(mediaError)) {
      const mid = await db()
        .from("media")
        .select("id, file_name, storage_path, kind, duration_ms, thumbnail_path")
        .eq("account_id", admin.accountId)
        .in("id", mediaIds);
      mediaRows = mid.data as MediaRef[] | null;
      mediaError = mid.error;
      if (mediaError && isMissingSchema(mediaError)) {
        const plain = await db()
          .from("media")
          .select("id, file_name, storage_path")
          .eq("account_id", admin.accountId)
          .in("id", mediaIds);
        mediaRows = plain.data as MediaRef[] | null;
        mediaError = plain.error;
      }
    }
    if (mediaError) return fail("Couldn't load the playlist.", 500);
    for (const media of mediaRows ?? []) mediaById.set(media.id, media);
  }
  const presentationIds = [...mediaById.values()].filter((media) => media.kind === "presentation").map((media) => media.id);
  const slidesByParent = new Map<string, { id: string; file_name: string; storage_path: string; slide_index: number | null; slide_duration_ms: number | null; width: number | null; height: number | null }[]>();
  if (presentationIds.length) {
    const slideRows = await db()
      .from("media")
      .select("id, file_name, storage_path, source_media_id, slide_index, slide_revision, slide_duration_ms, width, height")
      .eq("account_id", admin.accountId)
      .in("source_media_id", presentationIds)
      .order("slide_index", { ascending: true });
    if (slideRows.error && !isMissingSchema(slideRows.error)) return fail("Couldn't load the playlist.", 500);
    for (const slide of slideRows.data ?? []) {
      const parent = mediaById.get(String(slide.source_media_id));
      const revision = Number(parent?.group_revision ?? 0);
      const current = revision <= 0 ? slide.slide_revision == null : Number(slide.slide_revision) === revision;
      if (!current) continue;
      const list = slidesByParent.get(String(slide.source_media_id)) ?? [];
      list.push({
        id: String(slide.id),
        file_name: String(slide.file_name ?? "Slide"),
        storage_path: String(slide.storage_path),
        slide_index: slide.slide_index == null ? null : Number(slide.slide_index),
        slide_duration_ms: slide.slide_duration_ms == null ? null : Number(slide.slide_duration_ms),
        width: slide.width == null ? null : Number(slide.width),
        height: slide.height == null ? null : Number(slide.height),
      });
      slidesByParent.set(String(slide.source_media_id), list);
    }
  }

  const urls = new Map<string, string>();
  const paths = [...new Set([
    ...[...mediaById.values()].flatMap((media) => [media.storage_path, media.thumbnail_path].filter(Boolean)),
    ...[...slidesByParent.values()].flatMap((slides) => slides.map((slide) => slide.storage_path)),
  ])] as string[];
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
    playbackMode: playlist.playback_mode === "manual" ? "manual" : "auto",
    publishedAt: playlist.published_at,
    publishedTransition: playlist.published_transition,
    publishedPlaybackMode: playlist.published_playback_mode === "manual" ? "manual" : playlist.published_playback_mode === "auto" ? "auto" : null,
    revision: playlist.revision,
    updatedAt: playlist.updated_at,
    items: (itemRows ?? []).map((item) => {
      const media = mediaById.get(item.media_id);
      const kind = media?.kind === "video" ? "video" : media?.kind === "presentation" ? "presentation" : "image";
      const base = {
        id: item.id,
        mediaId: item.media_id,
        fileName: media?.file_name ?? "Image",
        url: media ? urls.get(media.storage_path) ?? null : null,
        thumbnailUrl: media?.thumbnail_path ? urls.get(media.thumbnail_path) ?? null : null,
        kind,
        mediaDurationMs: media?.duration_ms ?? null,
        durationMs: item.duration_ms,
        position: item.position,
      };
      if (kind !== "presentation") return base;
      const slides = slidesByParent.get(item.media_id) ?? [];
      const cover = slides[0];
      return {
        ...base,
        url: cover ? urls.get(cover.storage_path) ?? null : null,
        slideCount: media?.slide_count ?? slides.length,
        groupDurationMs: media?.group_duration_ms ?? null,
        slides: slides.map((slide) => ({
          id: slide.id,
          fileName: slide.file_name,
          index: slide.slide_index ?? 0,
          url: urls.get(slide.storage_path) ?? null,
          width: slide.width,
          height: slide.height,
          durationMs: slide.slide_duration_ms,
        })),
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
  const playbackMode = body.playbackMode === undefined ? null : normalizePlaybackMode(body.playbackMode);
  const defaultDurationMs = body.defaultDurationMs;
  const items = parseDraftItems(body.items);
  if (!name) return fail("Give the playlist a name.", 400);
  if (!transition) return fail("Choose a transition.", 400);
  if (body.playbackMode !== undefined && !playbackMode) return fail("Choose Automatic or Manual slideshow.", 400);
  if (typeof defaultDurationMs !== "number" || !Number.isInteger(defaultDurationMs)) {
    return fail("Set a default duration in seconds.", 400);
  }
  if (defaultDurationMs < PLAYLIST_MIN_DURATION_MS || defaultDurationMs > PLAYLIST_MAX_DURATION_MS) {
    return fail("Default duration must be between 1 and 600 seconds.", 400);
  }
  if (!items) return fail("Check the slides and try again.", 400);
  const checked = await durationsFitMedia(admin.accountId, items);
  if (checked) return fail(checked, 400);

  const { data: ok, error } = await db().rpc("save_playlist", {
    p_account_id: admin.accountId,
    p_playlist_id: id,
    p_name: name,
    p_default_duration_ms: defaultDurationMs,
    p_transition: transition,
    p_items: items,
    p_playback_mode: playbackMode,
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

async function durationsFitMedia(accountId: string, items: { mediaId: string; durationMs: number | null }[]) {
  const ids = [...new Set(items.map((item) => item.mediaId))];
  if (!ids.length) return null;
  const media = await db().from("media").select("id, kind").eq("account_id", accountId).in("id", ids);
  if (media.error) {
    if (isMissingSchema(media.error)) return null;
    return "Couldn't save the playlist.";
  }
  const kinds = new Map((media.data ?? []).map((row) => [String(row.id), row.kind == null ? "image" : String(row.kind)]));
  for (const item of items) {
    if (item.durationMs == null) continue;
    if (kinds.get(item.mediaId) === "presentation") {
      if (item.durationMs < GROUP_MIN_DURATION_MS || item.durationMs > GROUP_MAX_DURATION_MS) {
        return "Each presentation stays between 3 and 3600 seconds per slide.";
      }
    } else if (item.durationMs < 1000 || item.durationMs > 600000) {
      return "Each slide must be between 1 and 600 seconds, or left blank to use the default.";
    }
  }
  return null;
}
