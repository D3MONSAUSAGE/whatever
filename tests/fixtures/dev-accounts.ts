import type { AccountsList, ListAccount, ListUser } from "@/lib/server/dev-accounts/build";
import type { BillingSnapshot, BillingSub } from "@/lib/server/dev-analytics/stripe-source";

/** DA-2 fixture. Placeholder addresses and ids only (public repo): never real customers. */
export const NOW = "2026-11-15T20:00:00Z";
export const A = {
  paid: "a1000000-0000-4000-8000-000000000001",
  trial: "a2000000-0000-4000-8000-000000000002",
  old: "a3000000-0000-4000-8000-000000000003",
  expired: "a4000000-0000-4000-8000-000000000004",
  qa: "b1000000-0000-4000-8000-000000000001",
  listed: "b2000000-0000-4000-8000-000000000002",
  comp: "b3000000-0000-4000-8000-000000000003",
  orphan: "f1000000-0000-4000-8000-000000000001",
  orphanQa: "f2000000-0000-4000-8000-000000000002",
} as const;

export function acct(id: string, email: string, created: string, extra: Partial<ListAccount> = {}): ListAccount {
  const domain = email.split("@")[1] || "";
  return {
    id, email, user_created_at: created, created_at: created, user_confirmed: true, last_sign_in_at: null,
    plan: "trial", state: "trial", trial_started_at: created, trial_ends_at: new Date(Date.parse(created) + 14 * 86_400_000).toISOString(),
    playback_ends_at: new Date(Date.parse(created) + 17 * 86_400_000).toISOString(),
    subscription_status: null, current_period_end: null, cancel_at_period_end: false, comp: false,
    email_domain: domain, plus_alias: email.split("@")[0].includes("+"), excluded_reason: null,
    screens_active: 0, screens_ever: 0, first_paired_at: null, last_check_in_at: null, ever_confirmed: false,
    last_confirmed_at: null, first_playback_at: null, last_owner_action_at: null, last_owner_action_kind: null,
    utm_source: null, utm_medium: null, utm_campaign: null, referrer_host: null, deletion_pending: false,
    ...extra,
  };
}

const user = (id: string, email: string, created: string): ListUser => ({
  id, email, user_created_at: created, user_confirmed: false, last_sign_in_at: null,
  email_domain: email.split("@")[1], plus_alias: false,
});

export function list(): AccountsList {
  return {
    generated_at: NOW,
    accounts: [
      acct(A.paid, "owner.one@public-mail.test", "2026-11-01T18:00:00Z", {
        plan: "multi", state: "active", trial_started_at: null, trial_ends_at: null, playback_ends_at: null,
        subscription_status: "active", current_period_end: "2026-12-01T18:00:00Z",
        screens_active: 2, screens_ever: 3, first_paired_at: "2026-11-01T19:00:00Z", last_check_in_at: "2026-11-15T19:59:00Z",
        ever_confirmed: true, last_confirmed_at: "2026-11-15T19:00:00Z", first_playback_at: "2026-11-01T19:05:00Z",
        last_owner_action_at: "2026-11-14T17:00:00Z", last_owner_action_kind: "playlist.published",
        last_sign_in_at: "2026-11-10T17:00:00Z",
      }),
      acct(A.trial, "zed@other-mail.test", "2026-11-13T18:00:00Z", {
        screens_active: 1, screens_ever: 1, first_paired_at: "2026-11-13T19:00:00Z", last_check_in_at: "2026-11-15T10:00:00Z",
        last_sign_in_at: "2026-11-15T09:00:00Z", last_owner_action_at: "2026-11-13T19:00:00Z", last_owner_action_kind: "screen.paired",
        utm_source: "facebook", utm_medium: "paid_social", utm_campaign: "launch", referrer_host: null,
      }),
      // Paired before TV confirmations were recorded, never confirmed since.
      acct(A.old, "early@customer-biz.test", "2026-10-28T18:00:00Z", {
        screens_active: 0, screens_ever: 1, first_paired_at: "2026-10-28T19:00:00Z", state: "expired",
      }),
      acct(A.expired, "late+shop@public-mail.test", "2026-10-31T18:00:00Z", { state: "trial_grace", deletion_pending: true }),
      acct(A.qa, "qa+r1@internal-qa.test", "2026-11-05T18:00:00Z"),
      acct(A.listed, "listed@public-mail.test", "2026-11-06T18:00:00Z", { excluded_reason: "reviewer" }),
      acct(A.comp, "comp@public-mail.test", "2026-11-07T18:00:00Z", { plan: "comp", comp: true, state: "active" }),
    ],
    users_without_account: [user(A.orphan, "never@public-mail.test", "2026-11-14T18:00:00Z"), user(A.orphanQa, "qa+x@internal-qa.test", "2026-11-14T19:00:00Z")],
    coverage: { activity_from: "2026-10-30T03:06:54Z", playback_from: "2026-10-30T03:00:00Z" },
  };
}

export const DOMAINS = ["internal-qa.test"];

export function sub(accountId: string | null, status: string, extra: Partial<BillingSub> = {}): BillingSub {
  return {
    accountId, status, createdAt: "2026-11-01T18:00:00Z", canceledAt: null, cancelAtPeriodEnd: false, monthlyAmount: 5900,
    currency: "usd", livemode: true, plan: "multi", currentPeriodEnd: "2026-12-01T18:00:00Z", ...extra,
  };
}

export function billing(): BillingSnapshot {
  return { available: true, livemode: true, subs: [sub(A.paid, "active"), sub("ffffffff-0000-4000-8000-00000000ffff", "active")] };
}
