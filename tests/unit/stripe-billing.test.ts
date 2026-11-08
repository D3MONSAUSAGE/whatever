import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { setTestDb } from "@/lib/server/supabase";
import { applyEvent, GRACE_DAYS } from "@/lib/server/stripe";

type Row = Record<string, unknown>;

function memoryDb() {
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
      or(expr: string) {
        filters.push((row) => matchFilter(row, expr));
        return builder;
      },
      maybeSingle() { return builder; },
      then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
        try {
          return Promise.resolve(onFulfilled(run()));
        } catch (err) {
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
  return {
    from,
    accounts,
    seed(row: Row) { accounts.set(String(row.id), { ...row }); },
  };
}

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

/** Same predicates the billing update sends to PostgREST. */
function matchFilter(row: Row, expr: string): boolean {
  const trimmed = expr.trim();
  if (trimmed.startsWith("and(") && trimmed.endsWith(")")) return splitTop(trimmed.slice(4, -1)).every((part) => matchFilter(row, part));
  if (trimmed.startsWith("or(") && trimmed.endsWith(")")) return splitTop(trimmed.slice(3, -1)).some((part) => matchFilter(row, part));
  const notIn = trimmed.match(/^([a-z_]+)\.not\.in\.\(([^)]*)\)$/);
  if (notIn) {
    const value = row[notIn[1]];
    return value != null && !notIn[2].split(",").includes(String(value));
  }
  const parts = splitTop(trimmed);
  if (parts.length > 1) return parts.some((part) => matchFilter(row, part));
  const [col, cmp, value] = trimmed.split(".");
  if (cmp === "is") return row[col] == null;
  if (cmp === "lt") return Number(row[col]) < Number(value);
  if (cmp === "eq") return row[col] == value;
  return false;
}

const db = memoryDb();
const NOW = Date.parse("2026-11-07T00:00:00Z");

beforeEach(() => {
  process.env.STRIPE_PRICE_BUSINESS = "price_biz";
});

function sub(overrides: Record<string, unknown> = {}): Stripe.Subscription {
  return {
    id: "sub_1",
    customer: "cus_1",
    status: "active",
    cancel_at_period_end: false,
    current_period_end: Math.floor(NOW / 1000) + 30 * 86400,
    trial_end: null,
    metadata: { account_id: "acct_1" },
    items: { data: [{ price: { id: "price_biz" }, current_period_end: Math.floor(NOW / 1000) + 30 * 86400 }] },
    ...overrides,
  } as unknown as Stripe.Subscription;
}

function event(type: string, created: number, object: unknown, id = `evt_${type}_${created}`): Stripe.Event {
  return { id, type, created, livemode: false, data: { object } } as Stripe.Event;
}

afterEach(() => setTestDb(null));

