import { requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/supabase";
import { isUuid } from "@/lib/server/crypto";
import { enforceLimit, fail, json, readJson } from "@/lib/server/http";
import { PUBLISH_MAX_PER_USER, PUBLISH_RATE_MESSAGE, PUBLISH_WINDOW_SECONDS } from "@/lib/server/limits";
import { PROMOS_UNAVAILABLE, PROMO_COLUMNS, attachPromo, detachPromo, isMissingSchema, type PromoRow } from "@/lib/server/promos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function load(accountId: string, id: string) {
  const row = await db().from("promos").select(PROMO_COLUMNS).eq("id", id).eq("account_id", accountId).maybeSingle();
  if (row.error) return { error: isMissingSchema(row.error) ? fail(PROMOS_UNAVAILABLE, 503) : fail("Couldn't load the promo.", 500) };
  if (!row.data) return { error: fail("Promo not found.", 404) };
  return { row: row.data as PromoRow };
}

/** One tap: add the promo to a menu board (always on, or between its dates). */
export async function POST(req: Request, { params }: Ctx) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const { id } = await params;
  if (!isUuid(id)) return fail("Promo not found.", 404);
  const body = await readJson(req);
  if (typeof body.menuId !== "string" || !isUuid(body.menuId)) return fail("Menu not found.", 404);
  const found = await load(admin.accountId, id);
  if (found.error) return found.error;
  const limited = await enforceLimit(`publish:${admin.userId}`, PUBLISH_WINDOW_SECONDS, PUBLISH_MAX_PER_USER, PUBLISH_RATE_MESSAGE);
  if (limited) return limited;
  const r = await attachPromo(admin.accountId, found.row, body.menuId);
  if (!("ok" in r)) return fail(r.error, r.status);
  return json({ mode: r.mode, screens: r.screens });
}

/** One tap: take the promo off its menu. The menu itself keeps playing. */
export async function DELETE(req: Request, { params }: Ctx) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const { id } = await params;
  if (!isUuid(id)) return fail("Promo not found.", 404);
  const found = await load(admin.accountId, id);
  if (found.error) return found.error;
  if (!(await detachPromo(admin.accountId, found.row))) return fail("Couldn't take the promo off the menu. If it's the only slide left, add something else first.", 500);
  return json({ ok: true });
}
