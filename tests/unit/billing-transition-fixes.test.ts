import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { setTestDb } from "@/lib/server/supabase";
import { applyEvent, nextTrialCanceledBeforeCharge } from "@/lib/server/stripe";
import {
  commercialEntitlement,
  displayEntitled,
  loadEffectiveEntitlement,
  playerGate,
  toResponse,
  type EntitlementRow,
} from "@/lib/server/entitlements";
import { rejectSubscriptionWrite } from "@/lib/server/subscription-write";
import { billingNotices } from "@/lib/server/billing-notices";

const TRIAL_START = "2026-11-01T08:00:00.000Z";
const TRIAL_END = "2026-11-15T08:00:00.000Z";
const GRACE_END = "2026-11-18T08:00:00.000Z";

const prevEnforce = process.env.BILLING_ENFORCE;

beforeEach(() => {
  process.env.BILLING_ENFORCE = "1";
});

afterEach(() => {
  setTestDb(null);
  if (prevEnforce === undefined) delete process.env.BILLING_ENFORCE;
  else process.env.BILLING_ENFORCE = prevEnforce;
});

function baseRow(overrides: Partial<EntitlementRow> = {}): EntitlementRow {
  return {
    state: "trial",
    plan: "trial",
    screen_limit: 5,
    active_screens: 1,
    total_screens: 1,
    trial_started_at: TRIAL_START,
    trial_ends_at: TRIAL_END,
    playback_ends_at: GRACE_END,
    subscription_status: null,
    current_period_end: null,
    cancel_at_period_end: false,
    grace_ends_at: null,
    playback_allowed: true,
    can_add_screen: true,
    server_time: "2026-11-05T08:00:00.000Z",
    ...overrides,
  };
}

describe("Issue #3: fail-closed entitlement verification & playback continuity", () => {
  it("denies writes with 503 plan_check_unavailable + Retry-After when account_entitlement returns a DB error", async () => {
    setTestDb({
      rpc: async (fn: string) => {
        if (fn === "account_entitlement") return { data: null, error: { message: "connection timeout" } };
        return { data: null, error: null };
      },
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      }),
    } as never);

    const res = await rejectSubscriptionWrite("acct-err", new Request("https://pekkotv.com/api/media", { method: "POST" }));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(503);
    expect(res!.headers.get("Retry-After")).toBe("5");
    expect(await res!.json()).toEqual({
      error: "Couldn't check your plan. Try again.",
      code: "plan_check_unavailable",
    });
  });

  it("denies writes with 503 plan_check_unavailable when the DB client throws (never fails open)", async () => {
    setTestDb({
      rpc: async () => { throw new Error("socket hang up"); },
      from: () => { throw new Error("socket hang up"); },
    } as never);

    const res = await rejectSubscriptionWrite(
      "acct-throw",
      new Request("https://pekkotv.com/api/displays/publish", {
        method: "POST",
        headers: { "accept-language": "es" },
      }),
    );
    expect(res).not.toBeNull();
    expect(res!.status).toBe(503);
    expect(res!.headers.get("Retry-After")).toBe("5");
    expect(await res!.json()).toEqual({
      error: "No se pudo verificar su plan. Intente de nuevo.",
      code: "plan_check_unavailable",
    });
  });

  it("denies writes with 503 plan_check_unavailable (not expired 403) when entitlement row is missing", async () => {
    setTestDb({
      rpc: async (fn: string) => (fn === "account_entitlement" ? { data: [], error: null } : { data: null, error: null }),
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      }),
    } as never);

    const res = await rejectSubscriptionWrite("acct-missing", new Request("https://pekkotv.com/api/playlists", { method: "POST" }));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(503);
    expect(res!.headers.get("Retry-After")).toBe("5");
    const body = await res!.json();
    expect(body.code).toBe("plan_check_unavailable");
    expect(body.code).not.toBe("subscription_inactive");
  });

  it("isolates tenant lookup failures: one account failing never affects another healthy account", async () => {
    setTestDb({
      rpc: async (fn: string, args: { p_account?: string }) => {
        if (fn === "account_entitlement" && args.p_account === "acct-bad") {
          throw new Error("db timeout");
        }
        if (fn === "account_entitlement" && args.p_account === "acct-good") {
          return {
            data: [baseRow({ state: "active", plan: "multi", subscription_status: "active", trial_started_at: null, trial_ends_at: null })],
            error: null,
          };
        }
        return { data: null, error: null };
      },
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      }),
    } as never);

    const bad = await rejectSubscriptionWrite("acct-bad", new Request("https://pekkotv.com/api/media", { method: "POST" }));
    const good = await rejectSubscriptionWrite("acct-good", new Request("https://pekkotv.com/api/media", { method: "POST" }));
    expect(bad?.status).toBe(503);
    expect(good).toBeNull();
  });

  it("preserves already-authorized playback in playerGate and displayEntitled when DB lookup fails or throws", async () => {
    setTestDb({
      rpc: async () => { throw new Error("db unreachable"); },
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => { throw new Error("db unreachable"); } }) }),
      }),
    } as never);
    expect(await playerGate("disp-1")).toBe("ok");
    expect(await displayEntitled("disp-1")).toBe(true);

    setTestDb({
      rpc: async (fn: string) => {
        if (fn === "account_entitlement") return { data: null, error: { message: "rpc error" } };
        return { data: null, error: { message: "rpc error" } };
      },
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { account_id: "acct-1" }, error: null }) }) }),
      }),
    } as never);
    expect(await loadEffectiveEntitlement("acct-1")).toBe("error");
    expect(await playerGate("disp-1")).toBe("ok");
  });
});

