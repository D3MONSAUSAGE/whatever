import { BUCKET, db } from "@/lib/server/supabase";
import { requireAdmin } from "@/lib/server/auth";
import { PLAYLIST_DEFAULT_DURATION_MS } from "@/lib/server/limits";
import { isMissingSchema, PLAYLISTS_UNAVAILABLE } from "@/lib/server/schema";
import { normalizePlaylistName } from "@/lib/server/validate";
import { fail, json, readJson } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;

  const { data: lists, error } = await db()
    .from("playlists")
    .select("id, name, default_duration_ms, transition, published_at, updated_at, revision")
    .eq("account_id", admin.accountId)
    .order("updated_at", { ascending: false });
  if (error) {
    if (isMissingSchema(error)) return fail(PLAYLISTS_UNAVAILABLE, 503);
    return fail("Couldn't load playlists.", 500);
  }

  const ids = (lists ?? []).map((list) => list.id);
  const slideCount = new Map<string, number>();
  const displayCount = new Map<string, number>();
  const displayNames = new Map<string, string[]>();
  const thumbnailUrl = new Map<string, string>();
  if (ids.length) {
    const { data: items, error: itemError } = await db()
      .from("playlist_items")
      .select("playlist_id, media_id, position")
      .eq("account_id", admin.accountId)
      .eq("kind", "draft")
      .in("playlist_id", ids);
    if (itemError) return fail("Couldn't load playlists.", 500);
    const firstMedia = new Map<string, { mediaId: string; position: number }>();
    for (const item of items ?? []) {
      const playlistId = String(item.playlist_id);
      slideCount.set(playlistId, (slideCount.get(playlistId) ?? 0) + 1);
      const position = Number(item.position);
      const prev = firstMedia.get(playlistId);
      if (!prev || position < prev.position) firstMedia.set(playlistId, { mediaId: String(item.media_id), position });
    }
    const thumbs = await draftThumbnails(admin.accountId, [...firstMedia.values()].map((item) => item.mediaId));
    if (thumbs) {
      for (const [playlistId, media] of firstMedia) {
        const url = thumbs.get(media.mediaId);
        if (url) thumbnailUrl.set(playlistId, url);
      }
    }
    const { data: displays, error: displayError } = await db()
      .from("displays")
      .select("name, assigned_playlist_id")
      .eq("account_id", admin.accountId)
      .eq("status", "active")
      .in("assigned_playlist_id", ids);
    if (displayError && !isMissingSchema(displayError)) return fail("Couldn't load playlists.", 500);
    for (const display of displays ?? []) {
      const playlistId = display.assigned_playlist_id as string | null;
      if (!playlistId) continue;
      displayCount.set(playlistId, (displayCount.get(playlistId) ?? 0) + 1);
      const names = displayNames.get(playlistId) ?? [];
      names.push(String(display.name));
      displayNames.set(playlistId, names);
    }
  }

  return json(
    (lists ?? []).map((list) => ({
      id: list.id,
      name: list.name,
      defaultDurationMs: list.default_duration_ms,
      transition: list.transition,
      slideCount: slideCount.get(list.id) ?? 0,
      displayCount: displayCount.get(list.id) ?? 0,
      displayNames: displayNames.get(list.id) ?? [],
      thumbnailUrl: thumbnailUrl.get(list.id) ?? null,
      publishedAt: list.published_at,
      updatedAt: list.updated_at,
      revision: list.revision,
    })),
  );
}

async function draftThumbnails(accountId: string, mediaIds: string[]) {
  const ids = [...new Set(mediaIds)];
  if (!ids.length) return new Map<string, string>();
  const rich = await db()
    .from("media")
    .select("id, storage_path, thumbnail_path, kind")
    .eq("account_id", accountId)
    .in("id", ids);
  let rows = rich.data as { id: string; storage_path: string; thumbnail_path?: string | null; kind?: string | null }[] | null;
  let error = rich.error;
  if (error && isMissingSchema(error)) {
    const plain = await db().from("media").select("id, storage_path").eq("account_id", accountId).in("id", ids);
    rows = plain.data as typeof rows;
    error = plain.error;
  }
  if (error || !rows) return null;
  const pathByMedia = new Map(rows.map((media) => [
    media.id,
    media.kind === "video" && media.thumbnail_path ? media.thumbnail_path : media.storage_path,
  ]));
  const paths = [...new Set([...pathByMedia.values()].filter(Boolean))] as string[];
  const urls = new Map<string, string>();
  if (paths.length) {
    const { data } = await db().storage.from(BUCKET).createSignedUrls(paths, 3600);
    data?.forEach((item) => item.path && item.signedUrl && urls.set(item.path, item.signedUrl));
  }
  const result = new Map<string, string>();
  for (const [mediaId, path] of pathByMedia) {
    const url = path ? urls.get(path) : undefined;
    if (url) result.set(mediaId, url);
  }
  return result;
}

export async function POST(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const body = await readJson(req);
  const name = normalizePlaylistName(body.name);
  if (!name) return fail("Give the playlist a name.", 400);

  const now = new Date().toISOString();
  const { data, error } = await db()
    .from("playlists")
    .insert({
      account_id: admin.accountId,
      name,
      default_duration_ms: PLAYLIST_DEFAULT_DURATION_MS,
      transition: "none",
      revision: 0,
      created_at: now,
      updated_at: now,
    })
    .select("id")
    .single();
  if (error) {
    if (isMissingSchema(error)) return fail(PLAYLISTS_UNAVAILABLE, 503);
    return fail("Couldn't create the playlist.", 500);
  }
  return json({ id: data.id }, 201);
}
