import { createClient } from "@supabase/supabase-js";
import { BUCKET, db } from "./supabase";

/** Self-service deletion is off unless ACCOUNT_DELETION=1 (needs release approval). */
export function deletionEnabled(env: Record<string, string | undefined> = process.env) {
  return env.ACCOUNT_DELETION === "1";
}
export const DELETION_DELAY_DAYS = 7;
export const ACCOUNT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Re-checks the password with a throwaway, non-persisting anon client. */
export async function passwordMatches(email: string, password: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon || !email || !password) return false;
  const c = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error || !data.session) return false;
  await c.auth.signOut({ scope: "local" }).catch(() => {});
  return true;
}

export type DeletionRequest = { id: string; status: string; requested_at: string; scheduled_for: string };

export async function currentRequest(accountId: string): Promise<DeletionRequest | null | "error"> {
  const r = await db().from("account_deletion_requests").select("id, status, requested_at, scheduled_for")
    .eq("account_id", accountId).in("status", ["pending", "processing"]).maybeSingle();
  if (r.error) return "error";
  return (r.data as DeletionRequest) ?? null;
}

/** Every object under `<accountId>/` in the media bucket, any depth. */
async function listAccountObjects(accountId: string) {
  const out: string[] = [];
  const dirs = [accountId];
  while (dirs.length && out.length < 100_000) {
    const dir = dirs.pop()!;
    for (let offset = 0; ; offset += 100) {
      const l = await db().storage.from(BUCKET).list(dir, { limit: 100, offset });
      if (l.error) throw new Error("storage list failed");
      for (const e of l.data ?? []) {
        if (!e?.name || e.name.includes("..")) continue;
        if (e.id === null) dirs.push(`${dir}/${e.name}`); else out.push(`${dir}/${e.name}`);
      }
      if ((l.data ?? []).length < 100) break;
    }
  }
  return out.filter((p) => p.startsWith(`${accountId}/`));
}

/** Deletes one account: its stored files, then the auth user (which cascades every account row). */
export async function deleteAccountData(accountId: string, userId: string) {
  if (!ACCOUNT_ID.test(accountId) || !ACCOUNT_ID.test(userId)) throw new Error("bad id");
  const owner = await db().from("accounts").select("owner_user_id").eq("id", accountId).maybeSingle();
  if (owner.error) throw new Error("account lookup failed");
  if (owner.data && owner.data.owner_user_id !== userId) throw new Error("not_owner");
  if (owner.data) {
    const paths = await listAccountObjects(accountId);
    for (let i = 0; i < paths.length; i += 100) {
      const r = await db().storage.from(BUCKET).remove(paths.slice(i, i + 100));
      if (r.error) throw new Error("storage remove failed");
    }
  }
  const del = await db().auth.admin.deleteUser(userId);
  if (del.error && !/not found/i.test(del.error.message)) throw new Error("user delete failed");
  // Belt and braces if the account somehow survived the cascade.
  await db().from("accounts").delete().eq("id", accountId).eq("owner_user_id", userId);
}

export async function runDueDeletions(opts: { dryRun: boolean; now?: string }) {
  if (opts.dryRun) {
    const r = await db().from("account_deletion_requests").select("id", { count: "exact", head: true })
      .eq("status", "pending").lte("scheduled_for", opts.now ?? new Date().toISOString());
    return { due: r.count ?? 0, deleted: 0, failed: 0 };
  }
  const claimed = await db().rpc("claim_due_account_deletions", opts.now ? { p_limit: 10, p_now: opts.now } : { p_limit: 10 });
  if (claimed.error) return { error: true as const };
  let deleted = 0, failed = 0;
  for (const r of (claimed.data ?? []) as { id: string; account_id: string; user_id: string }[]) {
    try {
      await deleteAccountData(r.account_id, r.user_id);
      await db().from("account_deletion_requests").update({ status: "completed", completed_at: new Date().toISOString(), error: null }).eq("id", r.id);
      deleted++;
    } catch (e) {
      await db().from("account_deletion_requests").update({ status: "failed", error: String((e as Error).message).slice(0, 200) }).eq("id", r.id);
      failed++;
    }
  }
  return { due: deleted + failed, deleted, failed };
}
