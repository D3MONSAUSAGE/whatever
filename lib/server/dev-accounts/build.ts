import {
  ACCOUNTS_MAX_PAGE_SIZE, ACCOUNTS_PAGE_SIZE, ACCOUNT_POPULATIONS, ACCOUNT_SORTS,
  type AccountPopulation, type AccountRow, type AccountSort, type AccountsNote, type ActivityAction, type DevAccounts,
  type DisplayedStatus, type InternalReason, type TrialStatus,
} from "@/lib/dev-accounts";
import { classifyAccount } from "@/lib/server/dev-analytics/exclusions";
import { ACTIVITY_FALLBACK_FROM, ATTRIBUTION_FROM, channelFor } from "@/lib/server/dev-analytics/metrics";
import { pacificDay } from "@/lib/server/dev-analytics/range";
import type { BillingSnapshot, BillingSub } from "@/lib/server/dev-analytics/stripe-source";

// ---------------------------------------------------------------- input (from dev_accounts_list, 0030)
export type ListAccount = {
  id: string;
  email: string | null;
  user_created_at: string | null;
  created_at: string;
  user_confirmed: boolean;
  last_sign_in_at: string | null;
  plan: string | null;
  state: string | null;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  playback_ends_at: string | null;
  subscription_status: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  comp: boolean;
  email_domain: string | null;
  plus_alias: boolean;
  excluded_reason: string | null;
  screens_active: number;
  screens_ever: number;
  first_paired_at: string | null;
  last_check_in_at: string | null;
  ever_confirmed: boolean;
  last_confirmed_at: string | null;
  first_playback_at: string | null;
  last_owner_action_at: string | null;
  last_owner_action_kind: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  referrer_host: string | null;
  deletion_pending: boolean;
};
export type ListUser = {
  id: string;
  email: string | null;
  user_created_at: string;
  user_confirmed: boolean;
  last_sign_in_at: string | null;
  email_domain: string | null;
  plus_alias: boolean;
};
export type AccountsList = {
  generated_at: string;
  accounts: ListAccount[];
  users_without_account: ListUser[];
  coverage: { activity_from: string | null; playback_from: string | null };
};

/**
 * 0005_analytics (displays.confirmed_at, playback_events) applied in production. A TV paired before this
 * that never confirmed afterwards may have shown content we have no record of: "unknown", not "no".
 */
export const DISPLAY_TRACKING_FROM = "2026-10-30T01:05:17Z";

const ACTION: Record<string, ActivityAction> = {
  "playlist.published": "publish",
  "media.uploaded": "upload",
  "screen.paired": "pair",
  "screen.content_changed": "content_change",
  "schedule.created": "schedule",
  "schedule.updated": "schedule",
  "schedule.deleted": "schedule",
};
const LIVE_SUB = new Set(["active", "trialing", "past_due", "unpaid", "incomplete", "paused"]);
const EXPLICIT = new Set<InternalReason>(["internal", "qa", "demo", "reviewer", "test"]);

const t = (s: string | null | undefined) => (s ? Date.parse(s) : NaN);
const later = (a: string | null, b: string | null) => (!a ? b : !b ? a : t(a) >= t(b) ? a : b);

// ---------------------------------------------------------------- query parsing
export type AccountsQuery = { population: AccountPopulation; q: string; sort: AccountSort; dir: "asc" | "desc"; page: number; pageSize: number };

export function parseAccountsQuery(params: URLSearchParams): AccountsQuery {
  const pick = <T extends string>(v: string | null, list: readonly T[], d: T): T => (list as readonly string[]).includes(v || "") ? (v as T) : d;
  const int = (v: string | null, d: number, min: number, max: number) => {
    const n = Number.parseInt(v || "", 10);
    return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : d;
  };
  const sort = pick(params.get("sort"), ACCOUNT_SORTS, "registered");
  return {
    population: pick(params.get("population"), ACCOUNT_POPULATIONS, "customers"),
    q: (params.get("q") || "").trim().toLowerCase().slice(0, 100),
    sort,
    dir: params.get("dir") === "asc" ? "asc" : params.get("dir") === "desc" ? "desc" : sort === "email" ? "asc" : "desc",
    page: int(params.get("page"), 1, 1, 10_000),
    pageSize: int(params.get("pageSize"), ACCOUNTS_PAGE_SIZE, 1, ACCOUNTS_MAX_PAGE_SIZE),
  };
}

