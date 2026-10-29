import { db } from "@/lib/server/supabase";
import { requireAdmin } from "@/lib/server/auth";
import { isUuid } from "@/lib/server/crypto";
import { isMissingSchema, SCHEDULES_UNAVAILABLE } from "@/lib/server/schema";
import { normalizePlaylistName } from "@/lib/server/validate";
import { fail, json, readJson } from "@/lib/server/http";
import { replaceMembers } from "./members";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_GROUPS = 100;

export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const groups = await db()
    .from("screen_groups")
    .select("id, name, updated_at, created_at")
    .eq("account_id", admin.accountId)
    .order("created_at");
  if (groups.error) {
    if (isMissingSchema(groups.error)) return fail(SCHEDULES_UNAVAILABLE, 503);
    return fail("Couldn't load screen groups.", 500);
  }
  const members = await db()
    .from("screen_group_members")
    .select("group_id, display_id")
    .eq("account_id", admin.accountId);
  if (members.error) {
    if (isMissingSchema(members.error)) return fail(SCHEDULES_UNAVAILABLE, 503);
    return fail("Couldn't load screen groups.", 500);
  }
  const byGroup = new Map<string, string[]>();
  for (const member of members.data ?? []) {
    const id = String(member.group_id);
    const list = byGroup.get(id) ?? [];
    list.push(String(member.display_id));
    byGroup.set(id, list);
  }
  return json((groups.data ?? []).map((group) => ({
    id: group.id,
    name: group.name,
    displayIds: byGroup.get(String(group.id)) ?? [],
    updatedAt: group.updated_at,
  })));
}

export async function POST(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const body = await readJson(req);
  const name = normalizePlaylistName(body.name);
  if (!name) return fail("Give this group a name.", 400);
  const displayIds = parseDisplayIds(body.displayIds);
  if (displayIds === "invalid") return fail("One of those screens isn't in this account.", 400);

  const existing = await db().from("screen_groups").select("id, name").eq("account_id", admin.accountId);
  if (existing.error) {
    if (isMissingSchema(existing.error)) return fail(SCHEDULES_UNAVAILABLE, 503);
    return fail("Couldn't add the group.", 500);
  }
  if ((existing.data ?? []).length >= MAX_GROUPS) return fail("This account already has 100 screen groups.", 400);
  if ((existing.data ?? []).some((group) => String(group.name).toLowerCase() === name.toLowerCase())) {
    return fail("A group with that name already exists.", 409);
  }

  const inserted = await db()
    .from("screen_groups")
    .insert({ account_id: admin.accountId, name })
    .select("id")
    .single();
  if (inserted.error) {
    if (inserted.error.code === "23505") return fail("A group with that name already exists.", 409);
    if (isMissingSchema(inserted.error)) return fail(SCHEDULES_UNAVAILABLE, 503);
    return fail("Couldn't add the group.", 500);
  }
  if (displayIds.length) {
    const saved = await replaceMembers(admin.accountId, String(inserted.data.id), displayIds);
    if (saved === "invalid") {
      await db().from("screen_groups").delete().eq("id", inserted.data.id).eq("account_id", admin.accountId);
      return fail("One of those screens isn't in this account.", 400);
    }
    if (saved === "error") return fail("Couldn't add the group.", 500);
  }
  return json({ id: inserted.data.id }, 201);
}

export function parseDisplayIds(input: unknown): string[] | "invalid" {
  if (input == null) return [];
  if (!Array.isArray(input)) return "invalid";
  const ids: string[] = [];
  for (const value of input) {
    if (!isUuid(value)) return "invalid";
    if (!ids.includes(value)) ids.push(value);
  }
  if (ids.length > 100) return "invalid";
  return ids;
}
