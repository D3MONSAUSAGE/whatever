import { db } from "./supabase";
import { isMissingSchema } from "./schema";

/**
 * Where a file is still used outside playlists: menu boards, promotions and the Brand Kit logo.
 *
 * DELETE /api/media/:id only had the playlist check (delete_media refuses playlist rows). Everything else either has
 * no foreign key (menu and promo content JSON: item photos, the classic side photo, a layout's image, video and logo)
 * or an ON DELETE SET NULL key (brand_kits.logo_media_id, menus.media_id, promos.media_id), so deleting the file used
 * to silently drop it from boards or remove the Brand Kit logo.
 */
export type MediaReferences = { menus: string[]; promos: string[]; brandLogo: boolean };

/** True when any key ending in "MediaId" (at any depth) holds this id. Covers every board format and promo content. */
export function contentReferences(content: unknown, mediaId: string): boolean {
  const target = mediaId.toLowerCase();
  const walk = (value: unknown, depth: number): boolean => {
    if (depth > 8 || value === null || typeof value !== "object") return false;
    if (Array.isArray(value)) return value.some((item) => walk(item, depth + 1));
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      if (/MediaId$/.test(key) && typeof inner === "string" && inner.toLowerCase() === target) return true;
      if (inner && typeof inner === "object" && walk(inner, depth + 1)) return true;
    }
    return false;
  };
  return walk(content, 0);
}

/** Null means a lookup failed: the caller must not delete then. */
export async function mediaReferences(accountId: string, mediaId: string): Promise<MediaReferences | null> {
  const [menus, promos, brand] = await Promise.all([
    db().from("menus").select("name, content, media_id").eq("account_id", accountId),
    db().from("promos").select("name, content, media_id").eq("account_id", accountId),
    db().from("brand_kits").select("logo_media_id").eq("account_id", accountId).maybeSingle(),
  ]);
  for (const result of [menus, promos, brand]) {
    if (result.error && !isMissingSchema(result.error)) return null;
  }
  type Row = { name: unknown; content: unknown; media_id: unknown };
  const using = (rows: unknown) => ((rows ?? []) as Row[])
    .filter((row) => String(row.media_id ?? "").toLowerCase() === mediaId.toLowerCase() || contentReferences(row.content, mediaId))
    .map((row) => String(row.name ?? "").trim())
    .filter(Boolean);
  const logo = (brand.data as { logo_media_id?: unknown } | null)?.logo_media_id;
  return {
    menus: menus.error ? [] : using(menus.data),
    promos: promos.error ? [] : using(promos.data),
    brandLogo: !brand.error && String(logo ?? "").toLowerCase() === mediaId.toLowerCase(),
  };
}

export const IN_USE_MESSAGE = "This file is used by {name}. Remove it there, then delete it.";
export const LOGO_MESSAGE = "This file is your Brand Kit logo. Choose another logo, then delete it.";
export const LOGO_AND_USED_MESSAGE = "This file is your Brand Kit logo and is used by {name}. Remove it there, then delete it.";

/** The refusal text, or null when nothing uses the file. Names are quoted and sorted. */
export function inUseMessage(refs: MediaReferences): string | null {
  const names = [...new Set([...refs.menus, ...refs.promos])].sort((a, b) => a.localeCompare(b)).map((name) => `“${name}”`);
  const list = names.join(", ");
  if (refs.brandLogo && names.length) return LOGO_AND_USED_MESSAGE.replace("{name}", list);
  if (refs.brandLogo) return LOGO_MESSAGE;
  if (names.length) return IN_USE_MESSAGE.replace("{name}", list);
  return null;
}
