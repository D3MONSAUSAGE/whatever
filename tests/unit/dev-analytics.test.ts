import { describe, expect, it } from "vitest";
import { classifyAccount, DEFAULT_INTERNAL_DOMAINS, internalDomains, reviewCandidates } from "@/lib/server/dev-analytics/exclusions";
import { channelFor, computeDashboard, quantile, rate, suppress } from "@/lib/server/dev-analytics/metrics";
import { pacificDay, pacificMidnight, pacificWeekStart, parseRange } from "@/lib/server/dev-analytics/range";
import { toBillingSub } from "@/lib/server/dev-analytics/stripe-source";
import type Stripe from "stripe";
import { billing, ID, NOW, snapshot } from "../fixtures/dev-analytics";

const domains = [...DEFAULT_INTERNAL_DOMAINS];
const range30 = () => parseRange(new URLSearchParams("range=30d"), NOW)!;
const run = (includeInternal = false, b = billing()) =>
  computeDashboard({ snapshot: snapshot(), billing: b, range: range30(), now: NOW, includeInternal, domains });

describe("DA-1 small-group suppression", () => {
  it("hides counts of 1 or 2 and rates with small parts", () => {
    expect([0, 1, 2, 3, 10].map(suppress)).toEqual([0, null, null, 3, 10]);
    expect(rate(0, 5)).toBe(0);
    expect(rate(1, 5)).toBeNull();
    expect(rate(3, 2)).toBeNull();
    expect(rate(3, 6)).toBe(0.5);
    expect(rate(0, 0)).toBeNull();
  });
  it("interpolates quantiles", () => {
    expect(quantile([2, 4, 6], 0.5)).toBe(4);
    expect(quantile([2, 4, 6], 0.75)).toBe(5);
    expect(quantile([], 0.5)).toBeNull();
  });
});

describe("DA-1 exclusions", () => {
  it("never flags real customers on public or own domains (t340u)", () => {
    for (const domain of ["public-mail.test", "other-mail.test", "customer-biz.test"]) {
      expect(classifyAccount({ id: "x", created_at: NOW.toISOString(), comp: false, email_domain: domain, plus_alias: false, excluded_reason: null }, domains))
        .toEqual({ excluded: false, explicit: false, rule: null });
    }
  });
  it("excludes listed, comp and internal-domain accounts; a +alias is review-only", () => {
    const base = { id: "x", created_at: NOW.toISOString(), comp: false, email_domain: "public-mail.test", plus_alias: false, excluded_reason: null };
    expect(classifyAccount({ ...base, excluded_reason: "qa" }, domains).excluded).toBe(true);
    expect(classifyAccount({ ...base, comp: true }, domains)).toMatchObject({ excluded: true, rule: "comp" });
    expect(classifyAccount({ ...base, email_domain: "MAIL.GROKBOT.COM" }, domains)).toMatchObject({ excluded: true, rule: "internal_domain" });
    expect(classifyAccount({ ...base, email_domain: "teamtegrate.com" }, domains).excluded).toBe(true);
    expect(classifyAccount({ ...base, email_domain: "example.com" }, domains).excluded).toBe(true);
    expect(classifyAccount({ ...base, plus_alias: true }, domains)).toEqual({ excluded: false, explicit: false, rule: "plus_alias" });
  });
  it("adds env domains without dropping the defaults", () => {
    expect(internalDomains({ DEV_ANALYTICS_INTERNAL_DOMAINS: " Acme.test ,," })).toEqual([...DEFAULT_INTERNAL_DOMAINS, "acme.test"]);
    expect(internalDomains({})).toEqual([...DEFAULT_INTERNAL_DOMAINS]);
  });
  it("lists only unconfirmed rule matches, newest first, with ids only", () => {
    const list = reviewCandidates(snapshot().accounts, domains);
    expect(list.map((c) => [c.accountId, c.rule, c.excludedByDefault])).toEqual([
      [ID.p1, "plus_alias", false],
      [ID.comp, "comp", true],
      [ID.qa, "internal_domain", true],
    ]);
    expect(Object.keys(list[0]).sort()).toEqual(["accountId", "createdAt", "excludedByDefault", "rule"]);
  });
});

