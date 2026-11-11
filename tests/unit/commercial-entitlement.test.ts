import { describe, expect, it } from "vitest";
import { commercialEntitlement, type EntitlementRow } from "@/lib/server/entitlements";
import { nextGraceEnd } from "@/lib/server/stripe";

const trial: EntitlementRow = {
  state: "trial", plan: "trial", screen_limit: 5, active_screens: 1, total_screens: 1,
  trial_started_at: "2026-11-01T08:00:00Z", trial_ends_at: "2026-11-15T08:00:00Z", playback_ends_at: "2026-11-18T08:00:00Z",
  subscription_status: null, current_period_end: null, cancel_at_period_end: false, grace_ends_at: null,
  playback_allowed: true, can_add_screen: true, server_time: "2026-11-05T08:00:00Z",
};
const paid: EntitlementRow = {
  ...trial, state: "active", plan: "starter", screen_limit: 1, trial_started_at: null, trial_ends_at: null, playback_ends_at: null,
  subscription_status: "active", current_period_end: "2026-12-01T00:00:00Z", can_add_screen: false,
};
const on = (e: EntitlementRow) => commercialEntitlement(e, true);

describe("commercialEntitlement", () => {
  it("returns the SQL row unchanged when enforcement is off", () => {
    const legacy = { ...trial, state: "grandfathered" as const, plan: "grandfathered" as const };
    expect(commercialEntitlement(legacy, false)).toBe(legacy);
  });
  it("gives grandfathered, comp and unknown plans no access", () => {
    for (const plan of ["grandfathered", "comp", "enterprise"]) {
      const e = on({ ...trial, state: "grandfathered", plan: plan as EntitlementRow["plan"], trial_started_at: null, trial_ends_at: null });
      expect(e).toMatchObject({ state: "expired", screen_limit: 0, playback_allowed: false, can_add_screen: false });
    }
  });
  it("keeps a normal 14-day trial with 5 screens", () => {
    expect(on(trial)).toMatchObject({ state: "trial", screen_limit: 5, playback_allowed: true, can_add_screen: true });
  });
  it("caps a trial end set beyond 14 days", () => {
    const long = { ...trial, trial_ends_at: "2027-06-01T00:00:00Z", server_time: "2026-11-16T08:00:00Z" };
    const e = on(long);
    expect(e.state).toBe("trial_grace");
    expect(e.trial_ends_at).toBe("2026-11-15T08:00:00.000Z");
    expect(e.can_add_screen).toBe(false);
    expect(on({ ...long, server_time: "2026-11-18T08:00:00Z" })).toMatchObject({ state: "expired", playback_allowed: false });
  });
  it("expires a trial without an end 14 days after its start", () => {
    const e = on({ ...trial, trial_ends_at: null, server_time: "2026-12-01T00:00:00Z", state: "trial" });
    expect(e).toMatchObject({ state: "expired", playback_allowed: false, screen_limit: 0 });
  });
  it("keeps an active paid plan", () => {
    expect(on(paid)).toMatchObject({ state: "active", screen_limit: 1, playback_allowed: true });
  });
  it("plays past_due only until the recorded grace end", () => {
    const due = { ...paid, subscription_status: "past_due", grace_ends_at: "2026-11-12T08:00:00Z" };
    expect(on(due)).toMatchObject({ state: "past_due", playback_allowed: true, can_add_screen: false });
    expect(on({ ...due, server_time: "2026-11-12T08:00:00Z" })).toMatchObject({ state: "canceled", playback_allowed: false });
    expect(on({ ...due, grace_ends_at: null })).toMatchObject({ state: "canceled", playback_allowed: false });
  });
  it("keeps a canceled paid period until the paid-through date", () => {
    const c = { ...paid, subscription_status: "canceled", cancel_at_period_end: true };
    expect(on(c)).toMatchObject({ state: "active", playback_allowed: true, playback_ends_at: "2026-12-01T00:00:00.000Z" });
    expect(on({ ...c, server_time: "2026-12-01T00:00:00Z" })).toMatchObject({ state: "canceled", playback_allowed: false });
  });
  it("does not give the unpaid period away when a failed payment ends the subscription", () => {
    const c = { ...paid, subscription_status: "canceled", grace_ends_at: "2026-11-04T08:00:00Z" };
    expect(on(c)).toMatchObject({ state: "canceled", playback_allowed: false });
    expect(on({ ...c, server_time: "2026-11-03T08:00:00Z" })).toMatchObject({ state: "active", playback_ends_at: "2026-11-04T08:00:00.000Z" });
  });
  it("gives unpaid, incomplete, paused and missing statuses nothing", () => {
    for (const s of ["unpaid", "incomplete", "incomplete_expired", "paused", null]) {
      expect(on({ ...paid, subscription_status: s })).toMatchObject({ state: "canceled", playback_allowed: false, screen_limit: 0 });
    }
  });
  it("keeps over-limit counts so the owner can choose screens", () => {
    const over = on({ ...paid, plan: "business", screen_limit: 3, active_screens: 6, can_add_screen: false });
    expect(over).toMatchObject({ state: "active", screen_limit: 3, active_screens: 6, can_add_screen: false, playback_allowed: true });
  });
});

describe("nextGraceEnd", () => {
  const now = Date.parse("2026-11-01T00:00:00Z");
  it("starts 7 days on the first past_due and keeps it after", () => {
    expect(nextGraceEnd({ status: "past_due", previousStatus: "active", previousGrace: null, now })).toBe("2026-11-08T00:00:00.000Z");
    expect(nextGraceEnd({ status: "past_due", previousStatus: "past_due", previousGrace: "2026-11-05T00:00:00Z", now })).toBe("2026-11-05T00:00:00Z");
  });
  it("keeps the grace end when an unpaid subscription ends", () => {
    for (const status of ["canceled", "unpaid", "incomplete_expired"]) {
      expect(nextGraceEnd({ status, previousStatus: "past_due", previousGrace: "2026-11-05T00:00:00Z", now })).toBe("2026-11-05T00:00:00Z");
    }
  });
  it("clears it on payment and on a normal cancel", () => {
    expect(nextGraceEnd({ status: "active", previousStatus: "past_due", previousGrace: "2026-11-05T00:00:00Z", now })).toBeNull();
    expect(nextGraceEnd({ status: "canceled", previousStatus: "active", previousGrace: null, now })).toBeNull();
  });
});