describe("Issue #1: failed-payment canceled cap and status consistency", () => {
  it("caps playback at the earlier of grace_ends_at and current_period_end to the millisecond", () => {
    const failedCancel = baseRow({
      state: "active",
      plan: "multi",
      trial_started_at: null,
      trial_ends_at: null,
      subscription_status: "canceled",
      grace_ends_at: "2026-11-08T08:00:00.000Z",
      current_period_end: "2026-11-25T08:00:00.000Z",
    });
    expect(commercialEntitlement({ ...failedCancel, server_time: "2026-11-08T07:59:59.999Z" }, true)).toMatchObject({
      state: "active",
      playback_allowed: true,
      playback_ends_at: "2026-11-08T08:00:00.000Z",
    });
    expect(commercialEntitlement({ ...failedCancel, server_time: "2026-11-08T08:00:00.000Z" }, true)).toMatchObject({
      state: "canceled",
      playback_allowed: false,
      screen_limit: 0,
    });

    // When current_period_end is earlier than grace_ends_at, current_period_end wins.
    const earlierPeriod = {
      ...failedCancel,
      grace_ends_at: "2026-11-25T08:00:00.000Z",
      current_period_end: "2026-11-08T08:00:00.000Z",
    };
    expect(commercialEntitlement({ ...earlierPeriod, server_time: "2026-11-08T07:59:59.999Z" }, true).state).toBe("active");
    expect(commercialEntitlement({ ...earlierPeriod, server_time: "2026-11-08T08:00:00.000Z" }, true).state).toBe("canceled");
  });
});

