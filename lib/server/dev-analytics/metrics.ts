import {
  SMALL_GROUP_MIN, type ChannelKey, type CohortRow, type DevAnalytics, type FunnelStep, type FunnelStepKey,
  type GroupCount, type Note, type Rate, type RetentionCell,
} from "@/lib/dev-analytics";
import { classifyAccount, INSERT_TEMPLATE, reviewCandidates } from "./exclusions";
import { addDays, pacificDay, pacificWeekStart, TIME_ZONE, type Range } from "./range";
import type { BillingSnapshot, BillingSub } from "./stripe-source";

// ---------------------------------------------------------------- snapshot (from dev_analytics_snapshot)
export type SnapAccount = {
  id: string;
  created_at: string;
  plan: string | null;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  subscription_status: string | null;
  comp: boolean;
  user_created_at: string | null;
  user_confirmed: boolean;
  email_domain: string | null;
  plus_alias: boolean;
  excluded_reason: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  referrer_host: string | null;
  attribution_at: string | null;
};
export type Snapshot = {
  generated_at: string;
  since: string;
  accounts: SnapAccount[];
  orphan_users: { created_at: string; confirmed: boolean; email_domain: string | null; plus_alias: boolean }[];
  displays: { account_id: string; created_at: string; status: string; last_seen_at: string | null; ever_confirmed: boolean }[];
  first_playback: { account_id: string; at: string }[];
  first_playlist: { account_id: string; at: string }[];
  activity: { account_id: string; at: string; kind: string }[];
  screen_days: { account_id: string; day: string }[];
  coverage: { activity_from: string | null; uptime_from: string | null; playback_from: string | null };
};

// ---------------------------------------------------------------- fixed facts (prod migration times)
/** 0013_billing_entitlements applied: trial dates before this were set or reset by billing migrations. */
export const BILLING_TRIALS_FROM = "2026-11-04T03:43:51Z";
/** 0024_signup_attribution applied: first-visit capture starts here. */
export const ATTRIBUTION_FROM = "2026-11-12T22:55:33Z";
/** Earliest analytics row in production, used if the snapshot has no coverage dates. */
export const ACTIVITY_FALLBACK_FROM = "2026-10-30T03:06:54Z";

/** Meaningful owner actions. App opens, logins and screen.content_changed (can be system-driven) are not. */
export const OWNER_KINDS = new Set(["media.uploaded", "playlist.published", "screen.paired", "schedule.created", "schedule.updated", "schedule.deleted"]);
const PAYING = new Set(["active", "past_due"]);
const NOT_STARTED = new Set(["incomplete", "incomplete_expired"]);
const TRIAL_DAYS = 14;
const TRIAL_GRACE_DAYS = 3;
const ONLINE_MS = 90_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

const t = (s: string | null | undefined) => (s ? Date.parse(s) : NaN);
const inRange = (s: string | null | undefined, r: { from: Date; to: Date }) => {
  const x = t(s);
  return Number.isFinite(x) && x >= r.from.getTime() && x < r.to.getTime();
};

export function suppress(n: number): GroupCount {
  return n > 0 && n < SMALL_GROUP_MIN ? null : n;
}
export function rate(num: number, den: number): Rate {
  if (den < SMALL_GROUP_MIN) return null;
  if (num > 0 && num < SMALL_GROUP_MIN) return null;
  return den === 0 ? null : num / den;
}
export function quantile(values: number[], q: number): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}
const dayNote = (key: Note["key"], iso: string): Note => ({ key, vars: { date: pacificDay(iso) } });

// ---------------------------------------------------------------- attribution
const META = new Set(["facebook", "fb", "instagram", "ig", "meta"]);
const META_HOSTS = /(^|\.)(facebook\.com|instagram\.com|fb\.com)$/;
const PAID = new Set(["cpc", "ppc", "paid", "paid_search", "paidsearch"]);
const SELF_HOSTS = /(^|\.)(pekkotv\.com|pantalla-chi\.vercel\.app|localhost)$/;

export function channelFor(a: Pick<SnapAccount, "utm_source" | "utm_medium" | "utm_campaign" | "referrer_host" | "created_at">): ChannelKey {
  const src = (a.utm_source || "").toLowerCase().trim();
  const med = (a.utm_medium || "").toLowerCase().trim();
  const host = (a.referrer_host || "").toLowerCase();
  const external = host && !SELF_HOSTS.test(host) ? host : "";
  if (META.has(src) || (!src && META_HOSTS.test(external))) return "meta";
  if (src === "google" || src === "adwords") return PAID.has(med) ? "google_ads" : "google_organic";
  if (src || a.utm_campaign) return "campaign_other";
  if (/(^|\.)google\.[a-z.]+$/.test(external)) return "google_organic";
  if (external) return "referral";
  return t(a.created_at) < t(ATTRIBUTION_FROM) ? "not_tracked" : "direct";
}

