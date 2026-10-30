import { requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/supabase";
import { isUuid } from "@/lib/server/crypto";
import { enforceLimit, fail, json, readJson } from "@/lib/server/http";
import { PUBLISH_MAX_PER_USER, PUBLISH_RATE_MESSAGE, PUBLISH_WINDOW_SECONDS, UPLOAD_MAX_PER_USER, UPLOAD_RATE_MESSAGE, UPLOAD_WINDOW_SECONDS } from "@/lib/server/limits";
import { MENUS_UNAVAILABLE, dropMenuImage, isMissingSchema, menuView, parseMenuBody, storeMenuImage, type MenuRow } from "@/lib/server/menus";
import { isMenuTemplate, parseMenuContent } from "@/lib/menu-templates";

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

  const name = parsed.value.name ?? row.name;
  const template = parsed.value.template ?? (isMenuTemplate(row.template) ? row.template : "classic");
  const stored = parseMenuContent(row.content);
  const content = parsed.value.content ?? (stored.ok ? stored.value : null);
  if (!content) return fail("Add your menu items.", 400);

  const limited = await enforceLimit(`upload-image:${admin.userId}`, UPLOAD_WINDOW_SECONDS, UPLOAD_MAX_PER_USER, UPLOAD_RATE_MESSAGE);
  if (limited) return limited;
  const mediaId = await storeMenuImage(admin.accountId, name, template, content);
  if (!mediaId) return fail("Couldn't create the menu image. Try again.", 500);

  let playlistId = row.playlist_id;
  if (row.media_id) {
    const swap = await db().rpc("menu_swap_media", { p_account_id: admin.accountId, p_old_media_id: row.media_id, p_new_media_id: mediaId });
    if (swap.error || !swap.data) {
      await dropMenuImage(admin.accountId, mediaId);
      return fail("Couldn't update the menu.", 500);
    }
  }
  if (!playlistId) {
    const created = await db().rpc("menu_create_playlist", { p_account_id: admin.accountId, p_name: name, p_media_id: mediaId });
    if (!created.error && created.data) playlistId = String(created.data);
  }
  const updated = await db().from("menus").update({
    name, template, content, media_id: mediaId, playlist_id: playlistId, updated_at: new Date().toISOString(),
  }).eq("id", id).eq("account_id", admin.accountId);
  if (updated.error) return fail("Couldn't update the menu.", 500);
  await dropMenuImage(admin.accountId, row.media_id);

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
  const del = await db().from("menus").delete().eq("id", id).eq("account_id", admin.accountId).select("id");
  if (del.error) return isMissingSchema(del.error) ? fail(MENUS_UNAVAILABLE, 503) : fail("Couldn't delete the menu.", 500);
  if (!(del.data ?? []).length) return fail("Menu not found.", 404);
  return json({ ok: true });
}