describe("Issue #4: Option B pre-charge cancellations", () => {
  function memoryStripeDb() {
    const events = new Map<string, Record<string, unknown>>();
    const accounts = new Map<string, Record<string, unknown>>();
    const from = (table: string) => {
      const rows = table === "stripe_events" ? events : accounts;
      const filters: Array<(row: Record<string, unknown>) => boolean> = [];
      let op: "select" | "insert" | "update" = "select";
      let payload: Record<string, unknown> = {};
      const builder = {
        insert(row: Record<string, unknown>) { op = "insert"; payload = row; return builder; },
        update(row: Record<string, unknown>) { op = "update"; payload = row; return builder; },
        select() { return builder; },
        eq(col: string, val: unknown) { filters.push((r) => r[col] === val); return builder; },
        or() { return builder; },
        maybeSingle() { return builder; },
        then(onFulfilled: (v: unknown) => unknown) {
          if (op === "insert") {
            const id = String(payload.id);
            if (rows.has(id)) return Promise.resolve(onFulfilled({ data: null, error: { code: "23505", message: "dup" } }));
            rows.set(id, { ...payload });
            return Promise.resolve(onFulfilled({ data: payload, error: null }));
          }
          const matched = [...rows.entries()].filter(([, r]) => filters.every((f) => f(r)));
          if (op === "update") {
            for (const [id, r] of matched) rows.set(id, { ...r, ...payload });
            return Promise.resolve(onFulfilled({ data: null, error: null }));
          }
          return Promise.resolve(onFulfilled({ data: matched[0]?.[1] ?? null, error: null }));
        },
      };
      return builder;
    };
    return { from, accounts };
  }

  function stripeEvent(id: string, type: string, created: number, obj: object): Stripe.Event {
    return { id, object: "event", type, created, data: { object: obj } } as unknown as Stripe.Event;
  }

  function stripeSub(overrides: Record<string, unknown> = {}): Stripe.Subscription {
    return {
      id: "sub_opt_b",
      object: "subscription",
      customer: "cus_1",
      status: "trialing",
      cancel_at_period_end: false,
      trial_end: Math.floor(Date.parse(TRIAL_END) / 1000),
      current_period_end: Math.floor(Date.parse(TRIAL_END) / 1000),
      metadata: { account_id: "acct_1" },
      items: { data: [{ price: { id: "price_multi" } }] },
      ...overrides,
    } as unknown as Stripe.Subscription;
  }

  it("shows canceling (not billing starts) when Option B has cancel_at_period_end=true during trial", () => {
    const row = baseRow({
      state: "active",
      plan: "multi",
      trial_started_at: null,
      trial_ends_at: null,
      subscription_status: "trialing",
      current_period_end: TRIAL_END,
      cancel_at_period_end: true,
      playback_ends_at: TRIAL_END,
    });
    const r = toResponse("acct_1", row, "https://pekkotv.com", {
      paymentMethod: { brand: "visa", last4: "4242" },
      isOwner: true,
      hasStripeCustomer: true,
    });
    expect(r.status_detail?.kind).toBe("canceling");
    expect(r.billing_starts_at).toBeNull();
  });

  it("marks trial_canceled_before_charge=true on pre-charge cancel and false after any paid cycle", async () => {
    process.env.STRIPE_PRICE_MULTI = "price_multi";
    const db = memoryStripeDb();
    db.accounts.set("acct_1", {
      id: "acct_1",
      plan: "trial",
      subscription_status: null,
      grace_ends_at: null,
      trial_canceled_before_charge: false,
      billing_event_created: null,
    });
    setTestDb(db as never);

    // 1. Checkout Option B (trialing)
    await applyEvent(stripeEvent("evt_1", "customer.subscription.created", 100, { id: "sub_opt_b" }), {
      now: Date.parse("2026-11-03T08:00:00Z"),
      fetchSubscription: async () => stripeSub({ status: "trialing", cancel_at_period_end: false }),
    });
    expect(db.accounts.get("acct_1")?.trial_canceled_before_charge).toBe(false);

    // 2. Schedule cancel at trial end
    await applyEvent(stripeEvent("evt_2", "customer.subscription.updated", 200, { id: "sub_opt_b" }), {
      now: Date.parse("2026-11-05T08:00:00Z"),
      fetchSubscription: async () => stripeSub({ status: "trialing", cancel_at_period_end: true }),
    });
    expect(db.accounts.get("acct_1")?.trial_canceled_before_charge).toBe(false);

    // 3. Trial ends without charge -> customer.subscription.deleted
    await applyEvent(stripeEvent("evt_3", "customer.subscription.deleted", 300, stripeSub({ status: "canceled" })), {
      now: Date.parse(TRIAL_END),
      fetchSubscription: async () => stripeSub({ status: "canceled" }),
    });
    expect(db.accounts.get("acct_1")).toMatchObject({
      subscription_status: "canceled",
      grace_ends_at: null,
      trial_canceled_before_charge: true,
    });

    // 4. Paid conversion then cancel NEVER sets trial_canceled_before_charge
    db.accounts.set("acct_2", {
      id: "acct_2",
      plan: "trial",
      subscription_status: null,
      grace_ends_at: null,
      trial_canceled_before_charge: false,
      billing_event_created: null,
    });
    const paidPeriodEnd = Math.floor(Date.parse("2026-12-15T08:00:00Z") / 1000);
    await applyEvent(stripeEvent("evt_4", "invoice.paid", 400, { id: "in_1", subscription: "sub_paid", amount_paid: 5900 }), {
      now: Date.parse(TRIAL_END),
      fetchSubscription: async () => stripeSub({ id: "sub_paid", status: "active", metadata: { account_id: "acct_2" }, current_period_end: paidPeriodEnd }),
    });
    expect(db.accounts.get("acct_2")).toMatchObject({ subscription_status: "active", trial_canceled_before_charge: false });

    await applyEvent(stripeEvent("evt_5", "customer.subscription.deleted", 500, stripeSub({ id: "sub_paid", status: "canceled", metadata: { account_id: "acct_2" }, current_period_end: paidPeriodEnd })), {
      now: Date.parse("2026-12-15T08:00:00Z"),
      fetchSubscription: async () => stripeSub({ id: "sub_paid", status: "canceled", metadata: { account_id: "acct_2" }, current_period_end: paidPeriodEnd }),
    });
    expect(db.accounts.get("acct_2")).toMatchObject({ subscription_status: "canceled", trial_canceled_before_charge: false });
  });

  it("grants 3-day trial_grace then expired at exact millisecond boundaries for pre-charge cancels", () => {
    const preChargeRow = baseRow({
      state: "trial_grace",
      plan: "multi",
      screen_limit: 5,
      subscription_status: "canceled",
      current_period_end: TRIAL_END,
      cancel_at_period_end: false,
      grace_ends_at: null,
    });

    // Immediate cancel before trial end keeps trial access until TRIAL_END
    const beforeTrialEnd = commercialEntitlement({
      ...preChargeRow,
      state: "trial",
      server_time: new Date(Date.parse(TRIAL_END) - 1).toISOString(),
    }, true);
    expect(beforeTrialEnd).toMatchObject({ state: "trial", playback_allowed: true, can_add_screen: true, screen_limit: 5 });

    // Exact trial end -> enters 3-day trial_grace (playback on, edits/adds off)
    const atTrialEnd = commercialEntitlement({ ...preChargeRow, server_time: TRIAL_END }, true);
    expect(atTrialEnd).toMatchObject({
      state: "trial_grace",
      playback_allowed: true,
      can_add_screen: false,
      screen_limit: 5,
      playback_ends_at: GRACE_END,
    });
    const respGrace = toResponse("acct_1", atTrialEnd, "https://pekkotv.com");
    expect(respGrace.state).toBe("trial_grace");
    expect(respGrace.suspend_at).toBe(GRACE_END);
    expect(respGrace.warning?.kind).toBe("trial_ended");
    expect(respGrace.trial?.ends_at).toBe(TRIAL_END);
    expect(billingNotices(atTrialEnd).map((n) => n.kind)).toContain("trial_ended");

    // 1 ms before grace ends -> still trial_grace
    const beforeGraceEnd = commercialEntitlement({
      ...preChargeRow,
      server_time: new Date(Date.parse(GRACE_END) - 1).toISOString(),
    }, true);
    expect(beforeGraceEnd.state).toBe("trial_grace");
    expect(beforeGraceEnd.playback_allowed).toBe(true);

    // Exact grace end -> expired (not canceled)
    const atGraceEnd = commercialEntitlement({ ...preChargeRow, server_time: GRACE_END }, true);
    expect(atGraceEnd).toMatchObject({
      state: "expired",
      playback_allowed: false,
      can_add_screen: false,
      screen_limit: 0,
      playback_ends_at: null,
    });
    const respExpired = toResponse("acct_1", atGraceEnd, "https://pekkotv.com");
    expect(respExpired.state).toBe("expired");
    expect(respExpired.suspend_at).toBeNull();
    expect(respExpired.trial?.ends_at).toBe(TRIAL_END);
  });

  it("handles nextTrialCanceledBeforeCharge edge cases cleanly", () => {
    const trialEnd = Math.floor(Date.parse(TRIAL_END) / 1000);
    // Out-of-order deleted before created: previousStatus null, subTrialEnd present, periodEnd <= trialEnd -> true
    expect(nextTrialCanceledBeforeCharge({
      status: "canceled", subTrialEnd: trialEnd, periodEnd: trialEnd, graceEndsAt: null,
      previousStatus: null, previousTrialCanceled: false,
    })).toBe(true);
    // Paid cycle past trial_end even if webhook missed active -> false
    expect(nextTrialCanceledBeforeCharge({
      status: "canceled", subTrialEnd: trialEnd, periodEnd: trialEnd + 30 * 86400, graceEndsAt: null,
      previousStatus: "trialing", previousTrialCanceled: false,
    })).toBe(false);
    // Canceled after past_due -> false
    expect(nextTrialCanceledBeforeCharge({
      status: "canceled", subTrialEnd: trialEnd, periodEnd: trialEnd, graceEndsAt: GRACE_END,
      previousStatus: "past_due", previousTrialCanceled: false,
    })).toBe(false);
    // Duplicate deleted preserves true
    expect(nextTrialCanceledBeforeCharge({
      status: "canceled", subTrialEnd: trialEnd, periodEnd: trialEnd, graceEndsAt: null,
      previousStatus: "canceled", previousTrialCanceled: true,
    })).toBe(true);
  });
});
