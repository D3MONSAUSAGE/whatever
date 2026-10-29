import { BUCKET, db } from "@/lib/server/supabase";
import { requireAdmin } from "@/lib/server/auth";
import { ONLINE_MS } from "@/lib/server/limits";
import { isMissingSchema } from "@/lib/server/schema";
import { fail, json } from "@/lib/server/http";
import { loadLocations } from "@/lib/server/locations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;

  const loaded = await loadDisplayRows(admin.accountId);
  if (loaded.error) return fail("Couldn't load displays.", 500);
  const rows = loaded.rows;
  const playlistColumn = loaded.playlistColumn;

  type MediaJoin = { id: string; file_name: string; storage_path: string };
  type Row = {
    id: string; name: string; token_hash: string | null; last_seen_at: string | null;
    location_id?: string | null;
    assigned_playlist_id?: string | null;
    player_error?: string | null;
    player_error_at?: string | null;
    media: MediaJoin | MediaJoin[] | null;
  };
  const list = (rows ?? []) as unknown as Row[];
  const playlistInfo = playlistColumn ? await loadPlaylists(admin.accountId, list) : new Map<string, { name: string; url: string | null }>();
  if (playlistInfo === null) return fail("Couldn't load displays.", 500);

  const locations = await loadLocations(admin.accountId);
  if (locations === "error") return fail("Couldn't load displays.", 500);
  const locationById = new Map(locations.map((location) => [location.id, location]));

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
        playerError: d.player_error ?? null,
        location: d.location_id ? locationById.get(d.location_id) ?? null : null,
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

async function loadDisplayRows(accountId: string) {
  const media = "media:assigned_media_id (id, file_name, storage_path)";
  const base = `id, name, location_id, token_hash, last_seen_at, created_at, ${media}`;
  const attempts = [
    { columns: `${base}, assigned_playlist_id, player_error, player_error_at`, playlistColumn: true },
    { columns: `${base}, assigned_playlist_id`, playlistColumn: true },
    { columns: base, playlistColumn: false },
  ];
  let lastError: { code?: string; message?: string } | null = null;
  for (const attempt of attempts) {
    const result = await db()
      .from("displays")
      .select(attempt.columns)
      .eq("account_id", accountId)
      .eq("status", "active")
      .order("created_at");
    if (!result.error) return { rows: result.data, playlistColumn: attempt.playlistColumn, error: null };
    lastError = result.error;
    if (!isMissingSchema(result.error)) return { rows: null, playlistColumn: false, error: result.error };
  }
  return { rows: null, playlistColumn: false, error: lastError };
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
  const richMedia = await db()
    .from("media")
    .select("id, storage_path, thumbnail_path, kind")
    .eq("account_id", accountId)
    .in("id", mediaIds);
  let mediaRows = richMedia.data as { id: string; storage_path: string; thumbnail_path?: string | null; kind?: string | null }[] | null;
  let mediaError = richMedia.error;
  if (mediaError && isMissingSchema(mediaError)) {
    const plain = await db().from("media").select("id, storage_path").eq("account_id", accountId).in("id", mediaIds);
    mediaRows = plain.data;
    mediaError = plain.error;
  }
  if (mediaError) return null;
  const pathByMedia = new Map((mediaRows ?? []).map((media) => [
    media.id,
    media.kind === "video" && media.thumbnail_path ? media.thumbnail_path : media.storage_path,
  ]));
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
