import { detachPromo, PROMO_COLUMNS, type PromoRow } from "@/lib/server/promos";
import { requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/supabase";
import { isUuid } from "@/lib/server/crypto";
import { enforceLimit, fail, json, readJson } from "@/lib/server/http";
import { PUBLISH_MAX_PER_USER, PUBLISH_RATE_MESSAGE, PUBLISH_WINDOW_SECONDS, UPLOAD_MAX_PER_USER, UPLOAD_RATE_MESSAGE, UPLOAD_WINDOW_SECONDS } from "@/lib/server/limits";
import { MENUS_UNAVAILABLE, checkMenuPhoto, isMissingSchema, menuView, parseMenuBody, rerenderMenu, type MenuRow } from "@/lib/server/menus";

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

export async function GET(req: Request, { params }: Ctx) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const { id } = await params;
  if (!isUuid(id)) return fail("Menu not found.", 404);
  const found = await load(admin.accountId, id);
  if (found.error) return found.error;
  const [menu] = await menuView(admin.accountId, [found.row]);
  return json(menu);
}

/** Save edits: renders a new image and swaps it in everywhere the old one plays. */
export async function PATCH(req: Request, { params }: Ctx) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const { id } = await params;
  if (!isUuid(id)) return fail("Menu not found.", 404);
  const parsed = parseMenuBody(await readJson(req), true);
  if (!parsed.ok) return fail(parsed.error, 400);
  const found = await load(admin.accountId, id);
  if (found.error) return found.error;
  const row = found.row;

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
}

/** Removes the editable menu only. Its last image and playlist stay, so no screen goes blank. */
export async function DELETE(req: Request, { params }: Ctx) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const { id } = await params;
  if (!isUuid(id)) return fail("Menu not found.", 404);
  // M13: take this menu's promos off first so no "menu + promo" rules are left behind.
  const promos = await db().from("promos").select(PROMO_COLUMNS).eq("menu_id", id).eq("account_id", admin.accountId);
  for (const row of (promos.data ?? []) as unknown as PromoRow[]) await detachPromo(admin.accountId, row);
  const del = await db().from("menus").delete().eq("id", id).eq("account_id", admin.accountId).select("id");
  if (del.error) return isMissingSchema(del.error) ? fail(MENUS_UNAVAILABLE, 503) : fail("Couldn't delete the menu.", 500);
  if (!(del.data ?? []).length) return fail("Menu not found.", 404);
  return json({ ok: true });
}
