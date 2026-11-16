import type { BillingSnapshot } from "@/lib/server/dev-analytics/stripe-source";
import type { SnapAccount, Snapshot } from "@/lib/server/dev-analytics/metrics";

/** DA-1 fixture: 6 customers (gmail, hotmail, guanatostacos, one +alias), 1 rule-excluded, 1 listed, 1 comp. */
export const NOW = new Date("2026-11-15T20:00:00Z");
const H = 3_600_000;
const at = (iso: string, plusHours = 0) => new Date(Date.parse(iso) + plusHours * H).toISOString();

export const ID = {
  c1: "c1000000-0000-4000-8000-000000000001",
  c2: "c2000000-0000-4000-8000-000000000002",
  c3: "c3000000-0000-4000-8000-000000000003",
  c4: "c4000000-0000-4000-8000-000000000004",
  c5: "c5000000-0000-4000-8000-000000000005",
  p1: "c6000000-0000-4000-8000-000000000006",
  qa: "e1000000-0000-4000-8000-000000000001",
  listed: "e2000000-0000-4000-8000-000000000002",
  comp: "e3000000-0000-4000-8000-000000000003",
} as const;

function acct(id: string, created: string, domain: string, extra: Partial<SnapAccount> = {}): SnapAccount {
  return {
    id, created_at: created, plan: "trial", trial_started_at: created, trial_ends_at: at(created, 14 * 24),
    subscription_status: null, comp: false, user_created_at: created, user_confirmed: true, email_domain: domain,
    plus_alias: false, excluded_reason: null, utm_source: null, utm_medium: null, utm_campaign: null,
    referrer_host: null, attribution_at: null, ...extra,
  };
}

export function snapshot(): Snapshot {
  return {
    generated_at: NOW.toISOString(),
    since: "2026-10-01T00:00:00Z",
    accounts: [
      acct(ID.c1, "2026-11-01T18:00:00Z", "gmail.com", { plan: "multi", subscription_status: "active" }),
      acct(ID.c2, "2026-11-02T18:00:00Z", "hotmail.com"),
      acct(ID.c3, "2026-11-03T18:00:00Z", "guanatostacos.com"),
      acct(ID.c4, "2026-11-05T18:00:00Z", "gmail.com", { trial_ends_at: "2026-11-14T18:00:00Z" }),
      acct(ID.c5, "2026-11-13T18:00:00Z", "gmail.com", { utm_source: "facebook", utm_medium: "paid", attribution_at: "2026-11-13T18:00:00Z" }),
      acct(ID.p1, "2026-11-14T18:00:00Z", "outlook.com", { plus_alias: true, user_confirmed: false }),
      acct(ID.qa, "2026-11-06T18:00:00Z", "mail.grokbot.com"),
      acct(ID.listed, "2026-11-07T18:00:00Z", "gmail.com", { excluded_reason: "reviewer" }),
      acct(ID.comp, "2026-11-08T18:00:00Z", "yahoo.com", { comp: true, plan: "multi" }),
    ],
    orphan_users: [
      { created_at: "2026-11-10T18:00:00Z", confirmed: false, email_domain: "gmail.com", plus_alias: false },
      { created_at: "2026-11-10T18:00:00Z", confirmed: true, email_domain: "example.com", plus_alias: false },
    ],
    displays: [
      { account_id: ID.c1, created_at: at("2026-11-01T18:00:00Z", 2), status: "active", last_seen_at: at(NOW.toISOString(), -0.01), ever_confirmed: true },
      { account_id: ID.c2, created_at: at("2026-11-02T18:00:00Z", 4), status: "active", last_seen_at: at(NOW.toISOString(), -3), ever_confirmed: true },
      { account_id: ID.c3, created_at: at("2026-11-03T18:00:00Z", 6), status: "active", last_seen_at: null, ever_confirmed: true },
      { account_id: ID.qa, created_at: "2026-11-06T19:00:00Z", status: "active", last_seen_at: NOW.toISOString(), ever_confirmed: true },
    ],
    first_playback: [
      { account_id: ID.c1, at: at("2026-11-01T18:00:00Z", 3) },
      { account_id: ID.c2, at: at("2026-11-02T18:00:00Z", 5) },
      { account_id: ID.qa, at: "2026-11-06T20:00:00Z" },
    ],
    first_playlist: [
      { account_id: ID.c1, at: at("2026-11-01T18:00:00Z", 1) },
      { account_id: ID.c2, at: at("2026-11-02T18:00:00Z", 1) },
      { account_id: ID.c3, at: at("2026-11-03T18:00:00Z", 1) },
    ],
    activity: [
      { account_id: ID.c1, at: "2026-11-15T10:00:00Z", kind: "playlist.published" },
      { account_id: ID.c1, at: "2026-11-09T18:00:00Z", kind: "media.uploaded" },
      { account_id: ID.c2, at: "2026-11-14T18:00:00Z", kind: "screen.content_changed" },
      { account_id: ID.qa, at: "2026-11-15T10:00:00Z", kind: "playlist.published" },
    ],
    screen_days: [{ account_id: ID.c2, day: "2026-11-15" }, { account_id: ID.qa, day: "2026-11-15" }],
    coverage: { activity_from: "2026-10-30T03:06:54Z", uptime_from: "2026-10-31T00:00:00Z", playback_from: "2026-10-29T00:00:00Z" },
  };
}

export function billing(): BillingSnapshot {
  const sub = (accountId: string | null, status: string, extra: Partial<BillingSnapshot["subs"][number]> = {}) => ({
    accountId, status, createdAt: "2026-11-02T00:00:00Z", canceledAt: null, cancelAtPeriodEnd: false,
    monthlyAmount: 5900, currency: "usd", livemode: true, ...extra,
  });
  return {
    available: true,
    livemode: true,
    subs: [
      sub(ID.c1, "active"),
      sub(ID.qa, "active", { cancelAtPeriodEnd: true }),
      sub("ffffffff-0000-4000-8000-00000000ffff", "active"),
    ],
  };
}
