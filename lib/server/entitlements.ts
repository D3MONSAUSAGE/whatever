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

/** New organizations. Matches accounts.trial_ends_at default (created_at + 14 days). */
export const TRIAL_DAYS = 14;
/**
 * After the 14-day trial, screens keep playing for this many days (state trial_grace).
 * This is playback grace, not extra trial days.
 */
export const PLAYBACK_GRACE_DAYS = 3;
/** First recorded payment failure. A repeat past_due does not move this. */
export const PAYMENT_GRACE_DAYS = 7;
/**
 * Existing customers keep full access for this many days after the advance notice
 * is successfully sent. The clock is not started by a dashboard visit.
 */
export const TRANSITION_DAYS = 14;

const DAY = 86_400_000;

/** Adds whole days to a server timestamp. The result does not depend on a local zone. */
export function addServerDays(iso: string, days: number): string {
  return new Date(Date.parse(iso) + days * DAY).toISOString();
}

export function trialEndsAt(createdAt: string): string {
  return addServerDays(createdAt, TRIAL_DAYS);
}

export function paymentGraceEndsAt(failureRecordedAt: string): string {
  return addServerDays(failureRecordedAt, PAYMENT_GRACE_DAYS);
}

/**
 * Existing-customer window. A stored start is never replaced. Enforcement off does
 * not start the clock. The caller must pass a server timestamp, never a client clock.
 */
export function transitionStamp(existingStart: string | null, serverNow: string, enforced: boolean): string | null {
  if (existingStart) return existingStart;
  if (!enforced) return null;
  return serverNow;
}

export function transitionEndsAt(startedAt: string | null): string | null {
  if (!startedAt) return null;
  return addServerDays(startedAt, TRANSITION_DAYS);
}

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

/**
 * Early customers (plan grandfathered in migration 0013) are not cut off when
 * enforcement later turns on. The notice is the advance warning; the grace is
 * that their existing screens keep playing.
 */
export function rolloutNotice(e: Pick<EntitlementRow, "state">, endsAt: string | null = null, enforced = false): string | null {
  if (e.state !== "grandfathered") return null;
  if (enforced && endsAt) {
    return `You're an early Pekko customer. You keep full access through ${utcDate(endsAt)}. Your content stays; nothing is deleted.`;
  }
  return "You're an early Pekko customer. Enforcement is off, so your 14-day transition has not started. You keep full access and get a notice before billing changes. Your content stays.";
}

/** A downgrade whose screen count is below the screens currently on needs the owner to choose which stay on. */
export function downgradeNeedsScreenSelection(activeScreens: number, nextLimit: number): boolean {
  return activeScreens > nextLimit;
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
    const graceLeft = daysLeft(e.grace_ends_at, e.server_time);
    if (e.grace_ends_at && (graceLeft === 1 || graceLeft === 2)) {
      return { kind: "payment_failed", action: "open_plan", message: `Your payment grace ends in ${graceLeft} day${graceLeft === 1 ? "" : "s"}, on ${utcDate(e.grace_ends_at)}. Update your payment method to keep your screens playing. Your content is not deleted.` };
    }
    return { kind: "payment_failed", action: "open_plan", message: e.grace_ends_at
      ? `We couldn't take your last payment. Update your payment method before ${utcDate(e.grace_ends_at)} to keep your screens playing.`
      : "We couldn't take your last payment. Update your payment method to keep your screens playing." };
  }
  if (e.state !== "grandfathered" && e.active_screens > e.screen_limit) {
    return { kind: "over_limit", action: "select_screens", message: `Your plan includes ${e.screen_limit} screen${e.screen_limit === 1 ? "" : "s"} but ${e.active_screens} are on. Choose which screens stay on; the others pause and nothing is deleted.` };
  }
  const left = daysLeft(e.trial_ends_at, e.server_time);
  if (e.state === "trial" && left !== null && left <= 7) {
    const when = e.trial_ends_at ? ` on ${utcDate(e.trial_ends_at)}` : "";
    return { kind: "trial_ending", action: "open_plan", message: `${left} day${left === 1 ? "" : "s"} left in your free trial${when}.` };
  }
  return null;
}

/** Plans that are sold today. Anything else (grandfathered, comp, unknown) grants nothing once enforced. */
export const COMMERCIAL_PLANS: readonly PlanId[] = ["trial", "starter", "business", "multi"];

const RESTRICTED = (e: EntitlementRow, state: "expired" | "canceled", playbackEndsAt: string | null = null): EntitlementRow => ({
  ...e, state, screen_limit: 0, playback_allowed: false, can_add_screen: false, playback_ends_at: playbackEndsAt,
});

/**
 * The commercial rules applied on top of account_entitlement (the SQL function is shared with
 * production, so it is not changed). Only used when BILLING_ENFORCE=1; with enforcement off the
 * SQL row is returned unchanged, so production behaves exactly as before.
 *
 * - grandfathered, comp or any unknown plan: no free access (treated as an ended trial).
 * - trial: at most TRIAL_DAYS from its start, even if trial_ends_at was set later.
 * - paid plans: active/trialing play; past_due plays only until a recorded grace end;
 *   a canceled subscription plays until the paid-through date only if no payment failure was
 *   recorded (grace_ends_at null), otherwise until the grace end at most;
 *   unpaid, incomplete, incomplete_expired, paused or missing status play nothing.
 */