// ---------------------------------------------------------------- per-row facts
function trialStatus(a: ListAccount): TrialStatus {
  if (a.plan !== "trial") return "not_on_trial";
  if (a.state === "trial") return "active";
  if (a.state === "trial_grace") return "grace";
  return "expired";
}

/** The subscription Stripe says is current for this account: a live one first, else the newest. */
export function currentSub(subs: BillingSub[]): BillingSub | null {
  if (!subs.length) return null;
  const sorted = [...subs].sort((x, y) => y.createdAt.localeCompare(x.createdAt));
  return sorted.find((s) => LIVE_SUB.has(s.status)) ?? sorted[0];
}

function subscription(a: ListAccount, billing: BillingSnapshot, subs: BillingSub[]): AccountRow["subscription"] {
  if (billing.available) {
    const s = currentSub(subs);
    if (!s) {
      // Stripe has nothing for this account. A stored live status would be stale, so flag it.
      const stale = !!a.subscription_status && LIVE_SUB.has(a.subscription_status);
      return { source: "none", status: null, plan: null, cancelAtPeriodEnd: false, currentPeriodEnd: null, mismatch: stale };
    }
    return {
      source: "stripe", status: s.status, plan: s.plan, cancelAtPeriodEnd: s.cancelAtPeriodEnd, currentPeriodEnd: s.currentPeriodEnd,
      mismatch: (a.subscription_status || null) !== s.status,
    };
  }
  if (!a.subscription_status) return { source: "none", status: null, plan: null, cancelAtPeriodEnd: false, currentPeriodEnd: null, mismatch: false };
  const paid = a.plan && !["trial", "comp", "grandfathered"].includes(a.plan) ? a.plan : null;
  return { source: "stored", status: a.subscription_status, plan: paid, cancelAtPeriodEnd: !!a.cancel_at_period_end, currentPeriodEnd: a.current_period_end, mismatch: false };
}

export function displayedStatus(a: Pick<ListAccount, "screens_ever" | "ever_confirmed" | "first_playback_at" | "first_paired_at">): DisplayedStatus {
  if (a.ever_confirmed || a.first_playback_at) return "yes";
  if (!a.screens_ever) return "no_tv";
  if (a.first_paired_at && t(a.first_paired_at) < t(DISPLAY_TRACKING_FROM)) return "unknown";
  return "not_yet";
}

function internalReason(explicit: string | null, rule: string | null): InternalReason | null {
  if (explicit && EXPLICIT.has(explicit as InternalReason)) return explicit as InternalReason;
  if (explicit) return "internal";
  if (rule === "comp" || rule === "internal_domain") return rule;
  return null;
}

export function accountRow(a: ListAccount, billing: BillingSnapshot, subs: BillingSub[], domains: readonly string[]): AccountRow {
  const c = classifyAccount({ id: a.id, created_at: a.created_at, comp: a.comp, email_domain: a.email_domain, plus_alias: a.plus_alias, excluded_reason: a.excluded_reason }, domains);
  const ownerAt = a.last_owner_action_at;
  const at = later(ownerAt, a.last_sign_in_at);
  return {
    id: a.id,
    userOnly: false,
    email: a.email || "",
    registeredAt: a.user_created_at || a.created_at,
    emailConfirmed: !!a.user_confirmed,
    plan: a.plan,
    trial: { status: trialStatus(a), startedAt: a.trial_started_at, endsAt: a.trial_ends_at, playbackEndsAt: a.plan === "trial" ? a.playback_ends_at : null },
    subscription: subscription(a, billing, subs),
    tv: { paired: a.screens_ever > 0, activeScreens: a.screens_active, screensEver: a.screens_ever, firstPairedAt: a.first_paired_at, lastCheckInAt: a.last_check_in_at },
    displayed: { status: displayedStatus(a), firstConfirmedAt: a.first_playback_at, lastConfirmedAt: a.last_confirmed_at },
    lastActivity: {
      at,
      source: !at ? null : at === ownerAt ? "owner_action" : "sign_in",
      action: at && at === ownerAt ? ACTION[a.last_owner_action_kind || ""] ?? null : null,
      lastSignInAt: a.last_sign_in_at,
    },
    signupSource: {
      channel: channelFor(a),
      utmSource: a.utm_source, utmMedium: a.utm_medium, utmCampaign: a.utm_campaign, referrerHost: a.referrer_host,
    },
    internal: c.excluded,
    internalReason: c.excluded ? internalReason(a.excluded_reason, c.rule) : null,
    plusAliasHint: !!a.plus_alias,
    deletionPending: !!a.deletion_pending,
  };
}