// ---------------------------------------------------------------- main
export type ComputeInput = {
  snapshot: Snapshot;
  billing: BillingSnapshot;
  range: Range;
  now: Date;
  includeInternal: boolean;
  domains: readonly string[];
};

export function computeDashboard(input: ComputeInput): DevAnalytics {
  const { snapshot: s, billing, range, now, includeInternal, domains } = input;
  const nowMs = now.getTime();

  // Population
  let excludedExplicit = 0;
  let excludedByRule = 0;
  const customers = s.accounts.filter((a) => {
    const c = classifyAccount(a, domains);
    if (c.explicit) excludedExplicit++;
    else if (c.excluded) excludedByRule++;
    return includeInternal || !c.excluded;
  });
  const ids = new Set(customers.map((a) => a.id));
  const orphans = s.orphan_users.filter((u) => includeInternal || !domains.includes((u.email_domain || "").toLowerCase()));

  // Per-account facts
  const displays = s.displays.filter((d) => ids.has(d.account_id));
  const firstTv = new Map<string, number>();
  const everConfirmed = new Set<string>();
  for (const d of displays) {
    const x = t(d.created_at);
    if (!firstTv.has(d.account_id) || x < firstTv.get(d.account_id)!) firstTv.set(d.account_id, x);
    if (d.ever_confirmed) everConfirmed.add(d.account_id);
  }
  const firstPlay = new Map(s.first_playback.filter((p) => ids.has(p.account_id)).map((p) => [p.account_id, t(p.at)]));
  const firstPlaylist = new Map(s.first_playlist.filter((p) => ids.has(p.account_id)).map((p) => [p.account_id, t(p.at)]));
  const activity = s.activity.filter((e) => ids.has(e.account_id));
  const ownerActivity = activity.filter((e) => OWNER_KINDS.has(e.kind));
  const screenDays = s.screen_days.filter((d) => ids.has(d.account_id));

  // Stripe, mapped to accounts. Subscriptions on excluded or unknown accounts never count as customers.
  const allIds = new Set(s.accounts.map((a) => a.id));
  let unmapped = 0;
  let excludedSubs = 0;
  const subs: BillingSub[] = [];
  for (const sub of billing.subs) {
    if (!sub.accountId || !allIds.has(sub.accountId)) { unmapped++; continue; }
    if (!ids.has(sub.accountId)) { excludedSubs++; continue; }
    subs.push(sub);
  }
  const paidStart = new Map<string, number>();
  for (const sub of subs) {
    if (NOT_STARTED.has(sub.status)) continue;
    const x = t(sub.createdAt);
    if (!paidStart.has(sub.accountId!) || x < paidStart.get(sub.accountId!)!) paidStart.set(sub.accountId!, x);
  }

  const coverageActivity = s.coverage.activity_from || ACTIVITY_FALLBACK_FROM;
  const coverageUptime = s.coverage.uptime_from || coverageActivity;
  const commonNotes: Note[] = [];
  if (includeInternal) commonNotes.push({ key: "internalIncluded" });

  // ------------------------------------------------ overview
  const trialEnd = (a: SnapAccount) => {
    const end = t(a.trial_ends_at);
    if (Number.isFinite(end)) return end;
    return t(a.trial_started_at || a.created_at) + TRIAL_DAYS * DAY;
  };
  let trialActive = 0, trialGrace = 0, trialExpired = 0;
  for (const a of customers) {
    if (a.plan !== "trial") continue;
    const end = trialEnd(a);
    if (nowMs < end) trialActive++;
    else if (nowMs < end + TRIAL_GRACE_DAYS * DAY) trialGrace++;
    else trialExpired++;
  }
  const payingSubs = subs.filter((x) => PAYING.has(x.status));
  const currencies = new Map<string, number>();
  for (const x of payingSubs) currencies.set(x.currency, (currencies.get(x.currency) ?? 0) + x.monthlyAmount);
  const topCurrency = [...currencies.entries()].sort((a, b) => b[1] - a[1])[0];
  const connected = displays.filter((d) => d.status === "active");
  const onlineNow = connected.filter((d) => nowMs - t(d.last_seen_at) <= ONLINE_MS).length;
  const billingNotes: Note[] = [{ key: "billingFromStripe" }, { key: "mrrBeforeDiscounts" }];
  if (!billing.available) billingNotes.push({ key: "billingUnavailable" });
  else if (billing.livemode === false) billingNotes.push({ key: "billingTestMode" });
  if (unmapped) billingNotes.push({ key: "unmappedSubscriptions", vars: { n: unmapped } });

  const overview: DevAnalytics["overview"] = {
    accounts: { total: customers.length, newInRange: customers.filter((a) => inRange(a.created_at, range)).length },
    users: {
      total: customers.length + orphans.length,
      newInRange: customers.filter((a) => inRange(a.user_created_at, range)).length + orphans.filter((u) => inRange(u.created_at, range)).length,
      confirmedNewInRange: customers.filter((a) => a.user_confirmed && inRange(a.user_created_at, range)).length + orphans.filter((u) => u.confirmed && inRange(u.created_at, range)).length,
      withoutAccount: orphans.length,
    },
    screens: { connected: connected.length, onlineNow, pairedInRange: displays.filter((d) => inRange(d.created_at, range)).length },
    trials: {
      active: trialActive, grace: trialGrace, expired: trialExpired,
      startedInRange: customers.filter((a) => inRange(a.trial_started_at, range)).length,
    },
    billing: {
      available: billing.available,
      livemode: billing.livemode,
      paying: new Set(payingSubs.map((x) => x.accountId)).size,
      stripeTrialing: subs.filter((x) => x.status === "trialing").length,
      canceledInRange: subs.filter((x) => inRange(x.canceledAt, range)).length,
      scheduledToCancel: payingSubs.filter((x) => x.cancelAtPeriodEnd).length,
      mrr: billing.available ? { amount: topCurrency?.[1] ?? 0, currency: topCurrency?.[0] ?? "usd" } : null,
      excludedSubscriptions: excludedSubs,
      unmappedSubscriptions: unmapped,
    },
    notes: [...commonNotes, { key: "usersOneOwner" }, dayNote("trialsBeforeBilling", BILLING_TRIALS_FROM), { key: "trialAutoStarts" }, ...billingNotes],
  };

  // ------------------------------------------------ funnel (cohort = accounts created in range)
  const cohort = customers.filter((a) => inRange(a.created_at, range));
  const reachedAny: Record<FunnelStepKey, (a: SnapAccount) => boolean> = {
    registered: () => true,
    trialStarted: (a) => !!a.trial_started_at,
    tvPaired: (a) => firstTv.has(a.id),
    contentDisplayed: (a) => firstPlay.has(a.id) || everConfirmed.has(a.id),
    playlistCreated: (a) => firstPlaylist.has(a.id),
    paid: (a) => paidStart.has(a.id),
  };
  const order: FunnelStepKey[] = ["registered", "trialStarted", "tvPaired", "contentDisplayed", "playlistCreated", "paid"];
  const stepNotes: Partial<Record<FunnelStepKey, Note[]>> = {
    trialStarted: [dayNote("trialsBeforeBilling", BILLING_TRIALS_FROM), { key: "trialAutoStarts" }],
    contentDisplayed: [{ key: "firstDisplayRetention" }, { key: "firstPlaybackWindow" }],
    playlistCreated: [{ key: "playlistCaveat" }],
    paid: billingNotes.filter((n) => n.key !== "mrrBeforeDiscounts"),
  };
  let pool = cohort;
  const registeredN = cohort.length;
  let prevN = registeredN;
  const steps: FunnelStep[] = order.map((key, i) => {
    pool = pool.filter(reachedAny[key]);
    const n = pool.length;
    const any = cohort.filter(reachedAny[key]).length;
    const fromPrev = i === 0 ? rate(n, n) : rate(n, prevN);
    const step: FunnelStep = {
      key,
      reached: suppress(n),
      anyOrder: suppress(any),
      fromPrevious: i === 0 ? null : fromPrev,
      dropOff: i === 0 || fromPrev === null ? null : 1 - fromPrev,
      fromRegistered: i === 0 ? null : rate(n, registeredN),
      notes: stepNotes[key] ?? [],
    };
    prevN = n;
    return step;
  });

  // ------------------------------------------------ engagement
  const anchor = Math.min(range.to.getTime(), nowMs);
  const anchorDay = pacificDay(anchor);
  const activeIn = (days: number) => {
    const since = anchor - days * DAY;
    const firstDay = addDays(anchorDay, -(days - 1));
    const owner = new Set(ownerActivity.filter((e) => t(e.at) >= since && t(e.at) < anchor).map((e) => e.account_id));
    const screens = new Set(screenDays.filter((d) => d.day >= firstDay && d.day <= anchorDay).map((d) => d.account_id));
    return { owner: owner.size, screens: screens.size, either: new Set([...owner, ...screens]).size };
  };
  const lastCheckIn = { lt1h: 0, lt24h: 0, lt7d: 0, older: 0, never: 0 };
  for (const d of connected) {
    const age = nowMs - t(d.last_seen_at);
    if (!Number.isFinite(age)) lastCheckIn.never++;
    else if (age < HOUR) lastCheckIn.lt1h++;
    else if (age < DAY) lastCheckIn.lt24h++;
    else if (age < 7 * DAY) lastCheckIn.lt7d++;
    else lastCheckIn.older++;
  }
  const rangeActivity = activity.filter((e) => inRange(e.at, range));
  const daily = new Map<string, { publishes: number; contentChanges: number }>();
  for (let d = range.fromDay, i = 0; d <= range.toDay && i < 400; d = addDays(d, 1), i++) daily.set(d, { publishes: 0, contentChanges: 0 });
  for (const e of rangeActivity) {
    const row = daily.get(pacificDay(e.at));
    if (!row) continue;
    if (e.kind === "playlist.published") row.publishes++;
    if (e.kind === "screen.content_changed") row.contentChanges++;
  }
  const ownerDays = new Map<string, Set<string>>();
  const ownerWeeks = new Map<string, Set<string>>();
  for (const e of rangeActivity) {
    if (!OWNER_KINDS.has(e.kind)) continue;
    if (!ownerDays.has(e.account_id)) { ownerDays.set(e.account_id, new Set()); ownerWeeks.set(e.account_id, new Set()); }
    ownerDays.get(e.account_id)!.add(pacificDay(e.at));
    ownerWeeks.get(e.account_id)!.add(pacificWeekStart(e.at));
  }
  const dayCounts = [...ownerDays.values()].map((x) => x.size);
  const engagement: DevAnalytics["engagement"] = {
    active: ([1, 7, 30] as const).map((days) => ({ days, ...activeIn(days) })),
    screens: { connected: connected.length, onlineNow, lastCheckIn },
    publishing: {
      publishes: rangeActivity.filter((e) => e.kind === "playlist.published").length,
      contentChanges: rangeActivity.filter((e) => e.kind === "screen.content_changed").length,
      uploads: rangeActivity.filter((e) => e.kind === "media.uploaded").length,
      scheduleChanges: rangeActivity.filter((e) => e.kind.startsWith("schedule.")).length,
      accounts: new Set(rangeActivity.filter((e) => e.kind === "playlist.published" || e.kind === "screen.content_changed").map((e) => e.account_id)).size,
      daily: [...daily.entries()].map(([day, v]) => ({ day, ...v })),
    },
    repeat: {
      activeAccounts: ownerDays.size,
      oneDay: suppress(dayCounts.filter((n) => n === 1).length),
      twoToThreeDays: suppress(dayCounts.filter((n) => n >= 2 && n <= 3).length),
      fourPlusDays: suppress(dayCounts.filter((n) => n >= 4).length),
      multiWeek: suppress([...ownerWeeks.values()].filter((w) => w.size >= 2).length),
    },
    notes: [...commonNotes, { key: "activeDefinition" }, dayNote("activitySince", coverageActivity), dayNote("uptimeSince", coverageUptime), { key: "smallGroups" }],
  };

  // ------------------------------------------------ retention
  const activeBetween = (accountId: string, fromMs: number, toMs: number) => {
    if (ownerActivity.some((e) => e.account_id === accountId && t(e.at) >= fromMs && t(e.at) < toMs)) return true;
    const a = pacificDay(fromMs);
    const b = pacificDay(toMs - 1);
    return screenDays.some((d) => d.account_id === accountId && d.day >= a && d.day <= b);
  };
  const retentionNotes: Note[] = [...commonNotes, dayNote("activitySince", coverageActivity), { key: "smallGroups" }];
  const cells: RetentionCell[] = ([7, 14, 30] as const).map((day) => {
    const eligible = cohort.filter((a) => t(a.created_at) + (day + 7) * DAY <= nowMs);
    const retained = eligible.filter((a) => activeBetween(a.id, t(a.created_at) + day * DAY, t(a.created_at) + (day + 7) * DAY)).length;
    let matureOn: string | null = null;
    if (!eligible.length && cohort.length) {
      const earliest = Math.min(...cohort.map((a) => t(a.created_at)));
      matureOn = pacificDay(earliest + (day + 7) * DAY);
      retentionNotes.push({ key: "notMature", vars: { day, date: matureOn } });
    }
    return { day, eligible: eligible.length, retained: suppress(retained), rate: rate(retained, eligible.length), matureOn };
  });
  const weeks = new Map<string, SnapAccount[]>();
  for (const a of cohort) {
    const w = pacificWeekStart(a.created_at);
    weeks.set(w, [...(weeks.get(w) ?? []), a]);
  }
  const cohorts: CohortRow[] = [...weeks.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([weekStart, list]) => {
    const n = list.length;
    const d7Eligible = list.filter((a) => t(a.created_at) + 14 * DAY <= nowMs);
    return {
      weekStart,
      size: suppress(n),
      tvPaired: rate(list.filter((a) => firstTv.has(a.id)).length, n),
      contentDisplayed: rate(list.filter(reachedAny.contentDisplayed).length, n),
      paid: rate(list.filter((a) => paidStart.has(a.id)).length, n),
      d7: rate(d7Eligible.filter((a) => activeBetween(a.id, t(a.created_at) + 7 * DAY, t(a.created_at) + 14 * DAY)).length, d7Eligible.length),
    };
  });
  const trialEnded = customers.filter((a) => a.trial_started_at && inRange(new Date(trialEnd(a)).toISOString(), { from: range.from, to: new Date(anchor) }));
  const converted = trialEnded.filter((a) => paidStart.has(a.id)).length;
  const hoursTo = (m: Map<string, number>) => cohort.filter((a) => m.has(a.id)).map((a) => Math.max(0, (m.get(a.id)! - t(a.created_at)) / HOUR));
  const tvHours = hoursTo(firstTv);
  const playHours = hoursTo(firstPlay);
  const summary = (h: number[]) => ({
    accounts: h.length,
    medianHours: h.length >= SMALL_GROUP_MIN ? quantile(h, 0.5) : null,
    p75Hours: h.length >= SMALL_GROUP_MIN ? quantile(h, 0.75) : null,
  });
  const activated = customers.filter((a) => firstTv.has(a.id));
  const dormant = (days: number) => activated.filter((a) => !activeBetween(a.id, nowMs - days * DAY, nowMs + 1)).length;
  const retention: DevAnalytics["retention"] = {
    cells,
    cohorts,
    trialToPaid: { ended: trialEnded.length, converted: suppress(converted), rate: rate(converted, trialEnded.length) },
    timeToFirstTv: summary(tvHours),
    timeToFirstDisplay: summary(playHours),
    stopped: { activated: activated.length, dormant14: suppress(dormant(14)), dormant30: suppress(dormant(30)), billingCanceledInRange: overview.billing.canceledInRange },
    notes: [...retentionNotes, { key: "firstDisplayRetention" }, { key: "firstPlaybackWindow" }, ...billingNotes.filter((n) => n.key !== "mrrBeforeDiscounts")],
  };

  // ------------------------------------------------ attribution (cohort, aggregate only)
  const channelCounts = new Map<ChannelKey, number>();
  const sourceCounts = new Map<string, number>();
  for (const a of cohort) {
    const ch = channelFor(a);
    channelCounts.set(ch, (channelCounts.get(ch) ?? 0) + 1);
    const src = (a.utm_source || "").toLowerCase().trim().slice(0, 40);
    if (src) sourceCounts.set(src, (sourceCounts.get(src) ?? 0) + 1);
  }
  const channelOrder: ChannelKey[] = ["meta", "google_ads", "google_organic", "referral", "campaign_other", "direct", "not_tracked"];
  const sources = [...sourceCounts.entries()].filter(([, n]) => n >= SMALL_GROUP_MIN).sort((a, b) => b[1] - a[1]).map(([source, accounts]) => ({ source, accounts }));
  const smallSources = [...sourceCounts.values()].filter((n) => n < SMALL_GROUP_MIN).reduce((x, y) => x + y, 0);
  const attribution: DevAnalytics["attribution"] = {
    cohort: cohort.length,
    channels: channelOrder.map((key) => ({ key, accounts: suppress(channelCounts.get(key) ?? 0) })),
    sources,
    smallSources,
    notes: [...commonNotes, dayNote("attributionSince", ATTRIBUTION_FROM), { key: "smallGroups" }],
  };

  return {
    generatedAt: now.toISOString(),
    range: { preset: range.preset, from: range.from.toISOString(), to: range.to.toISOString(), fromDay: range.fromDay, toDay: range.toDay, timeZone: TIME_ZONE },
    population: { includeInternal, customerAccounts: customers.length, excludedExplicit, excludedByRule },
    overview,
    funnel: { cohort: cohort.length, steps, notes: [...commonNotes, { key: "funnelStrict" }, { key: "smallGroups" }] },
    engagement,
    retention,
    attribution,
    review: { candidates: reviewCandidates(s.accounts, domains), insertTemplate: INSERT_TEMPLATE },
  };
}
