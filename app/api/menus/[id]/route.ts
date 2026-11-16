import { detachPromo, PROMO_COLUMNS, type PromoRow } from "@/lib/server/promos";
import { requireAdmin } from "@/lib/server/auth";
import { BUCKET, db } from "@/lib/server/supabase";
import { isUuid } from "@/lib/server/crypto";
import { enforceLimit, fail, json, readJson } from "@/lib/server/http";
import { keepStoredFonts } from "@/lib/menu-templates";
import { PUBLISH_MAX_PER_USER, PUBLISH_RATE_MESSAGE, PUBLISH_WINDOW_SECONDS, UPLOAD_MAX_PER_USER, UPLOAD_RATE_MESSAGE, UPLOAD_WINDOW_SECONDS } from "@/lib/server/limits";
import { MENUS_UNAVAILABLE, checkMenuPhoto, isMissingSchema, menuView, parseMenuBody, rerenderMenu, type MenuRow } from "@/lib/server/menus";
import { withLocalizedErrors } from "@/lib/server/locale";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };
const COLUMNS = "id, name, template, content, media_id, playlist_id, created_at, updated_at";

async function load(accountId: string, id: string) {
  const row = await db().from("menus").select(COLUMNS).eq("id", id).eq("account_id", accountId).maybeSingle();
  if (row.error) return { error: isMissingSchema(row.error) ? fail(MENUS_UNAVAILABLE, 503) : fail("Couldn't load the menu.", 500) };
  if (!row.data) return { error: fail("Menu not found.", 404) };
  return { row: row.data as MenuRow };
}

export const GET = withLocalizedErrors(async function GET(req: Request, { params }: Ctx) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const { id } = await params;
  if (!isUuid(id)) return fail("Menu not found.", 404);
  const found = await load(admin.accountId, id);
  if (found.error) return found.error;
  const [menu] = await menuView(admin.accountId, [found.row]);
  return json(menu);
});

/** Save edits: renders a new image and swaps it in everywhere the old one plays. */
export const PATCH = withLocalizedErrors(async function PATCH(req: Request, { params }: Ctx) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const { id } = await params;
  if (!isUuid(id)) return fail("Menu not found.", 404);
  const body = await readJson(req);
  const parsed = parseMenuBody(body, true);
  if (!parsed.ok) return fail(parsed.error, 400);
  const found = await load(admin.accountId, id);
  if (found.error) return found.error;
  const row = found.row;
  // E6: clients that don't know about fonts (Android +13) must not strip them on edit.
  if (parsed.value.content) parsed.value.content = keepStoredFonts(body.content, parsed.value.content, row.content);

  const photo = await checkMenuPhoto(admin.accountId, parsed.value.content);
  if (photo) return fail(photo.error, photo.status);
  const limited = await enforceLimit(`upload-image:${admin.userId}`, UPLOAD_WINDOW_SECONDS, UPLOAD_MAX_PER_USER, UPLOAD_RATE_MESSAGE);
  if (limited) return limited;
  const result = await rerenderMenu(admin.accountId, row, parsed.value);
  if (!("ok" in result)) return fail(result.error, result.status);
  const { mediaId, playlistId } = result;

  let published: boolean | undefined;
  if (parsed.value.displayIds?.length && playlistId) {
    const pubLimited = await enforceLimit(`publish:${admin.userId}`, PUBLISH_WINDOW_SECONDS, PUBLISH_MAX_PER_USER, PUBLISH_RATE_MESSAGE);
    if (pubLimited) return pubLimited;
    const pub = await db().rpc("publish_playlist", { p_account_id: admin.accountId, p_playlist_id: playlistId, p_display_ids: parsed.value.displayIds });
    published = !pub.error && Boolean(pub.data);
  }
  return json({ id, mediaId, playlistId, published });
});

/**
 * Removes the editable menu. Its backing playlist and rendered image go too, but only when nothing
 * else uses them (0031 menu_delete_cleanup: no screen, schedule, promo, other menu or other playlist).
 * Anything still in use stays, so no screen goes blank. Before 0031 only the menu row is removed.
 */
export const DELETE = withLocalizedErrors(async function DELETE(req: Request, { params }: Ctx) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const { id } = await params;
  if (!isUuid(id)) return fail("Menu not found.", 404);
  // M13: take this menu's promos off first so no "menu + promo" rules are left behind.
  const promos = await db().from("promos").select(PROMO_COLUMNS).eq("menu_id", id).eq("account_id", admin.accountId);
  for (const row of (promos.data ?? []) as unknown as PromoRow[]) await detachPromo(admin.accountId, row);

  const cleaned = await db().rpc("menu_delete_cleanup", { p_account_id: admin.accountId, p_menu_id: id });
  if (!cleaned.error) {
    if (!cleaned.data) return fail("Menu not found.", 404);
    const result = cleaned.data as { playlistDeleted?: unknown; mediaDeleted?: unknown; paths?: unknown };
    const paths = (Array.isArray(result.paths) ? result.paths : [])
      .filter((path): path is string => typeof path === "string" && path.startsWith(`${admin.accountId}/`));
    if (paths.length) {
      try {
        await db().storage.from(BUCKET).remove(paths);
      } catch {
        /* the row is gone; a leftover object is swept by the orphan-uploads cron */
      }
    }
    return json({ ok: true, playlistDeleted: result.playlistDeleted === true, imageDeleted: result.mediaDeleted === true });
  }
  if (!isMissingSchema(cleaned.error)) return fail("Couldn't delete the menu.", 500);

  // 0031 not applied yet: the earlier behaviour, menu row only.
  const del = await db().from("menus").delete().eq("id", id).eq("account_id", admin.accountId).select("id");
  if (del.error) return isMissingSchema(del.error) ? fail(MENUS_UNAVAILABLE, 503) : fail("Couldn't delete the menu.", 500);
  if (!(del.data ?? []).length) return fail("Menu not found.", 404);
  return json({ ok: true });
});
