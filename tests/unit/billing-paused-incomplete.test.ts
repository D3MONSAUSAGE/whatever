import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { setTestDb } from "@/lib/server/supabase";
import { applyEvent, statusFor } from "@/lib/server/stripe";
import {
  commercialEntitlement,
  subscriptionWritesAllowed,
  toResponse,
  type EntitlementRow,
} from "@/lib/server/entitlements";

type Row = Record<string, unknown>;

function splitTop(expr: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i];
    if (ch === "(") depth += 1;
    else if (ch === ")") depth -= 1;
    else if (ch === "," && depth === 0) {
      parts.push(expr.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(expr.slice(start));
  return parts;
}

function matchFilter(row: Row, expr: string): boolean {
  const trimmed = expr.trim();
  if (trimmed.startsWith("and(") && trimmed.endsWith(")")) return splitTop(trimmed.slice(4, -1)).every((part) => matchFilter(row, part));
  if (trimmed.startsWith("or(") && trimmed.endsWith(")")) return splitTop(trimmed.slice(3, -1)).some((part) => matchFilter(row, part));
  const notIn = trimmed.match(/^([a-z_]+)\.not\.in\.\(([^)]*)\)$/);
  if (notIn) {
    const value = row[notIn[1]];
    return value != null && !notIn[2].split(",").includes(String(value));
  }
  const inMatch = trimmed.match(/^([a-z_]+)\.in\.\(([^)]*)\)$/);
  if (inMatch) {
    const value = row[inMatch[1]];
    return value != null && inMatch[2].split(",").includes(String(value));
  }
  const parts = splitTop(trimmed);
  if (parts.length > 1) return parts.some((part) => matchFilter(row, part));
  const [col, cmp, value] = trimmed.split(".");
  if (cmp === "is") return value === "null" ? row[col] == null : false;
  if (cmp === "lt") return Number(row[col]) < Number(value);
  if (cmp === "eq") return row[col] == value;
  return false;
}

function memoryStripeDb() {
  const events = new Map<string, Row>();
  const accounts = new Map<string, Row>();
  function from(table: string) {
    const rows = table === "stripe_events" ? events : accounts;
    const filters: Array<(row: Row) => boolean> = [];
    let op: "select" | "insert" | "update" = "select";
    let payload: Row = {};
    const builder = {
      insert(row: Row) { op = "insert"; payload = row; return builder; },
      update(row: Row) { op = "update"; payload = row; return builder; },
      select() { return builder; },
      eq(col: string, val: unknown) { filters.push((row) => row[col] === val); return builder; },
      or(expr: string) { filters.push((row) => matchFilter(row, expr)); return builder; },
      maybeSingle() { return builder; },
      then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
        try { return Promise.resolve(onFulfilled(run())); } catch (err) {
          return onRejected ? Promise.resolve(onRejected(err)) : Promise.reject(err);
        }
      },
    };
    function run() {
      if (op === "insert") {
        const id = String(payload.id);
        if (rows.has(id)) return { data: null, error: { code: "23505", message: "duplicate" } };
        rows.set(id, { ...payload });
        return { data: payload, error: null };
      }
      const matched = [...rows.entries()].filter(([, row]) => filters.every((fn) => fn(row)));
      if (op === "update") {
        for (const [id, row] of matched) rows.set(id, { ...row, ...payload });
        return { data: null, error: null };
      }
      return { data: matched[0]?.[1] ?? null, error: null };
    }
    return builder;
  }
  return { from, accounts, events };
}

const TRIAL_START = "2026-11-01T08:00:00.000Z";
const TRIAL_END = "2026-11-15T08:00:00.000Z";
const GRACE_END = "2026-11-18T08:00:00.000Z";
const NOW = Date.parse("2026-11-10T08:00:00.000Z");

const prevEnforce = process.env.BILLING_ENFORCE;
const prevStarter = process.env.STRIPE_PRICE_STARTER;
const prevMulti = process.env.STRIPE_PRICE_MULTI;

beforeEach(() => {
  process.env.BILLING_ENFORCE = "1";
  process.env.STRIPE_PRICE_STARTER = "price_starter";
  process.env.STRIPE_PRICE_MULTI = "price_multi";
});

