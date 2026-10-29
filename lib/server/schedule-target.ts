import { db } from "./supabase";

/** The playlist must already have published slides, and the screen or group must belong to the account. */
export async function assertTarget(accountId: string, playlistId: string, displayId: string | null, groupId: string | null) {
  const playlist = await db().from("playlists").select("id").eq("id", playlistId).eq("account_id", accountId).maybeSingle();
  if (playlist.error) return { status: 500, error: "Couldn't save the schedule." };
  if (!playlist.data) return { status: 404, error: "Playlist not found." };
  const published = await db().from("playlist_items").select("id").eq("playlist_id", playlistId).eq("account_id", accountId).eq("kind", "published");
  if (published.error) return { status: 500, error: "Couldn't save the schedule." };
  if (!(published.data ?? []).length) {
    return {
      status: 400,
      error: "Publish that playlist before scheduling it. Screens play its published slides, and publishing slides does not have to assign the playlist as the everyday default.",
    };
  }
  if (displayId) {
    const display = await db().from("displays").select("id").eq("id", displayId).eq("account_id", accountId).eq("status", "active").maybeSingle();
    if (display.error) return { status: 500, error: "Couldn't save the schedule." };
    if (!display.data) return { status: 404, error: "Display not found." };
  }
  if (groupId) {
    const group = await db().from("screen_groups").select("id").eq("id", groupId).eq("account_id", accountId).maybeSingle();
    if (group.error) return { status: 500, error: "Couldn't save the schedule." };
    if (!group.data) return { status: 404, error: "Screen group not found." };
  }
  return null;
}
