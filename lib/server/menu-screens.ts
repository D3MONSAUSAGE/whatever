import { db } from "./supabase";

/** Most screens one publish_playlist call accepts (the database function refuses more). */
export const PUBLISH_SCREEN_LIMIT = 50;

/**
 * Screens to pass to publish_playlist when a menu board is put on more screens.
 *
 * publish_playlist assigns the given screens and CLEARS every other screen showing that playlist. Menu callers send
 * only the screens the owner just ticked, so on their own they would take the board off the TVs already showing it.
 * Unless the caller explicitly asks to replace, the screens already on the board's playlist are kept.
 *
 * Returns the ids to publish, or null when the lookup failed (the caller must not publish then: a partial list would
 * clear screens).
 */
export async function screensForMenuPublish(accountId: string, playlistId: string, requested: string[], replace: boolean): Promise<string[] | null> {
  const unique = [...new Set(requested)];
  if (replace) return unique;
  const current = await db().from("displays").select("id").eq("account_id", accountId).eq("status", "active").eq("assigned_playlist_id", playlistId);
  if (current.error) return null;
  return [...new Set([...unique, ...(current.data ?? []).map((row) => String(row.id))])];
}
