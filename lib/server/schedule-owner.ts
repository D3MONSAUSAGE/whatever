import { db } from "./supabase";
import { isMissingSchema } from "./schema";

/**
 * M14: which schedules a promo manages. Derived, no migration: a promo with
 * placement "scheduled" owns every schedule on its combo_playlist_id.
 * Returns playlistId -> promoId, or null on a database error.
 */
export async function promoByPlaylist(accountId: string): Promise<Map<string, string> | null> {
  const out = new Map<string, string>();
  const rows = await db().from("promos").select("id, combo_playlist_id")
    .eq("account_id", accountId).eq("placement", "scheduled");
  if (rows.error) return isMissingSchema(rows.error) ? out : null;
  for (const row of rows.data ?? []) if (row.combo_playlist_id) out.set(String(row.combo_playlist_id), String(row.id));
  return out;
}

export function ownerFields(owners: Map<string, string>, playlistId: string) {
  const promoId = owners.get(String(playlistId)) ?? null;
  return { managedBy: promoId ? ("promo" as const) : null, promoId };
}
