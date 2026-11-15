/**
 * I18N-4: one matrix of inputs for every outgoing notification. The English output of this
 * matrix was captured on main (03a1292) into tests/fixtures/notifications-en.golden.json before
 * any I18N-4 change, so the test proves English stays byte for byte the same.
 */
import { billingNotices, billingTemplate, formatWhen, remainingPhrase, selfTestNotices } from "@/lib/server/billing-notices";
import { planOrgReminders, type ReminderAccount } from "@/lib/server/billing-dispatch";
import type { EntitlementRow } from "@/lib/server/entitlements";
import { emailFor, formatAt } from "@/lib/server/alerts";
import { pushFor } from "@/lib/server/push";
import { welcomeMessage } from "@/lib/server/welcome-email";

export const NOW = "2026-11-12T08:00:00.000Z";
const TZS = [null, "UTC", "America/Los_Angeles", "America/Mexico_City", "America/New_York", "Not/AZone"];
const DEADLINES = ["2026-11-15T08:00:00.000Z", "2026-11-13T09:30:00.000Z", "2026-11-12T10:15:00.000Z", "2026-11-12T08:40:00.000Z", "2026-11-26T20:07:00.000Z"];
const KINDS = ["trial_ending_3", "trial_ending_1", "payment_failed", "grace_ending_2", "grace_ending_1", "transition_14"] as const;

const base: EntitlementRow = {
  state: "trial", plan: "trial", screen_limit: 5, active_screens: 1, total_screens: 1,
  trial_started_at: "2026-11-01T08:00:00.000Z", trial_ends_at: "2026-11-15T08:00:00.000Z", playback_ends_at: "2026-11-18T08:00:00.000Z",
  subscription_status: null, current_period_end: null, cancel_at_period_end: false, grace_ends_at: null,
  playback_allowed: true, can_add_screen: true, server_time: NOW,
};

export const ROWS: Record<string, EntitlementRow> = {
  trial3: { ...base },
  trial1: { ...base, trial_ends_at: "2026-11-13T08:00:00.000Z" },
  trialGrace: { ...base, state: "trial_grace", trial_ends_at: "2026-11-10T08:00:00.000Z", playback_ends_at: "2026-11-13T08:00:00.000Z" },
  trialGraceNoEnd: { ...base, state: "trial_grace", trial_ends_at: "2026-11-10T08:00:00.000Z", playback_ends_at: null },
  expired: { ...base, state: "expired", trial_ends_at: "2026-11-01T08:00:00.000Z", playback_ends_at: "2026-11-04T08:00:00.000Z" },
  pastDue2: { ...base, state: "past_due", plan: "starter", grace_ends_at: "2026-11-14T08:00:00.000Z", subscription_status: "past_due" },
  pastDue1: { ...base, state: "past_due", plan: "business", grace_ends_at: "2026-11-13T08:00:00.000Z", subscription_status: "past_due" },
  pastDue5: { ...base, state: "past_due", plan: "multi", grace_ends_at: "2026-11-17T08:00:00.000Z", subscription_status: "past_due" },
  canceled: { ...base, state: "canceled", plan: "starter", current_period_end: "2026-11-10T08:00:00.000Z", subscription_status: "canceled" },
  canceledNoDates: { ...base, state: "canceled", plan: "starter", subscription_status: "unpaid" },
  active: { ...base, state: "active", plan: "business", subscription_status: "active", current_period_end: "2026-12-01T08:00:00.000Z" },
  grandfathered: { ...base, state: "grandfathered", plan: "grandfathered" },
};

export const ACCOUNTS: ReminderAccount[] = [
  { id: "acct-gf", email: "o@x.test", plan: "grandfathered", state: "grandfathered", trial_started_at: null, trial_ends_at: null, playback_ends_at: null, grace_ends_at: null, subscription_status: null, current_period_end: null, transition_started_at: null, timezone: "America/Mexico_City" },
  { id: "acct-trial", email: "t@x.test", plan: "trial", state: "trial", trial_started_at: "2026-11-01T08:00:00.000Z", trial_ends_at: "2026-11-15T08:00:00.000Z", playback_ends_at: null, grace_ends_at: null, subscription_status: null, current_period_end: null, transition_started_at: null, timezone: null },
  { id: "acct-due", email: "d@x.test", plan: "starter", state: "past_due", trial_started_at: null, trial_ends_at: null, playback_ends_at: null, grace_ends_at: "2026-11-13T08:00:00.000Z", subscription_status: "past_due", current_period_end: null, transition_started_at: null, timezone: "UTC" },
];

const ALERTS = [
  { id: "al1", kind: "screen.offline" as const, display_id: "d1", display_name: "Office Tv", offline_since: "2026-11-12T02:05:00Z", offline_seconds: null },
  { id: "al2", kind: "screen.recovered" as const, display_id: "d1", display_name: "Office Tv", offline_since: "2026-11-12T02:05:00Z", offline_seconds: 1500 },
  { id: "al3", kind: "screen.recovered" as const, display_id: null, display_name: "Barra \"Norte\" — Taquería", offline_since: "2026-11-12T02:05:00Z", offline_seconds: 9000 },
  { id: "al4", kind: "screen.recovered" as const, display_id: "d4", display_name: "Patio", offline_since: "2026-11-12T02:05:00Z", offline_seconds: 20 },
];

/** English output for the whole matrix, in a stable order. Calls use today's (pre-I18N-4) signatures. */
export function englishOutputs(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const tz of TZS) for (const d of DEADLINES) {
    out[`formatWhen|${tz}|${d}`] = formatWhen(d, tz);
    out[`remaining|${d}`] = remainingPhrase(d, NOW);
    for (const k of KINDS) out[`template|${k}|${tz}|${d}`] = billingTemplate(k, d, { now: NOW, tz });
  }
  for (const [name, row] of Object.entries(ROWS)) for (const tz of [null, "America/Mexico_City"]) {
    out[`notices|${name}|${tz}`] = billingNotices(row, { tz });
    out[`notices-enforced|${name}|${tz}`] = billingNotices(row, { tz, enforced: true, transitionEndsAt: "2026-11-20T08:00:00.000Z" });
  }
  out["selftest"] = selfTestNotices(ROWS.trial3, null);
  for (const a of ACCOUNTS) out[`plan|${a.id}`] = planOrgReminders(a, NOW);
  for (const a of ALERTS) for (const tz of ["UTC", "America/Los_Angeles", "America/Mexico_City", "Not/AZone"]) {
    out[`alertEmail|${a.id}|${tz}`] = emailFor(a, tz, "https://pekkotv.com");
    out[`formatAt|${tz}`] = formatAt(a.offline_since, tz);
  }
  for (const a of ALERTS) out[`push|${a.id}`] = pushFor(a);
  out["welcome|default"] = welcomeMessage("owner@x.test");
  out["welcome|origin"] = welcomeMessage("owner@x.test", "https://pantalla-chi.vercel.app");
  return out;
}
