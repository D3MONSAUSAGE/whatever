import { db } from "./supabase";

/** Server-side billing enforcement. Off unless BILLING_ENFORCE=1 (reads still work when off). */
export function billingEnforced(env: Record<string, string | undefined> = process.env) {
  return env.BILLING_ENFORCE === "1";
}

export type EntitlementState = "trial" | "trial_grace" | "active" | "past_due" | "grandfathered" | "canceled" | "expired";
export const ENTITLEMENT_STATES: readonly EntitlementState[] = ["trial", "trial_grace", "active", "past_due", "grandfathered", "canceled", "expired"];
export type PlanId = "trial" | "starter" | "business" | "multi" | "grandfathered" | "comp";

export const PLAN_NAMES: Record<PlanId, string> = {
  trial: "Free trial",
  starter: "Starter",
  business: "Business",
  multi: "Multi-screen",
  grandfathered: "Early customer",
  comp: "Complimentary",
};

export type EntitlementRow = {
  state: EntitlementState; plan: PlanId; screen_limit: number; active_screens: number; total_screens: number;
  trial_started_at: string | null; trial_ends_at: string | null; playback_ends_at: string | null;
  subscription_status: string | null; current_period_end: string | null; cancel_at_period_end: boolean;
  grace_ends_at: string | null; playback_allowed: boolean; can_add_screen: boolean; server_time: string;
};

export type Warning = {
  kind: "trial_ending" | "trial_ended" | "payment_failed" | "over_limit" | "expired" | "canceled";
  message: string;
  action: "open_plan" | "select_screens" | null;
} | null;

export const PLAN_LIMITS: Record<PlanId, number> = { trial: 5, starter: 1, business: 3, multi: 5, grandfathered: 5, comp: 5 };

const DAY = 86_400_000;

/**
 * Whole days left = ceil(remaining / 24 h); 1 during the final 24 hours, 0 once the instant
 * has passed. Computed from server_time, so it never depends on a device clock or time zone.
 */
export function daysLeft(endsAt: string | null, now: string) {
  if (!endsAt) return null;
  const ms = Date.parse(endsAt) - Date.parse(now);
  return ms <= 0 ? 0 : Math.ceil(ms / DAY);
}

/** Dates in user copy are written in UTC with the zone named, so the server never guesses a zone. */
function utcDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) + " (UTC)";
}

export function warningFor(e: EntitlementRow): Warning {
  if (e.state === "expired") {
    return { kind: "expired", action: "open_plan", message: "Your free trial has ended, so your screens are paused. Your content and settings are saved. Choose a plan to turn them back on." };
  }
  if (e.state === "canceled") {
    return { kind: "canceled", action: "open_plan", message: "Your plan isn't active, so your screens are paused. Your content and settings are saved. Choose a plan to turn them back on." };
  }
  if (e.state === "trial_grace" && e.playback_ends_at) {
    return { kind: "trial_ended", action: "open_plan", message: `Your free trial has ended. Screens keep playing until ${utcDate(e.playback_ends_at)}. Choose a plan to keep them on.` };
  }
  if (e.state === "past_due") {
    return { kind: "payment_failed", action: "open_plan", message: e.grace_ends_at
      ? `We couldn't take your last payment. Update your payment method before ${utcDate(e.grace_ends_at)} to keep your screens playing.`
      : "We couldn't take your last payment. Update your payment method to keep your screens playing." };
  }
  if (e.state !== "grandfathered" && e.active_screens > e.screen_limit) {
    return { kind: "over_limit", action: "select_screens", message: `Your plan includes ${e.screen_limit} screen${e.screen_limit === 1 ? "" : "s"} but ${e.active_screens} are on. Choose which screens stay on; the others pause and nothing is deleted.` };
  }
  const left = daysLeft(e.trial_ends_at, e.server_time);
  if (e.state === "trial" && left !== null && left <= 7) {
    return { kind: "trial_ending", action: "open_plan", message: `${left} day${left === 1 ? "" : "s"} left in your free trial.` };
  }
  return null;
}

export function toResponse(accountId: string, e: EntitlementRow, appUrl: string) {
  return {
    account_id: accountId,
    state: e.state,
    plan: e.plan,
    plan_name: PLAN_NAMES[e.plan] ?? e.plan,
    screen_limit: e.screen_limit,
    active_screens: e.active_screens,
    total_screens: e.total_screens,
    can_add_screen: e.can_add_screen,
    playback_allowed: e.playback_allowed,
    trial: e.plan === "trial"
      ? { started_at: e.trial_started_at, ends_at: e.trial_ends_at, days_left: daysLeft(e.trial_ends_at, e.server_time) }
      : null,
    subscription: e.subscription_status
      ? { status: e.subscription_status, current_period_end: e.current_period_end, cancel_at_period_end: e.cancel_at_period_end }
      : null,
    grace_ends_at: e.grace_ends_at,
    suspend_at: e.state === "expired" || e.state === "canceled" ? null : e.playback_ends_at,
    /** Gated premium features. None in M17: every plan and the trial get every feature. */
    features_locked: [] as string[],
    warning: warningFor(e),
    enforced: billingEnforced(),
    billing_url: `${appUrl.replace(/\/$/, "")}/dashboard/billing`,
    server_time: e.server_time,
  };
}

export async function loadEntitlement(accountId: string): Promise<EntitlementRow | null | "error"> {
  const { data, error } = await db().rpc("account_entitlement", { p_account: accountId });
  if (error) return "error";
  const row = Array.isArray(data) ? data[0] : data;
  return (row as EntitlementRow) ?? null;
}

/** Player gate. Fails open on a database error so a DB blip never blanks paying customers' screens. */
export async function displayEntitled(displayId: string): Promise<boolean> {
  const { data, error } = await db().rpc("display_entitled", { p_display: displayId });
  if (error) return true;
  return data === true;
}

/** Ids of this account's screens that may play now (same rule as display_entitled). */
export async function entitledDisplayIds(accountId: string): Promise<Set<string> | "error"> {
  const { data, error } = await db().rpc("entitled_display_ids", { p_account: accountId });
  if (error) return "error";
  return new Set(((data ?? []) as Array<{ display_id: string } | string>).map((r) => (typeof r === "string" ? r : r.display_id)));
}

export const SUSPENDED_PAYLOAD = {
  suspended: true,
  title: "This screen is paused",
  message: "The Pekko plan for this screen isn't active. Your content is saved. The account owner can turn it back on from the Pekko dashboard.",
};
