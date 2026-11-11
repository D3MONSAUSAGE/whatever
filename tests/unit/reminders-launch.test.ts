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

import { formatWhen, remainingPhrase, reminderZone } from "@/lib/server/billing-notices";

describe("reminder wording reflects the real remaining time and a labeled zone", () => {
  const trial = (ends: string, now: string): EntitlementRow => ({ ...base, trial_started_at: "2026-11-11T16:52:16.000Z", trial_ends_at: ends, playback_ends_at: ends, server_time: now });
  it("never says '1 day' on the expiry morning", () => {
    // vanessayt98 case: 7:00 AM PST run, trial ends 8:52 AM PST the same day.
    const [n] = billingNotices(trial("2026-11-25T16:52:16.000Z", "2026-11-25T15:00:00.000Z"));
    expect(n.kind).toBe("trial_ending_1");
    expect(n.subject).toBe("Your Pekko trial ends in 1 hour");
    expect(n.text).toContain("Nov 25, 2026 at 8:52 AM PST");
    const [h] = billingNotices(trial("2026-11-23T03:07:51.000Z", "2026-11-22T15:00:00.000Z"));
    expect(h.subject).toBe("Your Pekko trial ends in 12 hours");
    expect(h.text).toContain("Nov 22, 2026 at 7:07 PM PST");
  });
  it("the first notice says 2 days when less than 3 days remain", () => {
    const [n] = billingNotices(trial("2026-11-25T16:52:16.000Z", "2026-11-23T15:00:00.000Z"));
    expect(n.kind).toBe("trial_ending_3");
    expect(n.subject).toBe("Your Pekko trial ends in 2 days");
  });
  it("rounds down and handles the boundaries", () => {
    const now = "2026-11-20T00:00:00.000Z";
    expect(remainingPhrase("2026-11-23T00:00:00.000Z", now)).toBe("in 3 days");
    expect(remainingPhrase("2026-11-22T23:59:00.000Z", now)).toBe("in 2 days");
    expect(remainingPhrase("2026-11-21T00:00:00.000Z", now)).toBe("in 1 day");
    expect(remainingPhrase("2026-11-20T23:59:00.000Z", now)).toBe("in 23 hours");
    expect(remainingPhrase("2026-11-20T00:30:00.000Z", now)).toBe("in less than an hour");
  });
  it("uses the location timezone when set, else Pacific time, always labeled", () => {
    expect(reminderZone(null)).toBe("America/Los_Angeles");
    expect(reminderZone("UTC")).toBe("America/Los_Angeles");
    expect(reminderZone("Not/AZone")).toBe("America/Los_Angeles");
    expect(reminderZone("America/New_York")).toBe("America/New_York");
    expect(formatWhen("2026-11-23T03:07:51.000Z", null)).toBe("Nov 22, 2026 at 7:07 PM PST");
    expect(formatWhen("2026-11-23T03:07:51.000Z", "America/New_York")).toBe("Nov 22, 2026 at 10:07 PM EST");
  });
  it("keeps the same send days and keys (no skipped or doubled reminder)", () => {
    const ends = "2026-11-25T16:52:16.000Z";
    const kinds: string[] = [];
    for (let d = 11; d <= 26; d++) for (const n of billingNotices(trial(ends, `2026-11-${d}T15:00:00.000Z`))) kinds.push(`${d}:${n.kind}:${n.deadline}`);
    expect(kinds).toEqual([`23:trial_ending_3:${ends}`, `25:trial_ending_1:${ends}`]);
  });
});
