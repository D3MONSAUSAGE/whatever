import { db } from "./supabase";
import { isMissingSchema } from "./schema";

export type PlaylistRef = { id: string; name: string };

/** Playlists that still list this file on a draft or published slide. Null means the lookup failed. */
export async function playlistsUsingMedia(accountId: string, mediaId: string): Promise<PlaylistRef[] | null> {
  const used = await db()
    .from("playlist_items")
    .select("playlist_id")
    .eq("account_id", accountId)
    .eq("media_id", mediaId);
  if (used.error) return isMissingSchema(used.error) ? [] : null;
  const ids = [...new Set((used.data ?? []).map((row) => String(row.playlist_id)))];
  return namesFor(accountId, ids);
}

/** Every file in the account, keyed by media id. Null means the lookup failed. */
export async function usageByMedia(accountId: string): Promise<Map<string, PlaylistRef[]> | null> {
  const used = await db()
    .from("playlist_items")
    .select("media_id, playlist_id")
    .eq("account_id", accountId);
  if (used.error) return isMissingSchema(used.error) ? new Map() : null;

  const byMedia = new Map<string, Set<string>>();
  const playlistIds = new Set<string>();
  for (const row of used.data ?? []) {
    const mediaId = String(row.media_id);
    const playlistId = String(row.playlist_id);
    playlistIds.add(playlistId);
    const set = byMedia.get(mediaId) ?? new Set<string>();
    set.add(playlistId);
    byMedia.set(mediaId, set);
  }

  const refs = await namesFor(accountId, [...playlistIds]);
  if (!refs) return null;
  const byId = new Map(refs.map((ref) => [ref.id, ref]));
  const result = new Map<string, PlaylistRef[]>();
  for (const [mediaId, ids] of byMedia) {
    const list = [...ids]
      .map((id) => byId.get(id) ?? { id, name: "a playlist" })
      .sort((a, b) => a.name.localeCompare(b.name));
    result.set(mediaId, list);
  }
  return result;
}

async function namesFor(accountId: string, ids: string[]): Promise<PlaylistRef[] | null> {
  if (!ids.length) return [];
  const lists = await db().from("playlists").select("id, name").eq("account_id", accountId).in("id", ids);
  if (lists.error) return isMissingSchema(lists.error) ? ids.map((id) => ({ id, name: "a playlist" })) : null;
  const found = new Map((lists.data ?? []).map((row) => [String(row.id), String(row.name)]));
  return ids.map((id) => ({ id, name: found.get(id) || "a playlist" }));
}

export function playlistDeleteMessage(names: string[]) {
  const unique = [...new Set(names.map((name) => name.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const where = unique.length ? ` (${unique.join(", ")})` : "";
  return `This file is in a playlist${where}. Remove it from the playlist and publish again before deleting it.`;
}
