import { afterEach, describe, expect, it } from "vitest";
import { billingNoticeKey, billingNotices } from "@/lib/server/billing-notices";
import { planOrgReminders, type ReminderAccount } from "@/lib/server/billing-dispatch";
import { commercialEntitlement, type EntitlementRow } from "@/lib/server/entitlements";
import { readFileSync } from "node:fs";

const base: EntitlementRow = {
  state: "trial", plan: "trial", screen_limit: 5, active_screens: 1, total_screens: 1,
  trial_started_at: "2026-11-01T08:00:00.000Z", trial_ends_at: "2026-11-15T08:00:00.000Z", playback_ends_at: "2026-11-18T08:00:00.000Z",
  subscription_status: null, current_period_end: null, cancel_at_period_end: false, grace_ends_at: null,
  playback_allowed: true, can_add_screen: true, server_time: "2026-11-01T08:00:00.000Z",
};
const prev = process.env.BILLING_ENFORCE;
afterEach(() => { if (prev === undefined) delete process.env.BILLING_ENFORCE; else process.env.BILLING_ENFORCE = prev; });

describe("billing reminders at commercial launch", () => {
  it("uses the effective (enforced) entitlement for the dispatcher", () => {
    const src = readFileSync("lib/server/billing-dispatch.ts", "utf8");
    expect(src).toMatch(/loadEffectiveEntitlement\(String\(account\.id\)\)/);
    expect(src).not.toMatch(/await loadEntitlement\(/);
  });
  it("an ended trial under enforcement says screens are paused, never 'keep playing'", () => {
    const sqlRow = { ...base, state: "trial_grace" as const, server_time: "2026-11-16T08:00:00.000Z" };
    const e = commercialEntitlement(sqlRow, true);
    const [n] = billingNotices(e);
    expect(n.kind).toBe("trial_ended");
    expect(n.text).toMatch(/paused/);
    expect(n.text).not.toMatch(/keep playing/);
    expect(n.deadline).toBe("2026-11-15T08:00:00.000Z");
  });
  it("keys are stable across runs when no date is stored (no duplicate emails)", () => {
    const row = { ...base, state: "canceled" as const, plan: "starter" as const, trial_ends_at: null, playback_ends_at: null };
    const a = billingNotices({ ...row, server_time: "2026-12-01T15:00:00.000Z" })[0];
    const b = billingNotices({ ...row, server_time: "2026-12-02T15:00:00.000Z" })[0];
    expect(billingNoticeKey("x", a)).toBe(billingNoticeKey("x", b));
    const t1 = billingNotices({ ...base, state: "expired", trial_ends_at: null, playback_ends_at: null, server_time: "2026-12-01T15:00:00.000Z" })[0];
    const t2 = billingNotices({ ...base, state: "expired", trial_ends_at: null, playback_ends_at: null, server_time: "2026-12-02T15:00:00.000Z" })[0];
    expect(billingNoticeKey("x", t1)).toBe(billingNoticeKey("x", t2));
  });
  it("the paused-subscription copy does not claim a cancellation", () => {
    const [n] = billingNotices({ ...base, state: "canceled", plan: "business", current_period_end: "2027-01-11T00:00:00.000Z" });
    expect(n.kind).toBe("subscription_canceled");
    expect(n.subject).not.toMatch(/canceled/i);
    expect(n.text).toMatch(/not active/);
  });
  it("no payment reminder for an active paid plan set to cancel at period end", () => {
    const e = commercialEntitlement({ ...base, state: "active", plan: "multi", subscription_status: "active", cancel_at_period_end: true, current_period_end: "2026-12-11T15:27:47.000Z", trial_started_at: null, trial_ends_at: null, playback_ends_at: null, server_time: "2026-11-12T15:00:00.000Z" }, true);
    expect(billingNotices(e)).toEqual([]);
  });
  it("no existing-customer 'full access' notice once billing is enforced", () => {
    const acct: ReminderAccount = { id: "g", email: "o@example.com", plan: "grandfathered", state: "expired", trial_started_at: null, trial_ends_at: null, playback_ends_at: null, grace_ends_at: null, subscription_status: null, current_period_end: null, transition_started_at: null };
    process.env.BILLING_ENFORCE = "1";
    expect(planOrgReminders(acct, "2026-11-12T15:00:00.000Z").map((p) => p.kind)).not.toContain("transition_14");
    delete process.env.BILLING_ENFORCE;
    expect(planOrgReminders({ ...acct, state: "grandfathered" }, "2026-11-12T15:00:00.000Z").map((p) => p.kind)).toContain("transition_14");
  });
});
