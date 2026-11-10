/** Pure display rules for the Plan & billing page. No React, so they are unit tested. */

export type SubscriptionView = { status: string; current_period_end: string | null; cancel_at_period_end: boolean } | null;
export type PlanStatus = { label: string; tone: "ok" | "warn" | "muted"; note: string | null };

/**
 * Calendar date in UTC ("Dec 10, 2026"), the same day Stripe's portal shows for the period end.
 * A late-evening UTC instant would otherwise read as the previous day in US zones.
 */
export function billingDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** Status line under the plan name: Active, Past due, Cancels on …, Ends on …, Free trial. */
export function planStatus(input: { state: string; planName: string; subscription: SubscriptionView }): PlanStatus {
  const { state, planName, subscription: sub } = input;
  if (state === "trial") return { label: "Free trial", tone: "ok", note: null };
  if (state === "trial_grace") return { label: "Trial ended", tone: "warn", note: null };
  if (state === "grandfathered") return { label: "Active", tone: "ok", note: null };
  if (state === "past_due") return { label: "Past due", tone: "warn", note: "Update your payment method in Manage billing to keep your plan." };
  if (state === "canceled" || state === "expired") return { label: "Not active", tone: "muted", note: null };
  const end = billingDate(sub?.current_period_end ?? null);
  if (sub && end && sub.cancel_at_period_end && (sub.status === "active" || sub.status === "trialing")) {
    return { label: `Cancels on ${end}`, tone: "warn", note: `Cancels on ${end}, you keep ${planName} until then.` };
  }
  if (sub && end && sub.status === "canceled") {
    return { label: `Ends on ${end}`, tone: "warn", note: `Your plan was canceled. You keep ${planName} until ${end}.` };
  }
  return { label: "Active", tone: "ok", note: null };
}

/** What a plan button does for this org: open Checkout, change the existing subscription, or send to the portal. */
export function planChangeMode(sub: SubscriptionView): "checkout" | "update" | "portal" {
  if (!sub) return "checkout";
  if (sub.status === "active" || sub.status === "trialing") return "update";
  if (sub.status === "past_due") return "portal";
  return "checkout";
}

export type PlanButton = { label: string; disabled: boolean; variant: "primary" | "quiet"; loading: boolean };

/**
 * Plan button state. While the availability check is loading the button is neutral and
 * never says "Coming soon". "Opening checkout…" only when Checkout really opens.
 */
export function planButton(input: {
  planId: string; planName: string; currentPlan: string | null;
  availability: "loading" | "available" | "unavailable";
  mode: "checkout" | "update" | "portal"; busyPlan: string | null;
}): PlanButton {
  const { planId, planName, currentPlan, availability, mode, busyPlan } = input;
  if (availability === "loading") return { label: "Loading…", disabled: true, variant: "quiet", loading: true };
  if (currentPlan === planId) return { label: "Current plan", disabled: true, variant: "primary", loading: false };
  if (availability === "unavailable") return { label: "Coming soon", disabled: true, variant: "quiet", loading: false };
  if (busyPlan === planId) {
    return { label: mode === "checkout" ? "Opening checkout…" : mode === "update" ? "Updating plan…" : "Opening…", disabled: true, variant: "primary", loading: false };
  }
  return { label: mode === "checkout" ? `Choose ${planName}` : `Switch to ${planName}`, disabled: !!busyPlan, variant: "primary", loading: false };
}

/** Line under the plan grid. Empty while loading so "coming soon" never flashes. */
export function checkoutNote(availability: "loading" | "available" | "unavailable", mode: "checkout" | "update" | "portal"): string {
  if (availability === "loading") return "";
  if (availability === "unavailable") return "Online checkout is coming soon. Your free trial includes 5 screens and every feature, with no card needed.";
  if (mode === "update") return "Switching plans changes your current subscription right away; no second subscription is created. Stripe charges the price difference for the rest of this billing period immediately (a downgrade becomes a credit on your next invoice).";
  if (mode === "portal") return "Your last payment didn't go through. Use Manage billing to update your card or change plans.";
  return "You'll finish payment on Stripe's secure checkout. Nothing is charged until you confirm there.";
}

/** Availability from the checkout GET: loading until it answers; an error counts as unavailable. */
export function availabilityOf(data: { available: boolean } | null, error: string | null): "loading" | "available" | "unavailable" {
  if (data) return data.available ? "available" : "unavailable";
  return error ? "unavailable" : "loading";
}
