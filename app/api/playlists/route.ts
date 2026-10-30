import { BUCKET, db } from "@/lib/server/supabase";
import { requireAdmin } from "@/lib/server/auth";
import { PLAYLIST_DEFAULT_DURATION_MS } from "@/lib/server/limits";
import { isMissingSchema, PLAYLISTS_UNAVAILABLE } from "@/lib/server/schema";
import { normalizePlaylistName } from "@/lib/server/validate";
import { fail, json, readJson } from "@/lib/server/http";
import { fetchAll, inChunks, matches, pageOf, parseListQuery } from "@/lib/server/paging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;

  const query = parseListQuery(req);
  type ListRow = { id: string; name: string; default_duration_ms: number; transition: string; published_at: string | null; updated_at: string; revision: number };
  const loaded = await fetchAll<ListRow>((from, to) => db()
    .from("playlists")
    .select("id, name, default_duration_ms, transition, published_at, updated_at, revision")
    .eq("account_id", admin.accountId)
    .order("updated_at", { ascending: false })
    .order("id")
    .range(from, to));
  if (loaded.error) {
    if (isMissingSchema(loaded.error)) return fail(PLAYLISTS_UNAVAILABLE, 503);
    return fail("Couldn't load playlists.", 500);
  }
  let lists = loaded.data ?? [];
  let page: ReturnType<typeof pageOf<ListRow>> | null = null;
  if (query) {
    // M14 opt-in: search by name, optional sort=name, then one page.
    const found = lists.filter((l) => matches(l.name, query.q));
    if (query.sort === "name") found.sort((x, y) => x.name.localeCompare(y.name, undefined, { sensitivity: "base" }));
    page = pageOf(found, query);
    lists = page.items;
  }

  const ids = (lists ?? []).map((list) => list.id);
  const slideCount = new Map<string, number>();
  const displayCount = new Map<string, number>();
  const displayNames = new Map<string, string[]>();
  const thumbnailUrl = new Map<string, string>();
  if (ids.length) {
    const { data: items, error: itemError } = await inChunks<{ playlist_id: string; media_id: string; position: number }>(ids, (chunk) =>
      fetchAll((from, to) => db()
        .from("playlist_items")
        .select("playlist_id, media_id, position")
        .eq("account_id", admin.accountId)
        .eq("kind", "draft")
        .in("playlist_id", chunk)
        .order("position", { ascending: true })
        .order("id")
        .range(from, to)), 50);
    if (itemError) return fail("Couldn't load playlists.", 500);
    const firstMedia = new Map<string, { mediaId: string; position: number }>();
    for (const item of items ?? []) {
      const playlistId = String(item.playlist_id);
      slideCount.set(playlistId, (slideCount.get(playlistId) ?? 0) + 1);
      // Thumbnail is the draft slide with the lowest position. A video at position 0 is the thumbnail.
      const position = Number(item.position);
      if (!Number.isFinite(position)) continue;
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
    const { data: displays, error: displayError } = await inChunks<{ name: string; assigned_playlist_id: string | null }>(ids, (chunk) =>
      fetchAll((from, to) => db()
        .from("displays")
        .select("name, assigned_playlist_id")
        .eq("account_id", admin.accountId)
        .eq("status", "active")
        .in("assigned_playlist_id", chunk)
        .order("id")
        .range(from, to)));
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

  const out = lists.map((list) => ({
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
    }));
  if (!page) return json(out);
  return json({ items: out, total: page.total, offset: page.offset, limit: page.limit, nextOffset: page.nextOffset });
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
