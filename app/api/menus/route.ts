import { requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/supabase";
import { enforceLimit, fail, json, readJson } from "@/lib/server/http";
import { PUBLISH_MAX_PER_USER, PUBLISH_RATE_MESSAGE, PUBLISH_WINDOW_SECONDS, UPLOAD_MAX_PER_USER, UPLOAD_RATE_MESSAGE, UPLOAD_WINDOW_SECONDS } from "@/lib/server/limits";
import { MAX_MENUS, MENUS_UNAVAILABLE, dropMenuImage, isMissingSchema, menuView, parseMenuBody, storeMenuImage, type MenuInput, type MenuRow } from "@/lib/server/menus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLUMNS = "id, name, template, content, media_id, playlist_id, created_at, updated_at";

export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const rows = await db().from("menus").select(COLUMNS).eq("account_id", admin.accountId).order("updated_at", { ascending: false });
  if (rows.error) {
    if (isMissingSchema(rows.error)) return json({ menus: [], available: false });
    return fail("Couldn't load menus.", 500);
  }
  return json({ menus: await menuView(admin.accountId, (rows.data ?? []) as MenuRow[]), available: true });
}

export async function POST(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const parsed = parseMenuBody(await readJson(req));
  if (!parsed.ok) return fail(parsed.error, 400);
  const input = parsed.value as MenuInput;

  const count = await db().from("menus").select("id").eq("account_id", admin.accountId);
  if (count.error) {
    if (isMissingSchema(count.error)) return fail(MENUS_UNAVAILABLE, 503);
    return fail("Couldn't create the menu.", 500);
  }
  if ((count.data ?? []).length >= MAX_MENUS) return fail(`This account already has ${MAX_MENUS} menus.`, 400);
  const limited = await enforceLimit(`upload-image:${admin.userId}`, UPLOAD_WINDOW_SECONDS, UPLOAD_MAX_PER_USER, UPLOAD_RATE_MESSAGE);
  if (limited) return limited;

  const mediaId = await storeMenuImage(admin.accountId, input.name, input.template, input.content);
  if (!mediaId) return fail("Couldn't create the menu image. Try again.", 500);

  const playlist = await db().rpc("menu_create_playlist", { p_account_id: admin.accountId, p_name: input.name, p_media_id: mediaId });
  if (playlist.error || !playlist.data) {
    await dropMenuImage(admin.accountId, mediaId);
    return fail(playlist.error && isMissingSchema(playlist.error) ? MENUS_UNAVAILABLE : "Couldn't create the menu.", playlist.error && isMissingSchema(playlist.error) ? 503 : 500);
  }
  const playlistId = String(playlist.data);

  const row = await db().from("menus").insert({
    account_id: admin.accountId, name: input.name, template: input.template, content: input.content,
    media_id: mediaId, playlist_id: playlistId, updated_at: new Date().toISOString(),
  }).select("id").single();
  if (row.error) return fail("Couldn't create the menu.", 500);

  let published = false;
  if (input.displayIds?.length) {
    const pubLimited = await enforceLimit(`publish:${admin.userId}`, PUBLISH_WINDOW_SECONDS, PUBLISH_MAX_PER_USER, PUBLISH_RATE_MESSAGE);
    if (pubLimited) return pubLimited;
    const pub = await db().rpc("publish_playlist", { p_account_id: admin.accountId, p_playlist_id: playlistId, p_display_ids: input.displayIds });
    published = !pub.error && Boolean(pub.data);
    if (!published) return json({ id: row.data.id, mediaId, playlistId, published, warning: "Menu saved, but it couldn't be shown on those screens. Check that they're paired." }, 201);
  }
  return json({ id: row.data.id, mediaId, playlistId, published }, 201);
}
