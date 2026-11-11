import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { billingNoticeKey, billingNotices, deliverBillingNotices, RECEIPT_CHANNEL, sendBillingNotices } from "@/lib/server/billing-notices";
import { paymentGraceEndsAt, PAYMENT_GRACE_DAYS, transitionEndsAt, transitionStamp, TRIAL_DAYS, trialEndsAt, TRANSITION_DAYS } from "@/lib/server/entitlements";
import type { EntitlementRow } from "@/lib/server/entitlements";
import { BILLING_EMAIL_FROM, memoryNoticeLedger, transactionalEmailReady } from "@/lib/server/transactional-email";
import { GRACE_DAYS } from "@/lib/server/stripe";

const base: EntitlementRow = {
  state: "trial", plan: "trial", screen_limit: 5, active_screens: 1, total_screens: 1,
  trial_started_at: "2026-11-01T08:00:00.000Z", trial_ends_at: "2026-11-15T08:00:00.000Z", playback_ends_at: "2026-11-18T08:00:00.000Z",
  subscription_status: null, current_period_end: null, cancel_at_period_end: false, grace_ends_at: null,
  playback_allowed: true, can_add_screen: true, server_time: "2026-11-01T08:00:00.000Z",
};

describe("billing durations", () => {
  const created = "2026-11-01T00:00:00.000Z";
  it("uses server timestamps for the trial, the payment grace, and the transition", () => {
    expect(TRIAL_DAYS).toBe(14);
    expect(trialEndsAt(created)).toBe("2026-11-15T00:00:00.000Z");
    expect(PAYMENT_GRACE_DAYS).toBe(7);
    expect(GRACE_DAYS).toBe(7);
    expect(paymentGraceEndsAt(created)).toBe("2026-11-08T00:00:00.000Z");
    expect(paymentGraceEndsAt(created)).toBe(paymentGraceEndsAt(created));
    expect(TRANSITION_DAYS).toBe(14);
  });
  it("starts the existing-customer window only when enforcement is on, and never resets it", () => {
    const now = "2026-11-08T12:00:00.000Z";
    const later = "2026-12-01T00:00:00.000Z";
    expect(transitionStamp(null, now, false)).toBeNull();
    const started = transitionStamp(null, now, true);
    expect(started).toBe(now);
    expect(transitionStamp(started, later, true)).toBe(now);
    expect(transitionStamp(started, later, false)).toBe(now);
    expect(transitionEndsAt(started)).toBe("2026-11-22T12:00:00.000Z");
    expect(transitionEndsAt(null)).toBeNull();
  });
  it("does not start the clock in the migration", () => {
    const sql = readFileSync("supabase/migrations/0021_billing_transition.sql", "utf8");
    expect(sql).toMatch(/billing_transition_started_at timestamptz;/);
    expect(sql).not.toMatch(/billing_transition_started_at timestamptz\s+default/i);
    expect(sql).not.toMatch(/\bupdate\s+public\.accounts\b/i);
    expect(sql).not.toMatch(/account_entitlement|delete from/i);
    const rollback = readFileSync("supabase/rollback/0021_billing_transition.sql", "utf8");
    expect(rollback).toMatch(/billing_transition_started_at/);
    expect(rollback).not.toMatch(/delete from public\.accounts/i);
  });
});

