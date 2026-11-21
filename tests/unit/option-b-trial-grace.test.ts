import { describe, expect, it } from "vitest";
import { checkoutSubmitMessage } from "@/lib/server/billing-copy";
import { cappedTrialEndsAt, commercialEntitlement, subscriptionWritesAllowed, toResponse, type EntitlementRow } from "@/lib/server/entitlements";
import { subscriptionWriteError } from "@/lib/server/subscription-write";

const trial: EntitlementRow = {
  state: "trial", plan: "trial", screen_limit: 5, active_screens: 1, total_screens: 1,
  trial_started_at: "2026-11-01T08:00:00Z", trial_ends_at: "2026-11-15T08:00:00Z", playback_ends_at: "2026-11-18T08:00:00Z",
  subscription_status: null, current_period_end: null, cancel_at_period_end: false, grace_ends_at: null,
  playback_allowed: true, can_add_screen: true, server_time: "2026-11-05T08:00:00Z",
};

describe("cappedTrialEndsAt", () => {
  it("never extends a trial past 14 days from start", () => {
    expect(cappedTrialEndsAt("2026-11-01T08:00:00Z", "2027-06-01T00:00:00Z")).toBe("2026-11-15T08:00:00.000Z");
    expect(cappedTrialEndsAt("2026-11-01T08:00:00Z", "2026-11-10T08:00:00Z")).toBe("2026-11-10T08:00:00.000Z");
    expect(cappedTrialEndsAt("2026-11-01T08:00:00Z", null)).toBe("2026-11-15T08:00:00.000Z");
  });
});

describe("subscriptionWritesAllowed", () => {
  it("allows trial, active, past_due and grandfathered writes", () => {
    for (const state of ["trial", "active", "past_due", "grandfathered"] as const) {
      expect(subscriptionWritesAllowed({ state })).toBe(true);
    }
  });
  it("locks trial_grace, expired and canceled so grace cannot be waited out", () => {
    for (const state of ["trial_grace", "expired", "canceled"] as const) {
      expect(subscriptionWritesAllowed({ state })).toBe(false);
    }
  });
});

describe("subscriptionWriteError", () => {
  it("explains the grace lock in English and Spanish", () => {
    expect(subscriptionWriteError("trial_grace", "en").code).toBe("subscription_inactive");
    expect(subscriptionWriteError("trial_grace", "en").error).toMatch(/editing and publishing are locked/);
    expect(subscriptionWriteError("trial_grace", "es").error).toMatch(/edición y la publicación están bloqueadas/);
    expect(subscriptionWriteError("expired", "en").error).toMatch(/plan isn't active/);
    expect(subscriptionWriteError("expired", "es").error).toMatch(/plan no está activo/);
  });
});

describe("checkoutSubmitMessage", () => {
  it("discloses a deferred first charge", () => {
    expect(checkoutSubmitMessage({ deferred: true, price: 59, chargeDate: "Nov 26, 2026 (UTC)", locale: "en" }))
      .toMatch(/charged \$59 on Nov 26, 2026 \(UTC\)/);
    expect(checkoutSubmitMessage({ deferred: true, price: 59, chargeDate: "26 nov 2026 (UTC)", locale: "es" }))
      .toMatch(/Se le cobrará \$59 el 26 nov 2026 \(UTC\)/);
  });
  it("discloses an immediate first charge", () => {
    expect(checkoutSubmitMessage({ deferred: false, price: 59, chargeDate: "", locale: "en" })).toMatch(/charged \$59 today/);
    expect(checkoutSubmitMessage({ deferred: false, price: 59, chargeDate: "", locale: "es" })).toMatch(/Se le cobrará \$59 hoy/);
  });
});

describe("trial_grace entitlements contract", () => {
  it("keeps playback on, locks new screens, and uses suspend_at rather than grace_ends_at", () => {
    const e = commercialEntitlement({ ...trial, server_time: "2026-11-16T08:00:00Z" }, true);
    expect(e).toMatchObject({
      state: "trial_grace",
      playback_allowed: true,
      can_add_screen: false,
      grace_ends_at: null,
      playback_ends_at: "2026-11-18T08:00:00.000Z",
    });
    const r = toResponse("acc", e, "https://pekkotv.com");
    expect(r.suspend_at).toBe("2026-11-18T08:00:00.000Z");
    expect(r.grace_ends_at).toBeNull();
    expect(r.playback_allowed).toBe(true);
    expect(r.warning?.kind).toBe("trial_ended");
    expect(r.status_detail).toBeNull();
    expect(r.features_locked).toEqual([]);
  });
  it("exposes the same suspend_at during the 14-day trial", () => {
    const e = commercialEntitlement(trial, true);
    expect(e.state).toBe("trial");
    expect(toResponse("acc", e, "https://pekkotv.com").suspend_at).toBe("2026-11-18T08:00:00.000Z");
    expect(toResponse("acc", e, "https://pekkotv.com").grace_ends_at).toBeNull();
  });
  it("maps a Stripe-trialing paid plan to state active and kind trialing", () => {
    const e = commercialEntitlement({
      ...trial,
      state: "active",
      plan: "multi",
      screen_limit: 5,
      trial_started_at: null,
      trial_ends_at: null,
      playback_ends_at: "2026-11-26T03:31:28.000Z",
      subscription_status: "trialing",
      current_period_end: "2026-11-26T03:31:28.000Z",
      server_time: "2026-11-21T20:00:00Z",
    }, true);
    expect(e.state).toBe("active");
    expect(e.plan).toBe("multi");
    const r = toResponse("acc", e, "https://pekkotv.com", {
      paymentMethod: { brand: "visa", last4: "4242" },
      isOwner: true,
    });
    expect(r.trial).toBeNull();
    expect(r.state).toBe("active");
    expect(r.has_payment_method).toBe(true);
    expect(r.status_detail?.kind).toBe("trialing");
    expect(r.warning).toBeNull();
    expect(r.billing_starts_at).toBe("2026-11-26T03:31:28.000Z");
    expect(r.next_billing_at).toBe("2026-11-26T03:31:28.000Z");
  });
});
