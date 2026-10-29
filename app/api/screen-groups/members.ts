import { db } from "@/lib/server/supabase";

/** Replace a group's screens. Every id has to be an active display in the account. */
export async function replaceMembers(accountId: string, groupId: string, displayIds: string[]) {
  if (displayIds.length) {
    const displays = await db()
      .from("displays")
      .select("id")
      .eq("account_id", accountId)
      .eq("status", "active")
      .in("id", displayIds);
    if (displays.error) return "error" as const;
    if ((displays.data ?? []).length !== displayIds.length) return "invalid" as const;
  }

  const existing = await db()
    .from("screen_group_members")
    .select("display_id")
    .eq("account_id", accountId)
    .eq("group_id", groupId);
  if (existing.error) return "error" as const;
  const previous = new Set((existing.data ?? []).map((row) => String(row.display_id)));
  const next = new Set(displayIds);
  const remove = [...previous].filter((id) => !next.has(id));
  const add = displayIds.filter((id) => !previous.has(id));

  if (remove.length) {
    const deleted = await db()
      .from("screen_group_members")
      .delete()
      .eq("account_id", accountId)
      .eq("group_id", groupId)
      .in("display_id", remove);
    if (deleted.error) return "error" as const;
  }
  for (const displayId of add) {
    const inserted = await db().from("screen_group_members").insert({
      account_id: accountId,
      group_id: groupId,
      display_id: displayId,
    });
    if (inserted.error) return "error" as const;
  }
  return "ok" as const;
}
