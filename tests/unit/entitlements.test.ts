import { describe, expect, it } from "vitest";
import { PRODUCT_NAME } from "@/components/brand";
import {
  billingEnforced, daysLeft, downgradeNeedsScreenSelection, ENTITLEMENT_STATES, rolloutNotice, statusDetailFor, SUSPENDED_PAYLOAD, toResponse, warningFor, type EntitlementRow,
} from "@/lib/server/entitlements";

const base: EntitlementRow = {
  state: "trial", plan: "trial", screen_limit: 5, active_screens: 1, total_screens: 1,
  trial_started_at: "2026-11-01T08:00:00Z", trial_ends_at: "2026-11-15T08:00:00Z", playback_ends_at: "2026-11-18T08:00:00Z",
  subscription_status: null, current_period_end: null, cancel_at_period_end: false, grace_ends_at: null,
  playback_allowed: true, can_add_screen: true, server_time: "2026-11-01T08:00:00Z",
};

describe("daysLeft", () => {
  const end = "2026-11-15T08:00:00Z";
  it("is 14 at trial start", () => expect(daysLeft(end, "2026-11-01T08:00:00Z")).toBe(14));
  it("rounds partial days up", () => expect(daysLeft(end, "2026-11-01T08:00:00.001Z")).toBe(14));
  it("is 1 during the final 24 hours", () => {
    expect(daysLeft(end, "2026-11-14T08:00:00Z")).toBe(1);
    expect(daysLeft(end, "2026-11-15T07:59:59.999Z")).toBe(1);
  });
  it("is 0 at and after the end instant", () => {
    expect(daysLeft(end, end)).toBe(0);
    expect(daysLeft(end, "2026-12-01T00:00:00Z")).toBe(0);
  });
  it("does not depend on the zone the instants are written in", () => {
    // Same instants, written as Pacific and Tokyo local times.
    expect(daysLeft("2026-11-15T00:00:00-08:00", "2026-11-14T17:00:00+09:00")).toBe(daysLeft(end, "2026-11-14T08:00:00Z"));
    // Across the US DST change (Nov 1, 2026): still whole 24 h periods.
    expect(daysLeft("2026-11-08T07:00:00Z", "2026-10-31T07:00:00Z")).toBe(8);
  });
  it("is null without an end", () => expect(daysLeft(null, base.server_time)).toBeNull());
});

describe("warningFor", () => {
  it("has no warning early in a trial", () => expect(warningFor(base)).toBeNull());
  it("warns from 7 days left", () => {
    expect(warningFor({ ...base, server_time: "2026-11-08T08:00:00Z" })).toMatchObject({ kind: "trial_ending", action: "open_plan" });
    expect(warningFor({ ...base, server_time: "2026-11-08T07:59:59Z" })).toBeNull();
  });
  it("covers grace, past due, canceled and expired", () => {
    expect(warningFor({ ...base, state: "trial_grace" })?.kind).toBe("trial_ended");
    expect(warningFor({ ...base, state: "past_due", plan: "starter" })?.kind).toBe("payment_failed");
    expect(warningFor({ ...base, state: "canceled", plan: "starter" })?.kind).toBe("canceled");
    expect(warningFor({ ...base, state: "expired" })?.kind).toBe("expired");
  });
  it("asks to select screens when over the limit", () => {
    expect(warningFor({ ...base, state: "active", plan: "starter", screen_limit: 1, active_screens: 3 }))
      .toMatchObject({ kind: "over_limit", action: "select_screens" });
  });
  it("names dates in UTC, not the server's zone", () => {
    expect(warningFor({ ...base, state: "trial_grace" })?.message).toContain("Nov 18, 2026 (UTC)");
  });
});

describe("toResponse", () => {
  it("matches the mobile contract", () => {
    const r = toResponse("acc", base, "https://example.test/");
    expect(r).toMatchObject({
      account_id: "acc", state: "trial", plan: "trial", plan_name: "Free trial", screen_limit: 5,
      trial: { days_left: 14 }, subscription: null, features_locked: [],
      billing_url: "https://example.test/dashboard/billing", server_time: base.server_time,
    });
    expect(toResponse("acc", { ...base, state: "expired" }, "x").suspend_at).toBeNull();
    expect(toResponse("acc", { ...base, plan: "grandfathered", state: "grandfathered" }, "x").trial).toBeNull();
    expect(toResponse("acc", base, "https://example.test/").rollout_notice).toBeNull();
    expect(toResponse("acc", { ...base, plan: "grandfathered", state: "grandfathered" }, "x").rollout_notice).toMatch(/has not started/);
    expect(toResponse("acc", { ...base, plan: "grandfathered", state: "grandfathered" }, "x", { transitionEndsAt: "2026-11-22T00:00:00.000Z" }).transition_ends_at).toBeNull();
  });
  it("has a closed state list", () => {
    expect(ENTITLEMENT_STATES).toEqual(["trial", "trial_grace", "active", "past_due", "grandfathered", "canceled", "expired"]);
  });
});

