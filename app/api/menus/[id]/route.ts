import { detachPromo, PROMO_COLUMNS, type PromoRow } from "@/lib/server/promos";
import { requireAdmin } from "@/lib/server/auth";
import { rejectSubscriptionWrite } from "@/lib/server/subscription-write";
import { db } from "@/lib/server/supabase";
import { isUuid } from "@/lib/server/crypto";
import { enforceLimit, fail, json, readJson } from "@/lib/server/http";
import { keepStoredFonts, keepStoredItemPhotos } from "@/lib/menu-templates";
import { parseLayout } from "@/lib/layout-studio";
import { PUBLISH_MAX_PER_USER, PUBLISH_RATE_MESSAGE, PUBLISH_WINDOW_SECONDS, UPLOAD_MAX_PER_USER, UPLOAD_RATE_MESSAGE, UPLOAD_WINDOW_SECONDS } from "@/lib/server/limits";
import { MENUS_UNAVAILABLE, checkMenuPhoto, isMissingSchema, keepOwnItemPhotos, menuView, parseMenuBody, rerenderMenu, type MenuRow } from "@/lib/server/menus";
import { withLocalizedErrors } from "@/lib/server/locale";
import { PUBLISH_SCREEN_LIMIT, screensForMenuPublish } from "@/lib/server/menu-screens";
import { noteMenuSaved } from "@/lib/server/onboarding-hooks";

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

const TOO_MANY_SCREENS = "Choose fewer screens. Fifty is the limit for one publish.";

async function publishTo(accountId: string, playlistId: string, ids: string[]): Promise<boolean> {
  const pub = await db().rpc("publish_playlist", { p_account_id: accountId, p_playlist_id: playlistId, p_display_ids: ids });
  return !pub.error && Boolean(pub.data);
}

/** Save edits: renders a new image and swaps it in everywhere the old one plays. */
export const PATCH = withLocalizedErrors(async function PATCH(req: Request, { params }: Ctx) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const writeBlocked = await rejectSubscriptionWrite(admin.accountId, req);
  if (writeBlocked) return writeBlocked;
  const { id } = await params;
  if (!isUuid(id)) return fail("Menu not found.", 404);
  const body = await readJson(req);
  const parsed = parseMenuBody(body, true);
  // Adding screens never removes the ones already showing this board unless the client asks for exactly this set.
  const replace = body.replace === true;
  if (!parsed.ok) return fail(parsed.error, 400);
  const found = await load(admin.accountId, id);
  if (found.error) return found.error;
  const row = found.row;
  // Screens to publish to, worked out before anything is written so a refusal changes nothing. They include the
  // screens already showing this board (publish_playlist clears any screen it isn't given), unless replace is true.
  let targets: string[] | null = null;
  if (parsed.value.displayIds?.length) {
    targets = row.playlist_id
      ? await screensForMenuPublish(admin.accountId, row.playlist_id, parsed.value.displayIds, replace)
      : [...new Set(parsed.value.displayIds)];
    if (!targets) return fail("Couldn't load this board's screens. Try again.", 500);
    if (targets.length > PUBLISH_SCREEN_LIMIT) return fail(TOO_MANY_SCREENS, 400);
  }
  // Layout Studio and template boards (layoutVersion 1) are edited on the web. The classic editor path would
  // re-render them as a classic menu and overwrite the layout, item photos included, so older clients may only
  // rename them or put them on screens here.
  if (parseLayout(row.content).ok) {
    if (parsed.value.content !== undefined || parsed.value.template !== undefined) {
      return fail("This menu board was made in the web editor. Edit it at pekkotv.com.", 409);
    }
    if (parsed.value.name !== undefined) {
      const renamed = await db().from("menus").update({ name: parsed.value.name, updated_at: new Date().toISOString() }).eq("id", row.id).eq("account_id", admin.accountId);
      if (renamed.error) return fail("Couldn't update the menu.", 500);
    }
    let kept: boolean | undefined;
    if (targets && row.playlist_id) {
      const pubLimited = await enforceLimit(`publish:${admin.userId}`, PUBLISH_WINDOW_SECONDS, PUBLISH_MAX_PER_USER, PUBLISH_RATE_MESSAGE);
      if (pubLimited) return pubLimited;
      kept = await publishTo(admin.accountId, row.playlist_id, targets);
    }
    return json({ id, mediaId: row.media_id, playlistId: row.playlist_id, published: kept });
  }
  // E6: clients that don't know about fonts (Android +13) must not strip them on edit.
  if (parsed.value.content) parsed.value.content = keepStoredFonts(body.content, parsed.value.content, row.content);
  // Older clients (Android) don't know about item photos: an item sent without the key keeps its stored photo.
  if (parsed.value.content) parsed.value.content = await keepOwnItemPhotos(admin.accountId, keepStoredItemPhotos(body.content, parsed.value.content, row.content));

  const photo = await checkMenuPhoto(admin.accountId, parsed.value.content);
  if (photo) return fail(photo.error, photo.status);
  const limited = await enforceLimit(`upload-image:${admin.userId}`, UPLOAD_WINDOW_SECONDS, UPLOAD_MAX_PER_USER, UPLOAD_RATE_MESSAGE);
  if (limited) return limited;
  const result = await rerenderMenu(admin.accountId, row, parsed.value);
  if (!("ok" in result)) return fail(result.error, result.status);
  const { mediaId, playlistId } = result;
  // Onboarding v2: the board is saved; stamps "first menu" after the response (never affects this save).
  noteMenuSaved(req, admin.accountId, parsed.value.content ?? row.content);

  let published: boolean | undefined;
  if (targets && playlistId) {
    const pubLimited = await enforceLimit(`publish:${admin.userId}`, PUBLISH_WINDOW_SECONDS, PUBLISH_MAX_PER_USER, PUBLISH_RATE_MESSAGE);
    if (pubLimited) return pubLimited;
    published = await publishTo(admin.accountId, playlistId, targets);
  }
  return json({ id, mediaId, playlistId, published });
});

/** Removes the editable menu only. Its last image and playlist stay, so no screen goes blank. */
export const DELETE = withLocalizedErrors(async function DELETE(req: Request, { params }: Ctx) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const writeBlocked = await rejectSubscriptionWrite(admin.accountId, req);
  if (writeBlocked) return writeBlocked;
  const { id } = await params;
  if (!isUuid(id)) return fail("Menu not found.", 404);
  // M13: take this menu's promos off first so no "menu + promo" rules are left behind.
  const promos = await db().from("promos").select(PROMO_COLUMNS).eq("menu_id", id).eq("account_id", admin.accountId);
  for (const row of (promos.data ?? []) as unknown as PromoRow[]) await detachPromo(admin.accountId, row);
  const del = await db().from("menus").delete().eq("id", id).eq("account_id", admin.accountId).select("id");
  if (del.error) return isMissingSchema(del.error) ? fail(MENUS_UNAVAILABLE, 503) : fail("Couldn't delete the menu.", 500);
  if (!(del.data ?? []).length) return fail("Menu not found.", 404);
  return json({ ok: true });
});