describe("billing notices", () => {
  it("names the trial end date at 3 days and at 1 day, and not a receipt", () => {
    const three = billingNotices({ ...base, server_time: "2026-11-12T08:00:00.000Z" });
    expect(three.map((n) => n.kind)).toEqual(["trial_ending_3"]);
    expect(three[0].text).toContain("Nov 15, 2026 at 12:00 AM PST");
    expect(three[0].subject).toBe("Your Pekko trial ends in 3 days");
    const one = billingNotices({ ...base, server_time: "2026-11-14T08:00:00.000Z" });
    expect(one.map((n) => n.kind)).toEqual(["trial_ending_1"]);
    expect(one[0].text).toContain("Nov 15, 2026 at 12:00 AM PST");
    expect(one[0].subject).toBe("Your Pekko trial ends in 1 day");
    expect(billingNotices({ ...base, server_time: "2026-11-11T08:00:00.000Z" })).toEqual([]);
    expect(RECEIPT_CHANNEL).toBe("stripe");
  });
  it("includes the grace end date for a failed payment and for the 2-day and 1-day reminders", () => {
    const failed = billingNotices({
      ...base, state: "past_due", plan: "business", grace_ends_at: "2026-12-01T00:00:00.000Z", server_time: "2026-11-20T00:00:00.000Z",
    });
    expect(failed.map((n) => n.kind)).toEqual(["payment_failed"]);
    expect(failed[0].text).toContain("Nov 30, 2026 at 4:00 PM PST");
    expect(failed[0].text).toMatch(/not deleted/i);
    const two = billingNotices({
      ...base, state: "past_due", plan: "business", grace_ends_at: "2026-12-01T00:00:00.000Z", server_time: "2026-11-29T00:00:00.000Z",
    });
    expect(two.map((n) => n.kind)).toEqual(["payment_failed", "grace_ending_2"]);
    expect(two[1].text).toContain("Nov 30, 2026 at 4:00 PM PST");
    expect(two[1].subject).toBe("Your Pekko payment grace ends in 2 days");
    const one = billingNotices({
      ...base, state: "past_due", plan: "business", grace_ends_at: "2026-12-01T00:00:00.000Z", server_time: "2026-11-30T00:00:00.000Z",
    });
    expect(one.map((n) => n.kind)).toContain("grace_ending_1");
    expect(billingNotices({ ...base, state: "canceled", plan: "starter" })[0].kind).toBe("subscription_canceled");
    expect(billingNotices({ ...base, state: "expired" })[0].kind).toBe("trial_ended");
  });
  it("sends the 14-day existing-customer notice only while enforcement is on", () => {
    const row: EntitlementRow = { ...base, state: "grandfathered", plan: "grandfathered", server_time: "2026-11-08T12:00:00.000Z" };
    const ends = "2026-11-22T12:00:00.000Z";
    expect(billingNotices(row, { enforced: false, transitionEndsAt: ends })).toEqual([]);
    const live = billingNotices(row, { enforced: true, transitionEndsAt: ends });
    expect(live.map((n) => n.kind)).toEqual(["transition_14"]);
    expect(live[0].text).toContain("Nov 22, 2026 at 4:00 AM PST");
    expect(live[0].text).toMatch(/full access/i);
  });
  it("does not send email unless the provider flag is configured", async () => {
    const notices = billingNotices({ ...base, server_time: "2026-11-12T08:00:00.000Z" });
    const lines: string[] = [];
    expect(await sendBillingNotices("owner@example.com", notices, {})).toEqual({ sent: false, reason: "email_disabled" });
    const delivered = await deliverBillingNotices({
      accountId: "acct_1", to: "owner@example.com", notices, env: {}, log: (line) => lines.push(line),
      ledger: memoryNoticeLedger(),
    });
    expect(delivered.every((row) => row.reason === "noop")).toBe(true);
    expect(lines.join("\n")).toMatch(/noop/);
    expect(lines.join("\n")).not.toMatch(/re_|sk_|whsec_/);
  });
  it("sends each reminder once", async () => {
    const notices = billingNotices({ ...base, server_time: "2026-11-12T08:00:00.000Z" });
    const ledger = memoryNoticeLedger();
    const env = { EMAIL_PROVIDER: "resend", RESEND_API_KEY: "test-key", ALERT_EMAIL_FROM: BILLING_EMAIL_FROM };
    expect(transactionalEmailReady(env)).toBe(true);
    expect(BILLING_EMAIL_FROM).toBe("Pekko <billing@pekkotv.com>");
    let calls = 0;
    const original = globalThis.fetch;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    try {
      const first = await deliverBillingNotices({ accountId: "8a1b9c0d-1111-4222-8333-444455556666", to: "owner@example.com", notices, env, ledger });
      const second = await deliverBillingNotices({ accountId: "8a1b9c0d-1111-4222-8333-444455556666", to: "owner@example.com", notices, env, ledger });
      expect(first.map((row) => row.reason)).toEqual(["sent"]);
      expect(second.map((row) => row.reason)).toEqual(["duplicate"]);
      expect(calls).toBe(1);
      expect(billingNoticeKey("8a1b9c0d-1111-4222-8333-444455556666", notices[0])).toContain("trial_ending_3");
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe("tax note", () => {
  it("names the merchant and requires the live Managed Payments opt-out", () => {
    const text = readFileSync("docs/billing-tax.md", "utf8");
    expect(text).toMatch(/Francisco Lopez, a sole proprietor doing business as Pekko/);
    expect(text).toMatch(/merchant of record/i);
    expect(text).toMatch(/responsible for sales tax/i);
    expect(text).toMatch(/Stripe Tax is not enabled/);
    expect(text).toContain("STRIPE_MANAGED_PAYMENTS");
    expect(text).toContain("exactly `0`");
    expect(text).toMatch(/standard Stripe Billing/i);
    expect(text).not.toMatch(/Teamtegrate|Pekko LLC|Pekko Technologies/);
  });
});
