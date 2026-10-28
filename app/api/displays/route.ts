import { BUCKET, db } from "@/lib/server/supabase";
import { requireAdmin } from "@/lib/server/auth";
import { ONLINE_MS } from "@/lib/server/limits";
import { isMissingSchema } from "@/lib/server/schema";
import { fail, json } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;

  const columns = "id, name, token_hash, last_seen_at, created_at, media:assigned_media_id (id, file_name, storage_path)";
  const withPlaylist = await db()
    .from("displays")
    .select(`${columns}, assigned_playlist_id`)
    .eq("account_id", admin.accountId)
    .eq("status", "active")
    .order("created_at");
  let rows: unknown = withPlaylist.data;
  let error = withPlaylist.error;
  let playlistColumn = !error;
  if (error && isMissingSchema(error)) {
    const plain = await db()
      .from("displays")
      .select(columns)
      .eq("account_id", admin.accountId)
      .eq("status", "active")
      .order("created_at");
    rows = plain.data;
    error = plain.error;
    playlistColumn = false;
  }
  if (error) return fail("Couldn't load displays.", 500);

  type MediaJoin = { id: string; file_name: string; storage_path: string };
  type Row = {
    id: string; name: string; token_hash: string | null; last_seen_at: string | null;
    assigned_playlist_id?: string | null;
    media: MediaJoin | MediaJoin[] | null;
  };
  const list = (rows ?? []) as unknown as Row[];
  const playlistInfo = playlistColumn ? await loadPlaylists(admin.accountId, list) : new Map<string, { name: string; url: string | null }>();
  if (playlistInfo === null) return fail("Couldn't load displays.", 500);

  const mediaOf = (media: Row["media"]): MediaJoin | null =>
    Array.isArray(media) ? media[0] ?? null : media;
  const paths = [...new Set(list.map((d) => mediaOf(d.media)?.storage_path).filter(Boolean))] as string[];
  const urls = new Map<string, string>();
  if (paths.length) {
    const { data } = await db().storage.from(BUCKET).createSignedUrls(paths, 3600);
    data?.forEach((s) => s.path && s.signedUrl && urls.set(s.path, s.signedUrl));
  }

  const now = Date.now();
  return json(
    list.map((d) => {
      const media = mediaOf(d.media);
      return {
        id: d.id,
        name: d.name,
        connected: !!d.token_hash, // false until the TV collects its token
        online: !!d.last_seen_at && now - new Date(d.last_seen_at).getTime() < ONLINE_MS,
        lastSeenAt: d.last_seen_at,
        media: media
          ? { id: media.id, fileName: media.file_name, url: urls.get(media.storage_path) ?? null }
          : null,
        playlist: d.assigned_playlist_id && playlistInfo.get(d.assigned_playlist_id)
          ? {
              id: d.assigned_playlist_id,
              name: playlistInfo.get(d.assigned_playlist_id)!.name,
              url: playlistInfo.get(d.assigned_playlist_id)!.url,
            }
          : null,
      };
    }),
  );
}

async function loadPlaylists(accountId: string, rows: { assigned_playlist_id?: string | null }[]) {
  const ids = [...new Set(rows.map((row) => row.assigned_playlist_id).filter(Boolean))] as string[];
  const info = new Map<string, { name: string; url: string | null }>();
  if (!ids.length) return info;

  const { data: playlists, error } = await db()
    .from("playlists")
    .select("id, name")
    .eq("account_id", accountId)
    .in("id", ids);
  if (error) return isMissingSchema(error) ? info : null;
  for (const playlist of playlists ?? []) info.set(playlist.id, { name: playlist.name, url: null });

  const { data: items, error: itemError } = await db()
    .from("playlist_items")
    .select("playlist_id, media_id, position")
    .eq("account_id", accountId)
    .eq("kind", "published")
    .in("playlist_id", ids)
    .order("position");
  if (itemError) return isMissingSchema(itemError) ? info : null;

  const firstMedia = new Map<string, string>();
  for (const item of items ?? []) {
    if (!firstMedia.has(item.playlist_id)) firstMedia.set(item.playlist_id, item.media_id);
  }
  const mediaIds = [...new Set(firstMedia.values())];
  if (!mediaIds.length) return info;
  const { data: mediaRows, error: mediaError } = await db()
    .from("media")
    .select("id, storage_path")
    .eq("account_id", accountId)
    .in("id", mediaIds);
  if (mediaError) return null;
  const pathByMedia = new Map((mediaRows ?? []).map((media) => [media.id, media.storage_path]));
  const paths = [...new Set([...pathByMedia.values()])];
  const urls = new Map<string, string>();
  if (paths.length) {
    const { data } = await db().storage.from(BUCKET).createSignedUrls(paths, 3600);
    data?.forEach((item) => item.path && item.signedUrl && urls.set(item.path, item.signedUrl));
  }
  for (const [playlistId, mediaId] of firstMedia) {
    const current = info.get(playlistId);
    const path = pathByMedia.get(mediaId);
    if (current && path) current.url = urls.get(path) ?? null;
  }
  return info;
}