describe("enforcement readiness", () => {
  it("keeps enforcement off and never describes deletion", () => {
    expect(billingEnforced({})).toBe(false);
    expect(SUSPENDED_PAYLOAD.message).toMatch(/content is saved/i);
    expect(SUSPENDED_PAYLOAD.message).not.toMatch(/delet/i);
    expect(rolloutNotice({ state: "grandfathered" })).toMatch(/has not started/);
    expect(rolloutNotice({ state: "grandfathered" }, "2026-11-22T00:00:00.000Z", true)).toContain("Nov 22, 2026 (UTC)");
    expect(rolloutNotice({ state: "grandfathered" }, "2026-11-22T00:00:00.000Z", false)).toMatch(/has not started/);
    expect(rolloutNotice({ state: "trial" })).toBeNull();
    expect(PRODUCT_NAME).toBe("Pekko");
    expect(PRODUCT_NAME).not.toMatch(/TECHNOLOGIES|™/);
  });
  it("asks for a screen choice only when the next plan is smaller than the screens on", () => {
    expect(downgradeNeedsScreenSelection(4, 3)).toBe(true);
    expect(downgradeNeedsScreenSelection(3, 3)).toBe(false);
    expect(downgradeNeedsScreenSelection(1, 5)).toBe(false);
  });
});

describe("billingEnforced", () => {
  it("is off unless BILLING_ENFORCE=1", () => {
    expect(billingEnforced({})).toBe(false);
    expect(billingEnforced({ BILLING_ENFORCE: "true" })).toBe(false);
    expect(billingEnforced({ BILLING_ENFORCE: "1" })).toBe(true);
  });
});

describe("additive billing fields", () => {
  it("exposes payment method, owner, and checkout_pending without changing existing fields", () => {
    const r = toResponse("acc", base, "https://example.test/", {
      isOwner: true,
      paymentMethod: { brand: "visa", last4: "4242" },
      checkoutPending: { plan: "multi", expires_at: "2026-11-22T20:28:20.000Z" },
      hasStripeCustomer: false,
    });
    expect(r.has_payment_method).toBe(true);
    expect(r.payment_method).toEqual({ brand: "visa", last4: "4242" });
    expect(r.is_owner).toBe(true);
    expect(r.checkout_pending).toEqual({ plan: "multi", expires_at: "2026-11-22T20:28:20.000Z" });
    expect(r.billing_starts_at).toBe(base.trial_ends_at);
    expect(r.portal_available).toBe(false);
    expect(r.plan).toBe("trial");
  });

  it("does not treat a missing payment method or open checkout as a card on file", () => {
    const r = toResponse("acc", base, "https://example.test/", {
      checkoutPending: { plan: "multi", expires_at: "2026-11-22T20:28:20.000Z" },
    });
    expect(r.has_payment_method).toBe(false);
    expect(r.payment_method).toBeNull();
    expect(r.billing_starts_at).toBeNull();
  });

  it("uses status_detail, not a trial-ending warning, for a Stripe-trialing paid plan", () => {
    const row: EntitlementRow = {
      ...base,
      state: "active",
      plan: "multi",
      subscription_status: "trialing",
      current_period_end: "2026-12-01T00:00:00.000Z",
      trial_started_at: null,
      trial_ends_at: null,
    };
    expect(warningFor(row)).toBeNull();
    expect(statusDetailFor(row, { paymentMethod: { brand: "visa", last4: "4242" } })?.kind).toBe("trialing");
    const r = toResponse("acc", row, "https://example.test/", { paymentMethod: { brand: "visa", last4: "4242" }, isOwner: true, hasStripeCustomer: true });
    expect(r.warning).toBeNull();
    expect(r.status_detail?.kind).toBe("trialing");
    expect(r.trial).toBeNull();
    expect(r.state).toBe("active");
    expect(r.billing_starts_at).toBe(row.current_period_end);
    expect(r.next_billing_at).toBe(row.current_period_end);
    expect(r.portal_available).toBe(true);
  });

  it("localizes trial-ending copy and mentions a card on file when present", () => {
    const row = { ...base, server_time: "2026-11-10T08:00:00Z" };
    expect(warningFor(row)?.message).toMatch(/Add a payment method/);
    expect(warningFor(row, { locale: "es" })?.message).toMatch(/Agregue un método de pago/);
    const withCard = warningFor(row, { paymentMethod: { brand: "visa", last4: "4242" } });
    expect(withCard?.kind).toBe("trial_ending");
    expect(withCard?.message).toMatch(/visa •••• 4242/);
    expect(withCard?.message).toMatch(/billing starts when the trial ends/);
    expect(warningFor(row, { locale: "es", paymentMethod: { brand: "visa", last4: "4242" } })?.message).toMatch(/facturación/);
  });
});
