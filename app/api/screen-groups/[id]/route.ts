import { db } from "@/lib/server/supabase";
import { requireAdmin } from "@/lib/server/auth";
import { isUuid } from "@/lib/server/crypto";
import { isMissingSchema, SCHEDULES_UNAVAILABLE } from "@/lib/server/schema";
import { normalizePlaylistName } from "@/lib/server/validate";
import { fail, json, readJson } from "@/lib/server/http";
import { replaceMembers } from "../members";
import { parseDisplayIds } from "@/lib/server/screen-groups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const { id } = await params;
  if (!isUuid(id)) return fail("Screen group not found.", 404);
  const body = await readJson(req);
  const owned = await db().from("screen_groups").select("id, name").eq("id", id).eq("account_id", admin.accountId).maybeSingle();
  if (owned.error) {
    if (isMissingSchema(owned.error)) return fail(SCHEDULES_UNAVAILABLE, 503);
    return fail("Couldn't update the group.", 500);
  }
  if (!owned.data) return fail("Screen group not found.", 404);

  if ("name" in body) {
    const name = normalizePlaylistName(body.name);
    if (!name) return fail("Give this group a name.", 400);
    const peers = await db().from("screen_groups").select("id, name").eq("account_id", admin.accountId);
    if (peers.error) return fail("Couldn't update the group.", 500);
    if ((peers.data ?? []).some((group) => group.id !== id && String(group.name).toLowerCase() === name.toLowerCase())) {
      return fail("A group with that name already exists.", 409);
    }
    const updated = await db()
      .from("screen_groups")
      .update({ name, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("account_id", admin.accountId)
      .select("id")
      .maybeSingle();
    if (updated.error) {
      if (updated.error.code === "23505") return fail("A group with that name already exists.", 409);
      return fail("Couldn't update the group.", 500);
    }
  }

  if ("displayIds" in body) {
    const displayIds = parseDisplayIds(body.displayIds);
    if (displayIds === "invalid") return fail("One of those screens isn't in this account.", 400);
    const saved = await replaceMembers(admin.accountId, id, displayIds);
    if (saved === "invalid") return fail("One of those screens isn't in this account.", 400);
    if (saved === "error") return fail("Couldn't update the group.", 500);
    await db().from("screen_groups").update({ updated_at: new Date().toISOString() }).eq("id", id).eq("account_id", admin.accountId);
  }

  if (!("name" in body) && !("displayIds" in body)) return fail("Nothing to update.", 400);
  return json({ ok: true });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const { id } = await params;
  if (!isUuid(id)) return fail("Screen group not found.", 404);
  const deleted = await db().from("screen_groups").delete().eq("id", id).eq("account_id", admin.accountId).select("id");
  if (deleted.error) {
    if (isMissingSchema(deleted.error)) return fail(SCHEDULES_UNAVAILABLE, 503);
    return fail("Couldn't delete the group.", 500);
  }
  if (!(deleted.data ?? []).length) return fail("Screen group not found.", 404);
  return json({ ok: true });
}
