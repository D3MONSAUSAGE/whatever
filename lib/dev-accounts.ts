/**
 * DA-2 (t348u): shapes shared by the developer Customer Accounts API and page. Client-safe (no server imports).
 * One row per person who registered. Only the fields below ever leave the server: no passwords, tokens, Stripe
 * ids, card data, names, media, playlists, menus, messages, IPs or locations.
 */
import type { ChannelKey } from "@/lib/dev-analytics";

export const ACCOUNT_POPULATIONS = ["customers", "internal", "all"] as const;
export type AccountPopulation = (typeof ACCOUNT_POPULATIONS)[number];

export const ACCOUNT_SORTS = ["registered", "activity", "email"] as const;
export type AccountSort = (typeof ACCOUNT_SORTS)[number];

export const ACCOUNTS_PAGE_SIZE = 25;
export const ACCOUNTS_MAX_PAGE_SIZE = 100;

/** Why a row is internal/demo/test. Explicit list rows first, then the same rules the aggregate dashboard uses. */
export type InternalReason = "internal" | "qa" | "demo" | "reviewer" | "test" | "comp" | "internal_domain";

export type TrialStatus = "active" | "grace" | "expired" | "not_on_trial" | "not_started";

export type DisplayedStatus = "yes" | "not_yet" | "no_tv" | "unknown";

export type ActivityAction = "publish" | "upload" | "pair" | "content_change" | "schedule";

export type AccountRow = {
  /** Account id, or the user id when the person never reached an account ("userOnly"). */
  id: string;
  userOnly: boolean;
  email: string;
  registeredAt: string;
  emailConfirmed: boolean;
  /** Pekko plan id stored on the account (trial, starter, business, multi, grandfathered, comp), null before an account exists. */
  plan: string | null;
  trial: { status: TrialStatus; startedAt: string | null; endsAt: string | null; playbackEndsAt: string | null };
  subscription: {
    /** stripe = read from Stripe now; stored = Stripe unavailable, Pekko's last webhook copy; none = no subscription. */
    source: "stripe" | "stored" | "none";
    status: string | null;
    plan: string | null;
    cancelAtPeriodEnd: boolean;
    currentPeriodEnd: string | null;
    /** Stripe and Pekko's stored status disagree (webhook lag or a missed event). */
    mismatch: boolean;
  };
  tv: { paired: boolean; activeScreens: number; screensEver: number; firstPairedAt: string | null; lastCheckInAt: string | null };
  displayed: { status: DisplayedStatus; firstConfirmedAt: string | null; lastConfirmedAt: string | null };
  lastActivity: { at: string | null; source: "owner_action" | "sign_in" | null; action: ActivityAction | null; lastSignInAt: string | null };
  signupSource: { channel: ChannelKey; utmSource: string | null; utmMedium: string | null; utmCampaign: string | null; referrerHost: string | null };
  internal: boolean;
  internalReason: InternalReason | null;
  /** A "+alias" address: only a hint for review, it never marks a row internal by itself. */
  plusAliasHint: boolean;
  deletionPending: boolean;
};

export type AccountsNoteKey = "billingFromStripe" | "billingUnavailable" | "billingTestMode" | "activitySince" | "attributionSince" | "displayedSince";
export type AccountsNote = { key: AccountsNoteKey; vars?: Record<string, string | number> };

export type DevAccounts = {
  generatedAt: string;
  population: AccountPopulation;
  query: string;
  sort: AccountSort;
  dir: "asc" | "desc";
  page: number;
  pageSize: number;
  /** Rows matching population + search. */
  total: number;
  counts: { customers: number; internal: number; all: number };
  billing: { available: boolean; livemode: boolean | null };
  rows: AccountRow[];
  notes: AccountsNote[];
};

/** Every key a row may carry. Tests assert responses never contain anything else. */
export const ACCOUNT_ROW_KEYS = [
  "id", "userOnly", "email", "registeredAt", "emailConfirmed", "plan", "trial", "subscription", "tv", "displayed",
  "lastActivity", "signupSource", "internal", "internalReason", "plusAliasHint", "deletionPending",
] as const;
