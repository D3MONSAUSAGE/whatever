import { describe, expect, it } from "vitest";
import { billingNotices, RECEIPT_CHANNEL, sendBillingNotices } from "@/lib/server/billing-notices";
import type { EntitlementRow } from "@/lib/server/entitlements";

const base: EntitlementRow = {
  state: "trial", plan: "trial", screen_limit: 5, active_screens: 1, total_screens: 1,
  trial_started_at: "2026-11-01T08:00:00Z", trial_ends_at: "2026-11-15T08:00:00Z", playback_ends_at: "2026-11-18T08:00:00Z",
  subscription_status: null, current_period_end: null, cancel_at_period_end: false, grace_ends_at: null,
  playback_allowed: true, can_add_screen: true, server_time: "2026-11-01T08:00:00Z",
};

describe("billing notices", () => {
  it("emails the trial ending only at 3 days, and not a receipt", () => {
    expect(billingNotices({ ...base, server_time: "2026-11-12T08:00:00Z" }).map((n) => n.kind)).toEqual(["trial_ending"]);
    expect(billingNotices({ ...base, server_time: "2026-11-11T08:00:00Z" })).toEqual([]);
    expect(billingNotices(base).some((n) => n.subject.toLowerCase().includes("receipt"))).toBe(false);
    expect(RECEIPT_CHANNEL).toBe("stripe");
  });
  it("includes the grace end date when a payment fails, and the canceled and trial-ended copy", () => {
    const failed = billingNotices({ ...base, state: "past_due", plan: "business", grace_ends_at: "2026-12-01T00:00:00.000Z" });
    expect(failed[0].kind).toBe("payment_failed");
    expect(failed[0].text).toContain("Dec 1, 2026 (UTC)");
    expect(failed[0].text).toMatch(/not deleted/i);
    expect(billingNotices({ ...base, state: "canceled", plan: "starter" })[0].kind).toBe("subscription_canceled");
    expect(billingNotices({ ...base, state: "expired" })[0].kind).toBe("trial_ended");
  });
  it("does not send email unless the provider flag is configured", async () => {
    const notices = billingNotices({ ...base, server_time: "2026-11-12T08:00:00Z" });
    expect(await sendBillingNotices("owner@example.com", notices, {})).toEqual({ sent: false, reason: "email_disabled" });
  });
});
