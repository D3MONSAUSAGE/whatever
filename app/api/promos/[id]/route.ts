import { requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/supabase";
import { isUuid } from "@/lib/server/crypto";
import { enforceLimit, fail, json, readJson } from "@/lib/server/http";
import { UPLOAD_MAX_PER_USER, UPLOAD_RATE_MESSAGE, UPLOAD_WINDOW_SECONDS } from "@/lib/server/limits";
import { PROMOS_UNAVAILABLE, PROMO_COLUMNS, checkPromoPhoto, detachPromo, isMissingSchema, parsePromoBody, promoView, rerenderPromo, syncPromoDates, type PromoRow } from "@/lib/server/promos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function load(accountId: string, id: string) {
  const row = await db().from("promos").select(PROMO_COLUMNS).eq("id", id).eq("account_id", accountId).maybeSingle();
  if (row.error) return { error: isMissingSchema(row.error) ? fail(PROMOS_UNAVAILABLE, 503) : fail("Couldn't load the promo.", 500) };
  if (!row.data) return { error: fail("Promo not found.", 404) };
  return { row: row.data as PromoRow };
}

export async function GET(req: Request, { params }: Ctx) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const { id } = await params;
  if (!isUuid(id)) return fail("Promo not found.", 404);
  const found = await load(admin.accountId, id);
  if (found.error) return found.error;
  const [promo] = await promoView([found.row]);
  return json(promo);
}

/** Save edits. A new image replaces the old one everywhere it plays; date changes move the dated rules too. */
export async function PATCH(req: Request, { params }: Ctx) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const { id } = await params;
  if (!isUuid(id)) return fail("Promo not found.", 404);
  const parsed = parsePromoBody(await readJson(req), true);
  if (!parsed.ok) return fail(parsed.error, 400);
  const found = await load(admin.accountId, id);
  if (found.error) return found.error;
  const row = found.row;
  const v = parsed.value;

  const startsOn: string | null = v.startsOn !== undefined ? v.startsOn : row.starts_on;
  const endsOn: string | null = v.endsOn !== undefined ? v.endsOn : row.ends_on;
  if (startsOn && endsOn && endsOn < startsOn) return fail("The end date is before the start date.", 400);
  const datesChanged = startsOn !== row.starts_on || endsOn !== row.ends_on;
  if (datesChanged && row.placement === "added" && (startsOn || endsOn)) {
    return fail("This promo is always on its menu. Take it off the menu, set the dates, then add it again.", 400);
  }
  if (datesChanged && row.placement === "scheduled" && !startsOn && !endsOn) {
    return fail("Keep at least one date, or take the promo off the menu and add it again without dates.", 400);
  }

  let mediaId: string | null = row.media_id;
  if (v.name !== undefined || v.template !== undefined || v.content !== undefined) {
    const photo = await checkPromoPhoto(admin.accountId, v.content);
    if (photo) return fail(photo.error, photo.status);
    const limited = await enforceLimit(`upload-image:${admin.userId}`, UPLOAD_WINDOW_SECONDS, UPLOAD_MAX_PER_USER, UPLOAD_RATE_MESSAGE);
    if (limited) return limited;
    const r = await rerenderPromo(admin.accountId, row, v);
    if (!("ok" in r)) return fail(r.error, r.status);
    mediaId = r.mediaId ?? null;
  }
  if (datesChanged) {
    const up = await db().from("promos").update({ starts_on: startsOn, ends_on: endsOn, updated_at: new Date().toISOString() }).eq("id", id).eq("account_id", admin.accountId);
    if (up.error) return fail("Couldn't save the dates.", 500);
    if (!(await syncPromoDates(admin.accountId, row, startsOn, endsOn))) return fail("Couldn't move the promo's dates.", 500);
  }
  return json({ id, mediaId, startsOn, endsOn });
}

/** Takes the promo off its menu, then removes the editable promo. Its last image stays in the media library. */
export async function DELETE(req: Request, { params }: Ctx) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const { id } = await params;
  if (!isUuid(id)) return fail("Promo not found.", 404);
  const found = await load(admin.accountId, id);
  if (found.error) return found.error;
  if (found.row.placement !== "none" && !(await detachPromo(admin.accountId, found.row))) return fail("Couldn't take the promo off its menu.", 500);
  const del = await db().from("promos").delete().eq("id", id).eq("account_id", admin.accountId);
  if (del.error) return fail("Couldn't delete the promo.", 500);
  return json({ ok: true });
}
