import { requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/supabase";
import { enforceLimit, fail, json, readJson } from "@/lib/server/http";
import { UPLOAD_MAX_PER_USER, UPLOAD_RATE_MESSAGE, UPLOAD_WINDOW_SECONDS } from "@/lib/server/limits";
import { dropMenuImage } from "@/lib/server/menus";
import { MAX_PROMOS, PROMOS_UNAVAILABLE, PROMO_COLUMNS, checkPromoPhoto, isMissingSchema, parsePromoBody, promoView, storePromoImage, type PromoInput, type PromoRow } from "@/lib/server/promos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const rows = await db().from("promos").select(PROMO_COLUMNS).eq("account_id", admin.accountId).order("updated_at", { ascending: false });
  if (rows.error) {
    if (isMissingSchema(rows.error)) return json({ promos: [], available: false });
    return fail("Couldn't load promos.", 500);
  }
  return json({ promos: await promoView((rows.data ?? []) as PromoRow[]), available: true });
}

/** Render a promo slide into media plus its own one-slide playlist. Not shown anywhere until added to a menu. */
export async function POST(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const parsed = parsePromoBody(await readJson(req));
  if (!parsed.ok) return fail(parsed.error, 400);
  const input = parsed.value as PromoInput;
  const count = await db().from("promos").select("id").eq("account_id", admin.accountId);
  if (count.error) return isMissingSchema(count.error) ? fail(PROMOS_UNAVAILABLE, 503) : fail("Couldn't create the promo.", 500);
  if ((count.data ?? []).length >= MAX_PROMOS) return fail(`This account already has ${MAX_PROMOS} promos.`, 400);
  const photo = await checkPromoPhoto(admin.accountId, input.content);
  if (photo) return fail(photo.error, photo.status);
  const limited = await enforceLimit(`upload-image:${admin.userId}`, UPLOAD_WINDOW_SECONDS, UPLOAD_MAX_PER_USER, UPLOAD_RATE_MESSAGE);
  if (limited) return limited;

  const mediaId = await storePromoImage(admin.accountId, input.name, input.template, input.content);
  if (!mediaId) return fail("Couldn't create the promo image. Try again.", 500);
  const playlist = await db().rpc("menu_create_playlist", { p_account_id: admin.accountId, p_name: input.name, p_media_id: mediaId });
  if (playlist.error || !playlist.data) {
    await dropMenuImage(admin.accountId, mediaId);
    return fail("Couldn't create the promo.", 500);
  }
  const row = await db().from("promos").insert({
    account_id: admin.accountId, name: input.name, template: input.template, content: input.content,
    media_id: mediaId, playlist_id: String(playlist.data), starts_on: input.startsOn, ends_on: input.endsOn,
    updated_at: new Date().toISOString(),
  }).select("id").single();
  if (row.error) return fail("Couldn't create the promo.", 500);
  return json({ id: row.data.id, mediaId, playlistId: String(playlist.data) }, 201);
}