afterEach(() => {
  setTestDb(null);
  if (prevEnforce === undefined) delete process.env.BILLING_ENFORCE;
  else process.env.BILLING_ENFORCE = prevEnforce;
  if (prevStarter === undefined) delete process.env.STRIPE_PRICE_STARTER;
  else process.env.STRIPE_PRICE_STARTER = prevStarter;
  if (prevMulti === undefined) delete process.env.STRIPE_PRICE_MULTI;
  else process.env.STRIPE_PRICE_MULTI = prevMulti;
});

function stripeSub(overrides: Record<string, unknown> = {}): Stripe.Subscription {
  return {
    id: "sub_1",
    customer: "cus_1",
    status: "incomplete",
    cancel_at_period_end: false,
    current_period_end: Math.floor(Date.parse("2026-12-10T08:00:00.000Z") / 1000),
    trial_end: null,
    metadata: { account_id: "acct_1" },
    items: { data: [{ price: { id: "price_multi" } }] },
    ...overrides,
  } as unknown as Stripe.Subscription;
}

function ev(id: string, type: string, created: number, object: unknown): Stripe.Event {
  return { id, type, created, livemode: false, data: { object } } as Stripe.Event;
}

function trialEntitlementFromDb(row: Row, serverTime: string): EntitlementRow {
  const plan = String(row.plan ?? "trial") as EntitlementRow["plan"];
  const status = (row.subscription_status ? String(row.subscription_status) : null);
  const raw: EntitlementRow = {
    state: plan === "trial" ? "trial" : "canceled",
    plan,
    screen_limit: plan === "trial" ? 5 : 0,
    active_screens: 1,
    total_screens: 1,
    trial_started_at: plan === "trial" ? TRIAL_START : null,
    trial_ends_at: plan === "trial" ? TRIAL_END : null,
    playback_ends_at: plan === "trial" ? GRACE_END : null,
    subscription_status: status,
    current_period_end: row.current_period_end ? String(row.current_period_end) : null,
    cancel_at_period_end: Boolean(row.cancel_at_period_end),
    grace_ends_at: row.grace_ends_at ? String(row.grace_ends_at) : null,
    playback_allowed: plan === "trial",
    can_add_screen: plan === "trial",
    server_time: serverTime,
  };
  return commercialEntitlement(raw, true);
}

