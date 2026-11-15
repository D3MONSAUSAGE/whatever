import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import type Stripe from "stripe";
import { setTestDb } from "@/lib/server/supabase";

// PR53 rebased (pantalla/deletion-stops-billing): Francisco t58u, "Cancel paid subscriptions safely when
// accounts are permanently deleted, after verifying the Stripe behavior." Stripe is mocked; no network.

const stripeMock = vi.hoisted(() => ({
  client: null as null | { subscriptions: { retrieve: (id: string) => Promise<unknown>; cancel: (id: string) => Promise<unknown> } },
  mode: "live" as "live" | "test",
  calls: [] as string[],
}));
vi.mock("@/lib/server/stripe", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/server/stripe")>();
  return {
    ...real,
    stripe: () => { stripeMock.calls.push("stripe()"); return stripeMock.client; },
    billingMode: () => stripeMock.mode,
  };
});
const email = vi.hoisted(() => ({ sent: 0 }));
vi.mock("@/lib/server/email", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/server/email")>();
  return { ...real, emailProvider: () => ({ name: "spy", async send() { email.sent++; return { ok: true }; } }) };
});

const { runDueDeletions, isBillingStopError } = await import("@/lib/server/account-deletion");
const { applyEvent } = await import("@/lib/server/stripe");
const { purgeHeldAccountIds } = await import("@/lib/server/billing-dispatch");

const ACCOUNT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
type Row = Record<string, unknown>;

/** Small in-memory Supabase: accounts, account_deletion_requests, stripe_events, one storage bucket, auth users. */
function world(account: Row | null) {
  const log: string[] = [];
  const tables: Record<string, Row[]> = {
    accounts: account ? [{ id: ACCOUNT, owner_user_id: USER, ...account }] : [],
    account_deletion_requests: [{ id: "req-1", account_id: ACCOUNT, user_id: USER, status: "pending", error: null, scheduled_for: "2026-11-01T00:00:00Z" }],
    stripe_events: [],
  };
  const objects = new Set([`${ACCOUNT}/logo.png`, `${ACCOUNT}/menu.mp4`]);
  const users = new Set([USER]);
  function from(table: string) {
    const filters: Array<(r: Row) => boolean> = [];
    let op: "select" | "update" | "insert" | "delete" = "select";
    let payload: Row = {};
    let single = false;
    const b = {
      select() { return b; },
      update(p: Row) { op = "update"; payload = p; return b; },
      insert(p: Row) { op = "insert"; payload = p; return b; },
      delete() { op = "delete"; return b; },
      eq(c: string, v: unknown) { filters.push((r) => r[c] === v); return b; },
      in(c: string, v: unknown[]) { filters.push((r) => v.includes(r[c])); return b; },
      or(expr: string) {
        if (expr === "status.in.(processing,failed),and(status.eq.pending,error.not.is.null)") {
          filters.push((r) => r.status === "processing" || r.status === "failed" || (r.status === "pending" && r.error != null));
        } else filters.push(() => true);
        return b;
      },
      lte() { return b; },
      maybeSingle() { single = true; return b; },
      then(ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) {
        try { return Promise.resolve(ok(run())); } catch (e) { return bad ? Promise.resolve(bad(e)) : Promise.reject(e); }
      },
    };
    function run() {
      const rows = tables[table];
      if (!rows) throw new Error(`unexpected table ${table}`);
      log.push(`${op}:${table}`);
      if (op === "insert") {
        if (rows.some((r) => r.id === payload.id)) return { data: null, error: { code: "23505", message: "dup" } };
        rows.push({ ...payload }); return { data: null, error: null };
      }
      const hit = rows.filter((r) => filters.every((f) => f(r)));
      if (op === "update") { hit.forEach((r) => Object.assign(r, payload)); return { data: null, error: null }; }
      if (op === "delete") { tables[table] = rows.filter((r) => !hit.includes(r)); return { data: null, error: null }; }
      return { data: single ? hit[0] ?? null : hit, error: null };
    }
    return b;
  }
  const client = {
    from,
    async rpc(name: string) {
      if (name !== "claim_due_account_deletions") throw new Error(name);
      const due = tables.account_deletion_requests.filter((r) => r.status === "pending");
      due.forEach((r) => { r.status = "processing"; });
      return { data: due.map((r) => ({ id: r.id, account_id: r.account_id, user_id: r.user_id })), error: null };
    },
    storage: {
      from: () => ({
        async list(dir: string, o: { offset: number }) {
          log.push("storage:list");
          if (o.offset > 0 || dir !== ACCOUNT) return { data: [], error: null };
          return { data: [...objects].map((p) => ({ id: "x", name: p.slice(ACCOUNT.length + 1) })), error: null };
        },
        async remove(paths: string[]) { log.push("storage:remove"); paths.forEach((p) => objects.delete(p)); return { data: null, error: null }; },
      }),
    },
    auth: { admin: { async deleteUser(id: string) {
      log.push("auth:deleteUser"); users.delete(id);
      tables.accounts = tables.accounts.filter((a) => a.owner_user_id !== id); // cascade
      return { error: null };
    } } },
  };
  setTestDb(client as never);
  return { log, tables, objects, users, request: () => tables.account_deletion_requests[0] };
}