describe("stripe billing events", () => {
  it("invoice.paid renews the period and clears grace", async () => {
    setTestDb(db as never);
    db.seed({ id: "acct_1", subscription_status: "past_due", grace_ends_at: "2026-11-01T00:00:00.000Z", billing_event_created: 1 });
    const live = sub({ status: "active", current_period_end: Math.floor(NOW / 1000) + 60 * 86400 });
    const ev = event("invoice.paid", 20, { id: "in_1", subscription: "sub_1" });
    expect(await applyEvent(ev, { now: NOW, fetchSubscription: async () => live })).toBe(true);
    expect(db.accounts.get("acct_1")).toMatchObject({
      plan: "business",
      subscription_status: "active",
      grace_ends_at: null,
      current_period_end: new Date((Math.floor(NOW / 1000) + 60 * 86400) * 1000).toISOString(),
      billing_event_created: 20,
    });
  });

  it("invoice.payment_failed sets past_due and does not extend grace on a repeat", async () => {
    setTestDb(db as never);
    db.seed({ id: "acct_1", subscription_status: "active", grace_ends_at: null, billing_event_created: 1 });
    const live = sub({ status: "past_due" });
    const first = event("invoice.payment_failed", 10, { id: "in_fail", subscription: "sub_1" }, "evt_fail_1");
    const second = event("invoice.payment_failed", 11, { id: "in_fail_2", subscription: "sub_1" }, "evt_fail_2");
    await applyEvent(first, { now: NOW, fetchSubscription: async () => live });
    const grace = db.accounts.get("acct_1")?.grace_ends_at;
    expect(grace).toBe(new Date(NOW + GRACE_DAYS * 86_400_000).toISOString());
    await applyEvent(second, { now: NOW + 3 * 86_400_000, fetchSubscription: async () => live });
    expect(db.accounts.get("acct_1")?.grace_ends_at).toBe(grace);
    expect(db.accounts.get("acct_1")?.subscription_status).toBe("past_due");
  });

  it("ignores an older event after a newer one has been applied", async () => {
    setTestDb(db as never);
    db.seed({ id: "acct_1", billing_event_created: null });
    const paid = sub({ status: "active" });
    const failed = sub({ status: "past_due" });
    await applyEvent(event("invoice.paid", 50, { subscription: "sub_1" }, "evt_paid"), {
      now: NOW,
      fetchSubscription: async () => paid,
    });
    await applyEvent(event("invoice.payment_failed", 40, { subscription: "sub_1" }, "evt_old_fail"), {
      now: NOW,
      fetchSubscription: async () => failed,
    });
    expect(db.accounts.get("acct_1")).toMatchObject({ subscription_status: "active", grace_ends_at: null, billing_event_created: 50 });
  });

  it("lets a newer event win when an older one is still in flight", async () => {
    setTestDb(db as never);
    db.seed({ id: "acct_1", billing_event_created: null });
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const older = applyEvent(event("invoice.payment_failed", 10, { subscription: "sub_1" }, "evt_slow_fail"), {
      now: NOW,
      fetchSubscription: async () => { await gate; return sub({ status: "past_due" }); },
    });
    const newer = applyEvent(event("invoice.paid", 20, { subscription: "sub_1" }, "evt_fast_paid"), {
      now: NOW,
      fetchSubscription: async () => sub({ status: "active" }),
    });
    await newer;
    release();
    await older;
    expect(db.accounts.get("acct_1")).toMatchObject({ subscription_status: "active", grace_ends_at: null, billing_event_created: 20 });
  });

  it("keeps a scheduled cancellation active until the period ends", async () => {
    setTestDb(db as never);
    db.seed({ id: "acct_1", billing_event_created: null });
    const periodEnd = Math.floor(NOW / 1000) + 10 * 86400;
    await applyEvent(event("customer.subscription.updated", 5, { id: "sub_1" }, "evt_cancel_sched"), {
      now: NOW,
      fetchSubscription: async () => sub({ status: "active", cancel_at_period_end: true, current_period_end: periodEnd }),
    });
    expect(db.accounts.get("acct_1")).toMatchObject({
      subscription_status: "active",
      cancel_at_period_end: true,
      current_period_end: new Date(periodEnd * 1000).toISOString(),
      grace_ends_at: null,
    });
  });

  it("records cancellation at period end from the deleted subscription", async () => {
    setTestDb(db as never);
    db.seed({ id: "acct_1", billing_event_created: 1, subscription_status: "active", cancel_at_period_end: true });
    const periodEnd = Math.floor(NOW / 1000) + 10 * 86400;
    const ended = sub({ status: "canceled", cancel_at_period_end: false, current_period_end: periodEnd });
    await applyEvent(event("customer.subscription.deleted", 8, ended, "evt_deleted"), {
      now: NOW,
      fetchSubscription: async () => { throw new Error("no such subscription"); },
    });
    expect(db.accounts.get("acct_1")).toMatchObject({
      subscription_status: "canceled",
      current_period_end: new Date(periodEnd * 1000).toISOString(),
    });
  });

  it("keeps a trial in force until trial_end", async () => {
    setTestDb(db as never);
    db.seed({ id: "acct_1", plan: "trial", billing_event_created: null });
    const trialEnd = Math.floor(NOW / 1000) + 14 * 86400;
    await applyEvent(event("customer.subscription.updated", 3, { id: "sub_1" }, "evt_trial"), {
      now: NOW,
      fetchSubscription: async () => sub({ status: "trialing", trial_end: trialEnd, current_period_end: trialEnd }),
    });
    expect(db.accounts.get("acct_1")).toMatchObject({
      subscription_status: "trialing",
      current_period_end: new Date(trialEnd * 1000).toISOString(),
      grace_ends_at: null,
    });
    await applyEvent(event("invoice.payment_failed", 4, { subscription: "sub_1" }, "evt_trial_fail"), {
      now: NOW,
      fetchSubscription: async () => sub({ status: "trialing", trial_end: trialEnd }),
    });
    expect(db.accounts.get("acct_1")?.subscription_status).toBe("trialing");
    const after = Math.floor(NOW / 1000) + 15 * 86400;
    await applyEvent(event("customer.subscription.deleted", 9, { id: "sub_1" }, "evt_trial_over"), {
      now: after * 1000,
      fetchSubscription: async () => sub({ status: "canceled", trial_end: trialEnd, current_period_end: trialEnd }),
    });
    expect(db.accounts.get("acct_1")?.subscription_status).toBe("canceled");
  });

  it("lets subscription.deleted win when it shares a second with trial_will_end", async () => {
    setTestDb(db as never);
    const created = 1_700_000_000;
    const trialEnd = created + 3 * 86400;
    const trialing = async () => sub({ status: "trialing", trial_end: trialEnd, current_period_end: trialEnd });
    const canceled = sub({ status: "canceled", trial_end: trialEnd, current_period_end: trialEnd });

    db.seed({ id: "acct_1", plan: "trial", subscription_status: "trialing", billing_event_created: null });
    expect(await applyEvent(event("customer.subscription.trial_will_end", created, { id: "sub_1" }, "evt_will_end_first"), {
      now: NOW,
      fetchSubscription: trialing,
    })).toBe(true);
    expect(db.accounts.get("acct_1")?.subscription_status).toBe("trialing");
    expect(await applyEvent(event("customer.subscription.deleted", created, canceled, "evt_deleted_same_second"), {
      now: NOW,
      fetchSubscription: async () => { throw new Error("no such subscription"); },
    })).toBe(true);
    expect(db.accounts.get("acct_1")?.subscription_status).toBe("canceled");
    expect(await applyEvent(event("customer.subscription.deleted", created, canceled, "evt_deleted_same_second"), {
      now: NOW,
      fetchSubscription: async () => { throw new Error("no such subscription"); },
    })).toBe(false);

    db.seed({ id: "acct_1", plan: "trial", subscription_status: "trialing", billing_event_created: null });
    expect(await applyEvent(event("customer.subscription.deleted", created, canceled, "evt_deleted_first"), {
      now: NOW,
      fetchSubscription: async () => { throw new Error("no such subscription"); },
    })).toBe(true);
    expect(await applyEvent(event("customer.subscription.trial_will_end", created, { id: "sub_1" }, "evt_will_end_after"), {
      now: NOW,
      fetchSubscription: trialing,
    })).toBe(true);
    expect(db.accounts.get("acct_1")).toMatchObject({ subscription_status: "canceled", billing_event_created: created });
  });

  it("uses the item period end when basil omits it on the subscription", async () => {
    setTestDb(db as never);
    db.seed({ id: "acct_1", billing_event_created: null });
    const itemEnd = Math.floor(NOW / 1000) + 40 * 86400;
    const live = sub({
      current_period_end: undefined,
      items: { data: [{ price: { id: "price_biz" }, current_period_end: itemEnd }] },
    });
    await applyEvent(event("customer.subscription.updated", 60, { id: "sub_1" }, "evt_basil_period"), {
      now: NOW,
      fetchSubscription: async () => live,
    });
    expect(db.accounts.get("acct_1")?.current_period_end).toBe(new Date(itemEnd * 1000).toISOString());
  });

  it("re-fetches a basil invoice that names the subscription on parent", async () => {
    setTestDb(db as never);
    db.seed({ id: "acct_1", billing_event_created: null, subscription_status: "active", grace_ends_at: "2026-11-01T00:00:00.000Z" });
    const itemEnd = Math.floor(NOW / 1000) + 45 * 86400;
    const live = sub({
      status: "active",
      current_period_end: undefined,
      items: { data: [{ price: { id: "price_biz" }, current_period_end: itemEnd }] },
    });
    const invoice = { id: "in_basil", parent: { subscription_details: { subscription: "sub_1" } } };
    expect(await applyEvent(event("invoice.paid", 70, invoice, "evt_basil_paid"), {
      now: NOW,
      fetchSubscription: async () => live,
    })).toBe(true);
    expect(db.accounts.get("acct_1")).toMatchObject({
      plan: "business",
      subscription_status: "active",
      grace_ends_at: null,
      current_period_end: new Date(itemEnd * 1000).toISOString(),
    });
  });
});