export function userOnlyRow(u: ListUser, domains: readonly string[]): AccountRow {
  const internal = domains.includes((u.email_domain || "").toLowerCase());
  return {
    id: u.id,
    userOnly: true,
    email: u.email || "",
    registeredAt: u.user_created_at,
    emailConfirmed: !!u.user_confirmed,
    plan: null,
    trial: { status: "not_started", startedAt: null, endsAt: null, playbackEndsAt: null },
    subscription: { source: "none", status: null, plan: null, cancelAtPeriodEnd: false, currentPeriodEnd: null, mismatch: false },
    tv: { paired: false, activeScreens: 0, screensEver: 0, firstPairedAt: null, lastCheckInAt: null },
    displayed: { status: "no_tv", firstConfirmedAt: null, lastConfirmedAt: null },
    lastActivity: { at: u.last_sign_in_at, source: u.last_sign_in_at ? "sign_in" : null, action: null, lastSignInAt: u.last_sign_in_at },
    signupSource: { channel: t(u.user_created_at) < t(ATTRIBUTION_FROM) ? "not_tracked" : "direct", utmSource: null, utmMedium: null, utmCampaign: null, referrerHost: null },
    internal,
    internalReason: internal ? "internal_domain" : null,
    plusAliasHint: !!u.plus_alias,
    deletionPending: false,
  };
}

// ---------------------------------------------------------------- list
export function buildAccounts(input: { list: AccountsList; billing: BillingSnapshot; query: AccountsQuery; domains: readonly string[] }): DevAccounts {
  const { list, billing, query, domains } = input;
  const byAccount = new Map<string, BillingSub[]>();
  for (const s of billing.subs) {
    if (!s.accountId) continue;
    byAccount.set(s.accountId, [...(byAccount.get(s.accountId) ?? []), s]);
  }
  const all: AccountRow[] = [
    ...list.accounts.map((a) => accountRow(a, billing, byAccount.get(a.id) ?? [], domains)),
    ...list.users_without_account.map((u) => userOnlyRow(u, domains)),
  ];
  const counts = { customers: all.filter((r) => !r.internal).length, internal: all.filter((r) => r.internal).length, all: all.length };

  const inPop = all.filter((r) => query.population === "all" || (query.population === "internal" ? r.internal : !r.internal));
  const matched = query.q ? inPop.filter((r) => r.email.toLowerCase().includes(query.q)) : inPop;
  const sign = query.dir === "asc" ? 1 : -1;
  const key = (r: AccountRow): string => query.sort === "email" ? r.email.toLowerCase()
    : query.sort === "activity" ? (r.lastActivity.at || "")
    : r.registeredAt;
  const sorted = [...matched].sort((x, y) => {
    const kx = key(x), ky = key(y);
    // Rows with no activity always sort last.
    if (query.sort === "activity" && (!kx || !ky)) return kx === ky ? 0 : kx ? -1 : 1;
    return (kx < ky ? -1 : kx > ky ? 1 : x.id.localeCompare(y.id)) * sign;
  });
  const pages = Math.max(1, Math.ceil(sorted.length / query.pageSize));
  const page = Math.min(query.page, pages);
  const rows = sorted.slice((page - 1) * query.pageSize, page * query.pageSize);

  const notes: AccountsNote[] = [];
  if (!billing.available) notes.push({ key: "billingUnavailable" });
  else {
    notes.push({ key: "billingFromStripe" });
    if (billing.livemode === false) notes.push({ key: "billingTestMode" });
  }
  notes.push({ key: "activitySince", vars: { date: pacificDay(list.coverage.activity_from || ACTIVITY_FALLBACK_FROM) } });
  notes.push({ key: "displayedSince", vars: { date: pacificDay(DISPLAY_TRACKING_FROM) } });
  notes.push({ key: "attributionSince", vars: { date: pacificDay(ATTRIBUTION_FROM) } });

  return {
    generatedAt: list.generated_at,
    population: query.population,
    query: query.q,
    sort: query.sort,
    dir: query.dir,
    page,
    pageSize: query.pageSize,
    total: sorted.length,
    counts,
    billing: { available: billing.available, livemode: billing.livemode },
    rows,
    notes,
  };
}