describe("DA-1 ranges (Pacific)", () => {
  it("presets end now and start at Pacific midnight", () => {
    const today = parseRange(new URLSearchParams("range=today"), NOW)!;
    expect(today.fromDay).toBe("2026-11-15");
    expect(today.from.toISOString()).toBe("2026-11-15T08:00:00.000Z");
    expect(today.to).toEqual(NOW);
    expect(range30().fromDay).toBe("2026-10-17");
    expect(parseRange(new URLSearchParams(""), NOW)!.preset).toBe("30d");
  });
  it("handles the DST change", () => {
    expect(pacificMidnight("2026-11-01").toISOString()).toBe("2026-11-01T07:00:00.000Z");
    expect(pacificMidnight("2026-11-02").toISOString()).toBe("2026-11-02T08:00:00.000Z");
    expect(pacificDay("2026-11-15T07:59:00Z")).toBe("2026-11-14");
    expect(pacificWeekStart("2026-11-15T20:00:00Z")).toBe("2026-11-09");
  });
  it("accepts inclusive custom days and rejects bad ones", () => {
    const r = parseRange(new URLSearchParams("range=custom&from=2026-11-01&to=2026-11-03"), NOW)!;
    expect([r.from.toISOString(), r.to.toISOString()]).toEqual(["2026-11-01T07:00:00.000Z", "2026-11-04T08:00:00.000Z"]);
    expect(parseRange(new URLSearchParams("range=custom&from=2026-11-14&to=2026-11-15"), NOW)!.to).toEqual(NOW);
    for (const q of ["range=1y", "range=custom", "range=custom&from=2026-11-05&to=2026-11-01", "range=custom&from=2026-11-01&to=2026-11-16",
      "range=custom&from=2025-01-01&to=2026-11-01", "range=custom&from=2026-02-30&to=2026-03-01", "range=custom&from=11/01/2026&to=2026-11-02"]) {
      expect(parseRange(new URLSearchParams(q), NOW), q).toBeNull();
    }
  });
});

describe("DA-1 attribution channels", () => {
  const base = { utm_source: null, utm_medium: null, utm_campaign: null, referrer_host: null, created_at: "2026-11-14T00:00:00Z" };
  it("buckets sources", () => {
    expect(channelFor({ ...base, utm_source: "facebook" })).toBe("meta");
    expect(channelFor({ ...base, referrer_host: "l.instagram.com" })).toBe("meta");
    expect(channelFor({ ...base, utm_source: "google", utm_medium: "cpc" })).toBe("google_ads");
    expect(channelFor({ ...base, utm_source: "google" })).toBe("google_organic");
    expect(channelFor({ ...base, referrer_host: "www.google.com.mx" })).toBe("google_organic");
    expect(channelFor({ ...base, utm_campaign: "launch" })).toBe("campaign_other");
    expect(channelFor({ ...base, referrer_host: "news.ycombinator.com" })).toBe("referral");
    expect(channelFor({ ...base, referrer_host: "www.pekkotv.com" })).toBe("direct");
    expect(channelFor({ ...base, created_at: "2026-11-10T00:00:00Z" })).toBe("not_tracked");
  });
});

describe("DA-1 Stripe normalization", () => {
  it("normalizes yearly prices and quantity to monthly, ignoring customer data", () => {
    const s = {
      metadata: { account_id: ID.c1 }, status: "active", created: 1_762_000_000, canceled_at: null, cancel_at_period_end: true, livemode: true, currency: "usd",
      items: { data: [{ quantity: 2, price: { unit_amount: 120000, currency: "usd", recurring: { interval: "year", interval_count: 1 } } }] },
      customer: "cus_secret", 
    } as unknown as Stripe.Subscription;
    const b = toBillingSub(s);
    expect(b).toMatchObject({ accountId: ID.c1, monthlyAmount: 20000, cancelAtPeriodEnd: true, currency: "usd" });
    expect(JSON.stringify(b)).not.toContain("cus_secret");
  });
});

