import { isReadyMediaStatus } from "@/lib/media-ready";
import { db } from "@/lib/server/supabase";

export const UNREADY_MEDIA_MESSAGE =
  "That video is still being converted, or conversion failed. Wait until it's ready, or pick a different video.";

export const UNREADY_PLAYLIST_MESSAGE =
  "This playlist includes a video that is still being converted, or that failed conversion. Wait until it's ready, or remove it, then publish again.";

/** Returns a user-facing error when any of the ids are still processing or have failed conversion. */
export async function unreadyMediaError(accountId: string, mediaIds: string[]): Promise<string | null> {
  const ids = [...new Set(mediaIds.filter(Boolean))];
  if (!ids.length) return null;
  const media = await db()
    .from("media")
    .select("id, processing_status")
    .eq("account_id", accountId)
    .in("id", ids);
  if (media.error) return "Couldn't check your media library.";
  const found = new Set((media.data ?? []).map((row) => String(row.id)));
  if (ids.some((id) => !found.has(id))) return null; // existing save_playlist / layout checks handle missing ids
  for (const row of media.data ?? []) {
    if (!isReadyMediaStatus(row.processing_status == null ? null : String(row.processing_status))) {
      return UNREADY_MEDIA_MESSAGE;
    }
  }
  return null;
}

export async function unreadyPublishedDraftError(accountId: string, playlistId: string): Promise<string | null> {
  const items = await db()
    .from("playlist_items")
    .select("media_id")
    .eq("account_id", accountId)
    .eq("playlist_id", playlistId)
    .eq("kind", "draft");
  if (items.error) return "Couldn't publish the playlist.";
  const ids = (items.data ?? []).map((row) => String(row.media_id));
  const unready = await unreadyMediaError(accountId, ids);
  return unready ? UNREADY_PLAYLIST_MESSAGE : null;
}