export function commercialEntitlement(e: EntitlementRow, enforced = billingEnforced()): EntitlementRow {
  if (!enforced) return e;
  const now = Date.parse(e.server_time);
  if (!COMMERCIAL_PLANS.includes(e.plan)) return RESTRICTED(e, "expired");
  if (e.plan === "trial") {
    if (e.state !== "trial" && e.state !== "trial_grace" && e.state !== "expired") return RESTRICTED(e, "expired");
    const start = e.trial_started_at ? Date.parse(e.trial_started_at) : NaN;
    if (!Number.isFinite(start)) return e.state === "expired" ? RESTRICTED(e, "expired") : e;
    const cap = start + TRIAL_DAYS * DAY;
    const end = e.trial_ends_at ? Math.min(Date.parse(e.trial_ends_at), cap) : cap;
    const playbackEnd = end + PLAYBACK_GRACE_DAYS * DAY;
    if (now < end) return { ...e, trial_ends_at: new Date(end).toISOString(), playback_ends_at: new Date(playbackEnd).toISOString() };
    if (now < playbackEnd) {
      return { ...e, state: "trial_grace", trial_ends_at: new Date(end).toISOString(), playback_ends_at: new Date(playbackEnd).toISOString(), can_add_screen: false, playback_allowed: true };
    }
    return { ...RESTRICTED(e, "expired"), trial_ends_at: new Date(end).toISOString() };
  }
  const status = e.subscription_status;
  const grace = e.grace_ends_at ? Date.parse(e.grace_ends_at) : null;
  const periodEnd = e.current_period_end ? Date.parse(e.current_period_end) : null;
  if (status === "active" || status === "trialing") return e;
  if (status === "past_due") {
    if (grace === null || now >= grace) return RESTRICTED(e, "canceled");
    return { ...e, state: "past_due", playback_allowed: true, can_add_screen: false, playback_ends_at: e.grace_ends_at };
  }
  if (status === "canceled") {
    const until = grace === null ? periodEnd : (periodEnd === null ? grace : Math.min(grace, periodEnd));
    if (until !== null && now < until) {
      const iso = new Date(until).toISOString();
      return { ...e, state: "active", playback_ends_at: iso, playback_allowed: true };
    }
    return RESTRICTED(e, "canceled");
  }
  return RESTRICTED(e, "canceled");
}

/** Entitlement used by every server gate: the SQL row, tightened by the commercial rules when enforced. */
export async function loadEffectiveEntitlement(accountId: string): Promise<EntitlementRow | null | "error"> {
  const e = await loadEntitlement(accountId);
  if (e === "error" || e === null) return e;
  return commercialEntitlement(e);
}

/** Owning account of a display (null if none). */
export async function displayAccountId(displayId: string): Promise<string | null | "error"> {
  const { data, error } = await db().from("displays").select("account_id").eq("id", displayId).maybeSingle();
  if (error) return "error";
  return data?.account_id ? String(data.account_id) : null;
}

/**
 * Player decision when enforced. "account" = the plan doesn't allow playback; "screen" = the plan
 * plays but this screen is paused (over the screen allowance). A database error fails open.
 */
export async function playerGate(displayId: string): Promise<"ok" | "account" | "screen"> {
  const accountId = await displayAccountId(displayId);
  if (accountId === "error") return "ok";
  if (!accountId) return "account";
  const e = await loadEffectiveEntitlement(accountId);
  if (e === "error") return "ok";
  if (!e || !e.playback_allowed) return "account";
  return (await displayEntitled(displayId)) ? "ok" : "screen";
}

export const OVER_LIMIT_PAYLOAD = {
  suspended: true,
  reason: "over_limit",
  title: "This screen is paused",
  message: "Your Pekko plan's screen allowance is full. Your content is saved. The account owner can choose which screens stay on, or pick a plan with more screens, from the Pekko dashboard.",
};

export function toResponse(accountId: string, e: EntitlementRow, appUrl: string, extra?: { transitionEndsAt?: string | null }) {
  const enforced = billingEnforced();
  const transitionEndsAt = enforced ? (extra?.transitionEndsAt ?? null) : null;
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
    rollout_notice: rolloutNotice(e, transitionEndsAt, enforced),
    transition_ends_at: transitionEndsAt,
    enforced,
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

/**
 * Reads a transition start that the reminder dispatcher already stored after a
 * successful notice. A dashboard request never writes this column.
 */
export async function readTransitionStart(accountId: string): Promise<string | null> {
  const row = await db().from("accounts").select("billing_transition_started_at").eq("id", accountId).maybeSingle();
  if (row.error || !row.data?.billing_transition_started_at) return null;
  return String(row.data.billing_transition_started_at);
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
  reason: "plan_inactive",
  title: "This screen is paused",
  message: "The Pekko plan for this screen isn't active. Your content is saved. The account owner can turn it back on from the Pekko dashboard.",
};