describe("DA-1 metric math on fixtures", () => {
  it("counts accounts, users and screens separately with exclusions applied", () => {
    const d = run();
    expect(d.population).toEqual({ includeInternal: false, customerAccounts: 6, excludedExplicit: 1, excludedByRule: 2 });
    expect(d.overview.accounts).toEqual({ total: 6, newInRange: 6 });
    expect(d.overview.users).toEqual({ total: 7, newInRange: 7, confirmedNewInRange: 5, withoutAccount: 1 });
    expect(d.overview.screens).toEqual({ connected: 3, onlineNow: 1, pairedInRange: 3 });
    expect(d.overview.trials).toEqual({ active: 4, grace: 1, expired: 0, startedInRange: 6 });
  });
  it("takes billing from Stripe and skips excluded or unmapped subscriptions", () => {
    const b = run().overview.billing;
    expect(b).toMatchObject({ available: true, paying: 1, scheduledToCancel: 0, excludedSubscriptions: 1, unmappedSubscriptions: 1, mrr: { amount: 5900, currency: "usd" } });
    const keys = run().overview.notes.map((n) => n.key);
    expect(keys).toEqual(expect.arrayContaining(["billingFromStripe", "mrrBeforeDiscounts", "unmappedSubscriptions", "trialsBeforeBilling"]));
    const down = run(false, { available: false, livemode: null, subs: [] });
    expect(down.overview.billing.mrr).toBeNull();
    expect(down.overview.notes.map((n) => n.key)).toContain("billingUnavailable");
  });
  it("builds a strict funnel with small steps hidden", () => {
    const f = run().funnel;
    expect(f.cohort).toBe(6);
    expect(f.steps.map((s) => [s.key, s.reached, s.anyOrder])).toEqual([
      ["registered", 6, 6], ["trialStarted", 6, 6], ["tvPaired", 3, 3], ["contentDisplayed", 3, 3], ["playlistCreated", 3, 3], ["paid", null, null],
    ]);
    const tv = f.steps[2];
    expect([tv.fromPrevious, tv.dropOff, tv.fromRegistered]).toEqual([0.5, 0.5, 0.5]);
    expect(f.steps[5].fromPrevious).toBeNull();
    expect(f.steps.find((s) => s.key === "playlistCreated")!.notes.map((n) => n.key)).toContain("playlistCaveat");
    expect(f.steps.find((s) => s.key === "contentDisplayed")!.notes.map((n) => n.key)).toContain("firstDisplayRetention");
  });
  it("counts engagement without screen.content_changed as owner activity", () => {
    const e = run().engagement;
    expect(e.active).toEqual([
      { days: 1, owner: 1, screens: 1, either: 2 },
      { days: 7, owner: 1, screens: 1, either: 2 },
      { days: 30, owner: 1, screens: 1, either: 2 },
    ]);
    expect(e.screens.lastCheckIn).toEqual({ lt1h: 1, lt24h: 1, lt7d: 0, older: 0, never: 1 });
    expect(e.publishing).toMatchObject({ publishes: 1, contentChanges: 1, uploads: 1, scheduleChanges: 0, accounts: 2 });
    expect(e.repeat).toEqual({ activeAccounts: 1, oneDay: 0, twoToThreeDays: null, fourPlusDays: 0, multiWeek: 0 });
    expect(e.notes.map((n) => n.key)).toEqual(expect.arrayContaining(["activitySince", "uptimeSince", "activeDefinition"]));
  });
  it("reports retention only for mature accounts and says when D30 matures", () => {
    const r = run().retention;
    expect(r.cells.map((c) => [c.day, c.eligible, c.retained, c.rate])).toEqual([[7, 1, null, null], [14, 0, 0, null], [30, 0, 0, null]]);
    expect(r.cells[2].matureOn).toBe("2026-12-08");
    expect(r.notes.filter((n) => n.key === "notMature").map((n) => n.vars)).toEqual([{ day: 14, date: "2026-11-22" }, { day: 30, date: "2026-12-08" }]);
    expect(r.timeToFirstTv).toEqual({ accounts: 3, medianHours: 4, p75Hours: 5 });
    expect(r.timeToFirstDisplay).toEqual({ accounts: 2, medianHours: null, p75Hours: null });
    expect(r.stopped).toMatchObject({ activated: 3, dormant14: null, dormant30: null });
    expect(r.trialToPaid).toEqual({ ended: 2, converted: null, rate: null });
    expect(r.cohorts.map((c) => c.weekStart)).toEqual(["2026-10-26", "2026-11-02", "2026-11-09"]);
  });
  it("aggregates sources and hides small ones", () => {
    const a = run().attribution;
    expect(a.cohort).toBe(6);
    expect(Object.fromEntries(a.channels.map((c) => [c.key, c.accounts]))).toEqual({ meta: null, google_ads: 0, google_organic: 0, referral: 0, campaign_other: 0, direct: null, not_tracked: 4 });
    expect(a.sources).toEqual([]);
    expect(a.smallSources).toBe(1);
  });
  it("includes internal accounts only when asked", () => {
    const d = run(true);
    expect(d.population.customerAccounts).toBe(9);
    expect(d.overview.users.total).toBe(11);
    expect(d.overview.billing).toMatchObject({ paying: 2, scheduledToCancel: 1, excludedSubscriptions: 0 });
    expect(d.overview.notes.map((n) => n.key)).toContain("internalIncluded");
  });
  it("never returns emails, domains or names", () => {
    const text = JSON.stringify(run(true));
    expect(text).not.toMatch(/@|public-mail|other-mail|customer-biz|grokbot/);
  });
});