const sub = (o: Partial<Stripe.Subscription> = {}) => ({ id: "sub_paid1", customer: "cus_paid1", status: "active", livemode: true, ...o });
function fakeStripe(opts: { cancelFails?: boolean; status?: string } = {}) {
  const calls: string[] = [];
  stripeMock.client = {
    subscriptions: {
      async retrieve(id) { calls.push(`retrieve:${id}`); return sub({ status: (opts.status ?? "active") as Stripe.Subscription.Status }); },
      async cancel(id) {
        calls.push(`cancel:${id}`);
        if (opts.cancelFails) throw Object.assign(new Error("api down"), { type: "StripeAPIError" });
        return sub({ status: "canceled" });
      },
    },
  };
  return calls;
}

beforeEach(() => { stripeMock.client = null; stripeMock.mode = "live"; stripeMock.calls = []; email.sent = 0; });
afterEach(() => setTestDb(null));

describe("(a) active paid subscription is cancelled immediately at purge", () => {
  it("retrieve -> cancel (immediate, not at period end) happens before any file or login is removed", async () => {
    const w = world({ stripe_customer_id: "cus_paid1", stripe_subscription_id: "sub_paid1", subscription_status: "active" });
    const calls = fakeStripe();
    expect(await runDueDeletions({ dryRun: false })).toEqual({ due: 1, deleted: 1, failed: 0 });
    expect(calls).toEqual(["retrieve:sub_paid1", "cancel:sub_paid1"]);
    expect(w.log.indexOf("storage:list")).toBeGreaterThan(w.log.indexOf("select:accounts"));
    expect(w.objects.size).toBe(0);
    expect(w.users.size).toBe(0);
    expect(w.request()).toMatchObject({ status: "completed", error: null });
    const src = readFileSync("lib/server/account-deletion.ts", "utf8");
    expect(src).toContain("client.subscriptions.cancel(id)"); // DELETE /v1/subscriptions/:id = immediate cancel
    expect(src).not.toMatch(/cancel_at_period_end:\s*true/);
  });
  it("an already-cancelled subscription is not cancelled twice and the purge continues", async () => {
    world({ stripe_customer_id: "cus_paid1", stripe_subscription_id: "sub_paid1" });
    const calls = fakeStripe({ status: "canceled" });
    expect((await runDueDeletions({ dryRun: false })).deleted).toBe(1);
    expect(calls).toEqual(["retrieve:sub_paid1"]);
  });
  it("dry run never calls Stripe", async () => {
    world({ stripe_customer_id: "cus_paid1", stripe_subscription_id: "sub_paid1" });
    const calls = fakeStripe();
    // dry run counts with a head select the fake doesn't model; only Stripe silence matters here
    await runDueDeletions({ dryRun: true }).catch(() => undefined);
    expect(calls).toEqual([]);
  });
});

describe("(b) cancel failure keeps the account and retries next run", () => {
  it("nothing is purged, the error is recorded, the request goes back to pending, and the next run finishes", async () => {
    const w = world({ stripe_customer_id: "cus_paid1", stripe_subscription_id: "sub_paid1" });
    const calls = fakeStripe({ cancelFails: true });
    expect(await runDueDeletions({ dryRun: false })).toEqual({ due: 1, deleted: 0, failed: 1 });
    expect(calls).toEqual(["retrieve:sub_paid1", "cancel:sub_paid1"]);
    expect(w.log).not.toContain("storage:list");
    expect(w.log).not.toContain("storage:remove");
    expect(w.log).not.toContain("auth:deleteUser");
    expect(w.objects.size).toBe(2);
    expect(w.users.has(USER)).toBe(true);
    expect(w.tables.accounts).toHaveLength(1);
    expect(w.request()).toMatchObject({ status: "pending", error: "billing_cancel" });
    // While waiting to retry, billing reminders skip this account.
    expect([...(await purgeHeldAccountIds())!]).toEqual([ACCOUNT]);

    const retry = fakeStripe();
    expect(await runDueDeletions({ dryRun: false })).toEqual({ due: 1, deleted: 1, failed: 0 });
    expect(retry).toEqual(["retrieve:sub_paid1", "cancel:sub_paid1"]);
    expect(w.request()).toMatchObject({ status: "completed", error: null });
    expect(w.users.size).toBe(0);
  });
  it("no Stripe key, Stripe unreachable, wrong customer or wrong mode: kept and retried, never purged", async () => {
    for (const setup of [
      () => { stripeMock.client = null; },
      () => { stripeMock.client = { subscriptions: { retrieve: async () => { throw new Error("ECONNRESET"); }, cancel: async () => { throw new Error("no"); } } }; },
      () => { stripeMock.client = { subscriptions: { retrieve: async () => sub({ customer: "cus_someone_else" }), cancel: async () => { throw new Error("must not cancel"); } } }; },
      () => { stripeMock.mode = "test"; fakeStripe(); },
    ]) {
      stripeMock.mode = "live";
      const w = world({ stripe_customer_id: "cus_paid1", stripe_subscription_id: "sub_paid1" });
      setup();
      expect((await runDueDeletions({ dryRun: false })).deleted).toBe(0);
      expect(w.users.has(USER)).toBe(true);
      expect(w.objects.size).toBe(2);
      expect(w.request().status).toBe("pending");
      expect(isBillingStopError(String(w.request().error))).toBe(true);
    }
  });
  it("non-billing failures keep today's behavior (status failed)", async () => {
    const w = world({ stripe_customer_id: null, stripe_subscription_id: null });
    (w as unknown as { tables: Record<string, Row[]> }).tables.accounts[0].owner_user_id = "someone-else";
    await runDueDeletions({ dryRun: false });
    expect(w.request()).toMatchObject({ status: "failed", error: "not_owner" });
  });
});

