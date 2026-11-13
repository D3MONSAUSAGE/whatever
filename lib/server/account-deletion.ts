import { createClient } from "@supabase/supabase-js";
import { billingMode, stripe } from "./stripe";
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

export type StoredBilling = { customerId: string | null; subscriptionId: string | null };
export type RetrievedSubscription = { id: string; customerId: string | null; status: string; livemode: boolean };
export type SubscriptionStopper = {
  retrieve(id: string): Promise<RetrievedSubscription | "missing">;
  cancel(id: string): Promise<RetrievedSubscription>;
};

/**
 * Stop future charges for this account's own subscription before its files and login are removed.
 * A missing client, a customer mismatch, or a provider error throws and does not cancel anything else.
 * Already canceled, or an expired incomplete subscription, is success without a second cancel call.
 */
export async function stopChargingBeforePurge(billing: StoredBilling, stopper: SubscriptionStopper | null, live: boolean): Promise<"none" | "already_stopped" | "canceled"> {
  const subscriptionId = (billing.subscriptionId ?? "").trim();
  const customerId = (billing.customerId ?? "").trim();
  if (!subscriptionId) return "none";
  if (!/^sub_[A-Za-z0-9]+$/.test(subscriptionId) || (customerId && !/^cus_[A-Za-z0-9]+$/.test(customerId))) {
    throw new Error("billing_id");
  }
  if (!stopper) throw new Error("billing_unavailable");
  const found = await stopper.retrieve(subscriptionId);
  if (found === "missing") throw new Error("billing_missing");
  if (found.id !== subscriptionId || !customerId || found.customerId !== customerId || found.livemode !== live) {
    throw new Error("billing_mismatch");
  }
  if (found.status === "canceled" || found.status === "incomplete_expired") return "already_stopped";
  const stopped = await stopper.cancel(subscriptionId);
  if (stopped.id !== subscriptionId || stopped.customerId !== customerId || stopped.status !== "canceled" || stopped.livemode !== live) {
    throw new Error("billing_cancel");
  }
  return "canceled";
}

function subscriptionCustomer(customer: unknown): string | null {
  if (typeof customer === "string") return customer;
  if (customer && typeof customer === "object" && "id" in customer && typeof customer.id === "string") return customer.id;
  return null;
}

function billingStopper(): SubscriptionStopper | null {
  const client = stripe();
  if (!client) return null;
  return {
    async retrieve(id) {
      try {
        const sub = await client.subscriptions.retrieve(id);
        return { id: sub.id, customerId: subscriptionCustomer(sub.customer), status: sub.status, livemode: sub.livemode };
      } catch (err) {
        const code = err && typeof err === "object" && "code" in err ? String((err as { code?: unknown }).code) : "";
        if (code === "resource_missing") throw new Error("billing_missing");
        throw new Error("billing_unavailable");
      }
    },
    async cancel(id) {
      try {
        const sub = await client.subscriptions.cancel(id);
        return { id: sub.id, customerId: subscriptionCustomer(sub.customer), status: sub.status, livemode: sub.livemode };
      } catch {
        throw new Error("billing_cancel");
      }
    },
  };
}

/** Deletes one account: stop its subscription, remove stored files, then the auth user (which cascades every account row). */
export async function deleteAccountData(accountId: string, userId: string) {
  if (!ACCOUNT_ID.test(accountId) || !ACCOUNT_ID.test(userId)) throw new Error("bad id");
  const owner = await db().from("accounts").select("owner_user_id, stripe_customer_id, stripe_subscription_id").eq("id", accountId).maybeSingle();
  if (owner.error) throw new Error("account lookup failed");
  if (owner.data && owner.data.owner_user_id !== userId) throw new Error("not_owner");
  if (owner.data) {
    await stopChargingBeforePurge({
      customerId: owner.data.stripe_customer_id ? String(owner.data.stripe_customer_id) : null,
      subscriptionId: owner.data.stripe_subscription_id ? String(owner.data.stripe_subscription_id) : null,
    }, billingStopper(), billingMode() === "live");
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