describe("Safeguard 1: incomplete first payment preserves trial & never grants paid access", () => {
  it("statusFor keeps incomplete/paused on invoice.payment_failed instead of converting to past_due", () => {
    expect(statusFor(ev("e1", "invoice.payment_failed", 10, {}), stripeSub({ status: "incomplete" }), NOW)).toBe("incomplete");
    expect(statusFor(ev("e2", "invoice.payment_failed", 10, {}), stripeSub({ status: "incomplete_expired" }), NOW)).toBe("incomplete_expired");
    expect(statusFor(ev("e3", "invoice.payment_failed", 10, {}), stripeSub({ status: "paused" }), NOW)).toBe("paused");
    expect(statusFor(ev("e4", "invoice.payment_failed", 10, {}), stripeSub({ status: "active" }), NOW)).toBe("past_due");
  });

  it("preserves 14-day trial and 3-day trial_grace across incomplete -> invoice.payment_failed -> incomplete_expired", async () => {
    const db = memoryStripeDb();
    db.accounts.set("acct_1", {
      id: "acct_1",
      plan: "trial",
      subscription_status: null,
      grace_ends_at: null,
      trial_canceled_before_charge: false,
      billing_event_created: null,
      trial_started_at: TRIAL_START,
      trial_ends_at: TRIAL_END,
    });
    setTestDb(db as never);

    // 1. Initial payment requires action / fails -> subscription created as incomplete
    await applyEvent(ev("evt_sub_inc", "customer.subscription.created", 100, { id: "sub_inc" }), {
      now: NOW,
      fetchSubscription: async () => stripeSub({ id: "sub_inc", status: "incomplete" }),
    });
    // 2. Initial invoice payment_failed fires -> must NOT enter past_due or overwrite plan='trial'
    await applyEvent(ev("evt_inv_fail", "invoice.payment_failed", 101, { id: "in_1", subscription: "sub_inc" }), {
      now: NOW,
      fetchSubscription: async () => stripeSub({ id: "sub_inc", status: "incomplete" }),
    });

    const rowDuringTrial = db.accounts.get("acct_1")!;
    expect(rowDuringTrial).toMatchObject({
      plan: "trial",
      subscription_status: "incomplete",
      grace_ends_at: null,
      trial_canceled_before_charge: false,
    });

    const entTrial = trialEntitlementFromDb(rowDuringTrial, "2026-11-12T08:00:00.000Z");
    expect(entTrial).toMatchObject({
      state: "trial",
      plan: "trial",
      screen_limit: 5,
      playback_allowed: true,
      can_add_screen: true,
    });
    expect(subscriptionWritesAllowed(entTrial)).toBe(true);
    const respTrial = toResponse("acct_1", entTrial, "https://pekkotv.com", {
      paymentMethod: { brand: "visa", last4: "4242" },
    });
    expect(respTrial.billing_starts_at).toBeNull();
    expect(respTrial.status_detail).toBeNull();

    // 3. 23h later -> incomplete_expired; still preserves trial then 3-day trial_grace then expired
    await applyEvent(ev("evt_inc_exp", "customer.subscription.updated", 200, { id: "sub_inc" }), {
      now: Date.parse("2026-11-15T10:00:00.000Z"),
      fetchSubscription: async () => stripeSub({ id: "sub_inc", status: "incomplete_expired" }),
    });
    const rowAfterExpire = db.accounts.get("acct_1")!;
    expect(rowAfterExpire).toMatchObject({
      plan: "trial",
      subscription_status: "incomplete_expired",
      grace_ends_at: null,
    });

    // Exact boundary: 1 ms before trial end -> still trial
    expect(trialEntitlementFromDb(rowAfterExpire, new Date(Date.parse(TRIAL_END) - 1).toISOString())).toMatchObject({
      state: "trial", playback_allowed: true, can_add_screen: true,
    });
    // Exact boundary: trial end -> enters 3-day trial_grace (playback continues, writes locked)
    const entGrace = trialEntitlementFromDb(rowAfterExpire, TRIAL_END);
    expect(entGrace).toMatchObject({
      state: "trial_grace", playback_allowed: true, can_add_screen: false, playback_ends_at: GRACE_END,
    });
    expect(subscriptionWritesAllowed(entGrace)).toBe(false);
    // Exact boundary: grace end -> expired
    expect(trialEntitlementFromDb(rowAfterExpire, GRACE_END)).toMatchObject({
      state: "expired", playback_allowed: false, can_add_screen: false, screen_limit: 0,
    });
  });

  it("never grants paid entitlement on incomplete/async_payment_failed, and grants paid only once invoice.paid/active arrives", async () => {
    const db = memoryStripeDb();
    db.accounts.set("acct_1", {
      id: "acct_1",
      plan: "starter",
      subscription_status: "canceled",
      grace_ends_at: null,
      trial_canceled_before_charge: false,
      billing_event_created: 10,
    });
    setTestDb(db as never);

    // Attempt to buy Multi fails -> stays on starter (not upgraded to multi), restricted playback
    await applyEvent(ev("evt_async_fail", "checkout.session.async_payment_failed", 50, {
      id: "cs_1",
      client_reference_id: "acct_1",
      subscription: "sub_multi",
    }), {
      now: NOW,
      fetchSubscription: async () => stripeSub({ id: "sub_multi", status: "incomplete" }),
    });
    expect(db.accounts.get("acct_1")).toMatchObject({
      plan: "starter",
      subscription_status: "incomplete",
      grace_ends_at: null,
    });
    const entIncomplete = commercialEntitlement({
      state: "canceled",
      plan: "starter",
      screen_limit: 0,
      active_screens: 1,
      total_screens: 1,
      trial_started_at: null,
      trial_ends_at: null,
      playback_ends_at: null,
      subscription_status: "incomplete",
      current_period_end: "2026-12-10T08:00:00.000Z",
      cancel_at_period_end: false,
      grace_ends_at: null,
      playback_allowed: false,
      can_add_screen: false,
      server_time: "2026-11-10T08:00:00.000Z",
    }, true);
    expect(entIncomplete).toMatchObject({ state: "canceled", playback_allowed: false, screen_limit: 0 });
    expect(subscriptionWritesAllowed(entIncomplete)).toBe(false);

    // Once payment succeeds -> active Multi granted
    await applyEvent(ev("evt_async_ok", "checkout.session.async_payment_succeeded", 60, {
      id: "cs_1",
      client_reference_id: "acct_1",
      subscription: "sub_multi",
    }), {
      now: NOW,
      fetchSubscription: async () => stripeSub({ id: "sub_multi", status: "active" }),
    });
    expect(db.accounts.get("acct_1")).toMatchObject({
      plan: "multi",
      subscription_status: "active",
      grace_ends_at: null,
    });
  });

  it("handles out-of-order, same-second, superseded subscriptions, and duplicate events idempotently", async () => {
    const db = memoryStripeDb();
    db.accounts.set("acct_1", {
      id: "acct_1",
      plan: "trial",
      subscription_status: null,
      grace_ends_at: null,
      trial_canceled_before_charge: false,
      billing_event_created: null,
    });
    db.accounts.set("acct_2", {
      id: "acct_2",
      plan: "multi",
      stripe_subscription_id: "sub_tenant_b",
      subscription_status: "active",
      grace_ends_at: null,
      trial_canceled_before_charge: false,
      billing_event_created: 500,
    });
    setTestDb(db as never);

    // Same-second out-of-order: active arrives first at T=1000, stale incomplete at T=1000 must NOT overwrite active
    await applyEvent(ev("evt_paid_same_sec", "invoice.paid", 1000, { id: "in_ok", subscription: "sub_2" }), {
      now: NOW,
      fetchSubscription: async () => stripeSub({ id: "sub_2", status: "active" }),
    });
    await applyEvent(ev("evt_inc_same_sec", "customer.subscription.created", 1000, { id: "sub_2" }), {
      now: NOW,
      fetchSubscription: async () => stripeSub({ id: "sub_2", status: "incomplete" }),
    });
    expect(db.accounts.get("acct_1")).toMatchObject({
      plan: "multi",
      stripe_subscription_id: "sub_2",
      subscription_status: "active",
      billing_event_created: 1000,
    });

    // Superseded sub_1 expiring late must NOT overwrite active sub_2
    await applyEvent(ev("evt_old_sub_exp", "customer.subscription.updated", 2000, { id: "sub_1" }), {
      now: NOW,
      fetchSubscription: async () => stripeSub({ id: "sub_1", status: "incomplete_expired" }),
    });
    expect(db.accounts.get("acct_1")).toMatchObject({
      plan: "multi",
      stripe_subscription_id: "sub_2",
      subscription_status: "active",
    });

    // Paused + duplicate customer.subscription.updated (paused) + invoice.payment_failed (paused)
    await applyEvent(ev("evt_paused_1", "customer.subscription.paused", 3000, { id: "sub_2" }), {
      now: NOW,
      fetchSubscription: async () => stripeSub({ id: "sub_2", status: "paused" }),
    });
    await applyEvent(ev("evt_paused_2", "customer.subscription.updated", 3000, { id: "sub_2" }), {
      now: NOW,
      fetchSubscription: async () => stripeSub({ id: "sub_2", status: "paused" }),
    });
    await applyEvent(ev("evt_paused_fail", "invoice.payment_failed", 3005, { id: "in_old", subscription: "sub_2" }), {
      now: NOW,
      fetchSubscription: async () => stripeSub({ id: "sub_2", status: "paused" }),
    });
    expect(db.accounts.get("acct_1")).toMatchObject({
      plan: "multi",
      subscription_status: "paused",
      grace_ends_at: null,
    });

    // Duplicate replay of exact event id returns false
    expect(await applyEvent(ev("evt_paused_1", "customer.subscription.paused", 3000, { id: "sub_2" }), {
      now: NOW,
      fetchSubscription: async () => stripeSub({ id: "sub_2", status: "paused" }),
    })).toBe(false);

    // Resumed with past_due invoice -> enters past_due with 7-day grace
    await applyEvent(ev("evt_resumed_past_due", "customer.subscription.resumed", 4000, { id: "sub_2" }), {
      now: NOW,
      fetchSubscription: async () => stripeSub({ id: "sub_2", status: "past_due" }),
    });
    expect(db.accounts.get("acct_1")).toMatchObject({
      plan: "multi",
      subscription_status: "past_due",
      grace_ends_at: new Date(NOW + 7 * 86_400_000).toISOString(),
    });

    // Tenant B untouched throughout
    expect(db.accounts.get("acct_2")).toMatchObject({
      plan: "multi",
      stripe_subscription_id: "sub_tenant_b",
      subscription_status: "active",
      billing_event_created: 500,
    });
  });
});
