import { db } from "@/lib/server/supabase";
import { requireAdmin } from "@/lib/server/auth";
import { isUuid } from "@/lib/server/crypto";
import { isMissingSchema, SCHEDULES_UNAVAILABLE } from "@/lib/server/schema";
import { isValidTimeZone } from "@/lib/server/schedule";
import { normalizePlaylistName } from "@/lib/server/validate";
import { fail, json, readJson } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const { id } = await params;
  if (!isUuid(id)) return fail("Location not found.", 404);
  const body = await readJson(req);
  const patch: { name?: string; timezone?: string } = {};
  if ("name" in body) {
    const name = normalizePlaylistName(body.name);
    if (!name) return fail("Give this location a name.", 400);
    patch.name = name;
  }
  if ("timezone" in body) {
    const timezone = String(body.timezone ?? "");
    if (!isValidTimeZone(timezone)) return fail("That timezone isn't an IANA name like America/Los_Angeles.", 400);
    patch.timezone = timezone;
  }
  if (!patch.name && !patch.timezone) return fail("Nothing to update.", 400);

  const updated = await db()
    .from("locations")
    .update(patch)
    .eq("id", id)
    .eq("account_id", admin.accountId)
    .select("id")
    .maybeSingle();
  if (updated.error) {
    if (isMissingSchema(updated.error)) return fail(SCHEDULES_UNAVAILABLE, 503);
    return fail("Couldn't update the location.", 500);
  }
  if (!updated.data) return fail("Location not found.", 404);
  return json({ ok: true });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const { id } = await params;
  if (!isUuid(id)) return fail("Location not found.", 404);

  const owned = await db().from("locations").select("id").eq("id", id).eq("account_id", admin.accountId).maybeSingle();
  if (owned.error) return fail("Couldn't delete the location.", 500);
  if (!owned.data) return fail("Location not found.", 404);

  const active = await db()
    .from("displays")
    .select("id")
    .eq("account_id", admin.accountId)
    .eq("location_id", id)
    .eq("status", "active");
  if (active.error) return fail("Couldn't delete the location.", 500);
  if ((active.data ?? []).length) return fail("That location still has screens. Move them first.", 409);

  const detached = await db()
    .from("displays")
    .update({ location_id: null })
    .eq("account_id", admin.accountId)
    .eq("location_id", id);
  if (detached.error) return fail("Couldn't delete the location.", 500);

  const deleted = await db().from("locations").delete().eq("id", id).eq("account_id", admin.accountId).select("id");
  if (deleted.error) return fail("Couldn't delete the location.", 500);
  if (!(deleted.data ?? []).length) return fail("Location not found.", 404);
  return json({ ok: true });
}