describe("(c) trial and no-subscription accounts purge unchanged, with no Stripe call", () => {
  it.each([
    ["trial (no card)", { plan: "trial", stripe_customer_id: null, stripe_subscription_id: null }],
    ["customer but no subscription", { stripe_customer_id: "cus_only", stripe_subscription_id: null }],
    ["blank subscription id", { stripe_customer_id: "cus_only", stripe_subscription_id: "  " }],
  ])("%s", async (_name, acct) => {
    const w = world(acct);
    const calls = fakeStripe();
    expect(await runDueDeletions({ dryRun: false })).toEqual({ due: 1, deleted: 1, failed: 0 });
    expect(calls).toEqual([]);
    expect(stripeMock.calls).toEqual([]); // stripe() client never even constructed
    expect(w.users.size).toBe(0);
    expect(w.request().status).toBe("completed");
  });
});

describe("(d) no odd customer email, and the resulting webhook is a safe no-op", () => {
  it("customer.subscription.deleted for a purged account changes no rows, is marked processed, sends no email", async () => {
    const w = world(null); // account already gone
    const ev = { id: "evt_del_1", type: "customer.subscription.deleted", created: 2_000_000_000, livemode: true,
      data: { object: { ...sub({ status: "canceled" }), metadata: { account_id: ACCOUNT }, cancel_at_period_end: false, items: { data: [] } } } } as unknown as Stripe.Event;
    await expect(applyEvent(ev, { fetchSubscription: async () => { throw Object.assign(new Error("gone"), { code: "resource_missing" }); } })).resolves.toBe(true);
    expect(w.tables.accounts).toEqual([]);
    expect(w.tables.stripe_events).toHaveLength(1);
    expect(w.tables.stripe_events[0].processed_at).toBeTruthy();
    expect(email.sent).toBe(0);
    // replay is a duplicate no-op
    await expect(applyEvent(ev, { fetchSubscription: async () => sub({ status: "canceled" }) as never })).resolves.toBe(false);
  });
  it("the webhook path has no email or notice code at all", () => {
    const route = readFileSync("app/api/billing/webhook/route.ts", "utf8");
    const stripeSrc = readFileSync("lib/server/stripe.ts", "utf8");
    const apply = stripeSrc.slice(stripeSrc.indexOf("export async function applyEvent"), stripeSrc.indexOf("async function graceEndsAt"));
    for (const src of [route, apply]) expect(src).not.toMatch(/email|billingTemplate|notice|resend|send\(/i);
  });
  it("billing reminders (the only path that sends subscription_canceled) skip accounts whose purge started or failed", async () => {
    const w = world({ stripe_customer_id: "cus_paid1", stripe_subscription_id: "sub_paid1" });
    w.request().status = "failed"; // e.g. storage error after the subscription was cancelled
    w.tables.account_deletion_requests.push(
      { id: "req-2", account_id: "processing-acct", status: "processing", error: null },
      { id: "req-3", account_id: "normal-pending", status: "pending", error: null },
      { id: "req-4", account_id: "user-canceled", status: "canceled", error: null },
      { id: "req-5", account_id: "done", status: "completed", error: null },
    );
    expect([...(await purgeHeldAccountIds())!].sort()).toEqual([ACCOUNT, "processing-acct"].sort());
    const src = readFileSync("lib/server/billing-dispatch.ts", "utf8");
    const list = src.slice(src.indexOf("async function listReminderAccounts"));
    expect(list).toMatch(/const held = await purgeHeldAccountIds\(\);\s*if \(!held\) return \[\];/);
    expect(list).toContain("if (held.has(String(account.id))) continue;");
  });
});
