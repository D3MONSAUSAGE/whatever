/**
 * DA-1 (t337u Phase 1): shapes shared by the developer analytics API and page. Client-safe (no server imports).
 * Every number here is an aggregate. Group counts under SMALL_GROUP_MIN are sent as null ("<3").
 */

export const RANGE_PRESETS = ["today", "7d", "30d", "90d", "custom"] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

/** Groups (cohorts, sources, funnel steps, retention cells, usage buckets) smaller than this are hidden. */
export const SMALL_GROUP_MIN = 3;

/** null = hidden because the group has fewer than SMALL_GROUP_MIN accounts. */
export type GroupCount = number | null;
/** 0..1, or null when the denominator is hidden or zero. */
export type Rate = number | null;

export type NoteKey =
  | "trialsBeforeBilling"
  | "activitySince"
  | "uptimeSince"
  | "attributionSince"
  | "notMature"
  | "playlistCaveat"
  | "firstDisplayRetention"
  | "firstPlaybackWindow"
  | "billingFromStripe"
  | "billingUnavailable"
  | "billingTestMode"
  | "mrrBeforeDiscounts"
  | "unmappedSubscriptions"
  | "smallGroups"
  | "internalIncluded"
  | "usersOneOwner"
  | "activeDefinition"
  | "funnelStrict"
  | "trialAutoStarts"
  | "onboardingBackfill";

export type Note = { key: NoteKey; vars?: Record<string, string | number> };

export type FunnelStepKey = "registered" | "trialStarted" | "tvPaired" | "contentDisplayed" | "playlistCreated" | "paid";

export type FunnelStep = {
  key: FunnelStepKey;
  /** Accounts that reached this step and every step before it. */
  reached: GroupCount;
  /** Accounts that reached this step in any order. */
  anyOrder: GroupCount;
  fromPrevious: Rate;
  dropOff: Rate;
  fromRegistered: Rate;
  notes: Note[];
};

export type RetentionCell = { day: 7 | 14 | 30; eligible: number; retained: GroupCount; rate: Rate; matureOn: string | null };

export type CohortRow = {
  weekStart: string;
  size: GroupCount;
  tvPaired: Rate;
  contentDisplayed: Rate;
  paid: Rate;
  d7: Rate;
};

export type ChannelKey = "meta" | "google_ads" | "google_organic" | "referral" | "campaign_other" | "direct" | "not_tracked";

export type ReviewCandidate = { accountId: string; rule: "internal_domain" | "comp" | "plus_alias"; createdAt: string; excludedByDefault: boolean };

export type DevAnalytics = {
  generatedAt: string;
  range: { preset: RangePreset; from: string; to: string; fromDay: string; toDay: string; timeZone: string };
  population: {
    includeInternal: boolean;
    customerAccounts: number;
    excludedExplicit: number;
    excludedByRule: number;
  };
  overview: {
    accounts: { total: number; newInRange: number };
    users: { total: number; newInRange: number; confirmedNewInRange: number; withoutAccount: number };
    screens: { connected: number; onlineNow: number; pairedInRange: number };
    trials: { active: number; grace: number; expired: number; startedInRange: number };
    billing: {
      available: boolean;
      livemode: boolean | null;
      paying: number;
      stripeTrialing: number;
      canceledInRange: number;
      scheduledToCancel: number;
      mrr: { amount: number; currency: string } | null;
      excludedSubscriptions: number;
      unmappedSubscriptions: number;
    };
    notes: Note[];
  };
  funnel: { cohort: number; steps: FunnelStep[]; notes: Note[] };
  engagement: {
    active: { days: 1 | 7 | 30; owner: number; screens: number; either: number }[];
    screens: { connected: number; onlineNow: number; lastCheckIn: { lt1h: number; lt24h: number; lt7d: number; older: number; never: number } };
    publishing: { publishes: number; contentChanges: number; uploads: number; scheduleChanges: number; accounts: number; daily: { day: string; publishes: number; contentChanges: number }[] };
    repeat: { activeAccounts: number; oneDay: GroupCount; twoToThreeDays: GroupCount; fourPlusDays: GroupCount; multiWeek: GroupCount };
    notes: Note[];
  };
  retention: {
    cells: RetentionCell[];
    cohorts: CohortRow[];
    trialToPaid: { ended: number; converted: GroupCount; rate: Rate };
    timeToFirstTv: { accounts: number; medianHours: number | null; p75Hours: number | null };
    timeToFirstDisplay: { accounts: number; medianHours: number | null; p75Hours: number | null };
    stopped: { activated: number; dormant14: GroupCount; dormant30: GroupCount; billingCanceledInRange: number };
    notes: Note[];
  };
  attribution: {
    cohort: number;
    channels: { key: ChannelKey; accounts: GroupCount }[];
    sources: { source: string; accounts: number }[];
    smallSources: number;
    notes: Note[];
  };
  review: { candidates: ReviewCandidate[]; insertTemplate: string };
  /** Menu-first onboarding (0036 milestones) for accounts created in range. Absent before 0036 is applied. */
  onboarding?: OnboardingFunnel;
};

export type OnboardingStepKey = "first_menu" | "preview_menu" | "customize_menu" | "screen" | "show_on_tv" | "first_update" | "playlists" | "schedules";
export type HoursSummary = { accounts: number; medianHours: number | null; p75Hours: number | null };
export type OnboardingFunnel = {
  cohort: number;
  steps: { key: OnboardingStepKey; required: boolean; reached: GroupCount; rate: Rate }[];
  completed: GroupCount;
  completedRate: Rate;
  /** Of accounts with both a first menu and a TV: the share that made the menu first. */
  contentBeforeTv: Rate;
  timeToFirstContent: HoursSummary;
  contentToTv: HoursSummary;
  /** Paid conversion for menu-first vs TV-first accounts (null under the small-group floor). */
  paidContentFirst: Rate;
  paidTvFirst: Rate;
  notes: Note[];
};
