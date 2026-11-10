import { describe, expect, it } from "vitest";
import { availabilityOf, billingDate, checkoutNote, planButton, planChangeMode, planStatus } from "@/lib/billing-view";

const active = { status: "active", current_period_end: "2026-12-10T03:42:41+00:00", cancel_at_period_end: false };

describe("plan status line", () => {
  it("shows Active for a live subscription", () => {
    expect(planStatus({ state: "active", planName: "Business", subscription: active })).toEqual({ label: "Active", tone: "ok", note: null });
  });
  it("shows the cancel date and that the plan is kept until then", () => {
    const s = planStatus({ state: "active", planName: "Business", subscription: { ...active, cancel_at_period_end: true } });
    expect(s.label).toBe("Cancels on Dec 10, 2026");
    expect(s.note).toBe("Cancels on Dec 10, 2026, you keep Business until then.");
  });
  it("uses the UTC calendar day Stripe shows, not the previous US evening", () => {
    expect(billingDate("2026-12-10T03:42:41+00:00")).toBe("Dec 10, 2026");
  });
  it("shows Past due, Ends on, trial and inactive states", () => {
    expect(planStatus({ state: "past_due", planName: "Starter", subscription: { ...active, status: "past_due" } }).label).toBe("Past due");
    expect(planStatus({ state: "active", planName: "Multi-screen", subscription: { ...active, status: "canceled" } }).label).toBe("Ends on Dec 10, 2026");
    expect(planStatus({ state: "trial", planName: "Free trial", subscription: null }).label).toBe("Free trial");
    expect(planStatus({ state: "canceled", planName: "Business", subscription: { ...active, status: "canceled" } }).label).toBe("Not active");
  });
});

describe("plan buttons", () => {
  const base = { planId: "business", planName: "Business", currentPlan: "starter", busyPlan: null } as const;
  it("says Updating plan… for a subscribed org and Opening checkout… only when Checkout opens", () => {
    expect(planButton({ ...base, availability: "available", mode: "update", busyPlan: "business" }).label).toBe("Updating plan…");
    expect(planButton({ ...base, availability: "available", mode: "checkout", busyPlan: "business" }).label).toBe("Opening checkout…");
    expect(planButton({ ...base, availability: "available", mode: "update" }).label).toBe("Switch to Business");
    expect(planButton({ ...base, currentPlan: "trial", availability: "available", mode: "checkout" }).label).toBe("Choose Business");
  });
  it("never shows Coming soon while availability is loading", () => {
    const b = planButton({ ...base, availability: "loading", mode: "checkout" });
    expect(b.label).not.toMatch(/coming soon/i);
    expect(b).toMatchObject({ disabled: true, loading: true });
    expect(checkoutNote("loading", "checkout")).toBe("");
    expect(planButton({ ...base, availability: "unavailable", mode: "checkout" }).label).toBe("Coming soon");
  });
  it("treats an unanswered check as loading and an error as unavailable", () => {
    expect(availabilityOf(null, null)).toBe("loading");
    expect(availabilityOf(null, "Network")).toBe("unavailable");
    expect(availabilityOf({ available: true }, null)).toBe("available");
  });
  it("marks the current plan and picks the mode from the subscription", () => {
    expect(planButton({ ...base, currentPlan: "business", availability: "available", mode: "update" }).label).toBe("Current plan");
    expect(planChangeMode(null)).toBe("checkout");
    expect(planChangeMode(active)).toBe("update");
    expect(planChangeMode({ ...active, status: "past_due" })).toBe("portal");
    expect(planChangeMode({ ...active, status: "canceled" })).toBe("checkout");
  });
  it("explains that a switch is charged right away", () => {
    expect(checkoutNote("available", "update")).toMatch(/immediately/);
    expect(checkoutNote("available", "update")).toMatch(/no second subscription/);
  });
});
