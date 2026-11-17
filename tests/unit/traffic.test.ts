import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isTrackedPath, referrerHost, TRACKED_PATHS, utmToken } from "@/lib/traffic";
import { isBotUserAgent, optedOut, reduceBeacon, visitorHash } from "@/lib/server/traffic";
import { buildTrafficReport, type TrafficSnapshot } from "@/lib/server/traffic-report";
import { computeDashboard } from "@/lib/server/dev-analytics/metrics";
import { parseRange } from "@/lib/server/dev-analytics/range";
import { DEFAULT_INTERNAL_DOMAINS } from "@/lib/server/dev-analytics/exclusions";
import { NOW, teamtegrateBilling, teamtegrateSnapshot } from "../fixtures/dev-analytics";

const now = new Date("2026-11-16T20:00:00Z");
const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";

describe("traffic: what is collected", () => {
  it("tracks only the public marketing pages, in English and Spanish", () => {
    expect([...TRACKED_PATHS].sort()).toEqual(["/", "/contact", "/es", "/es/contact", "/es/faq", "/es/features", "/es/pricing", "/es/support", "/faq", "/features", "/pricing", "/support"]);
    for (const bad of ["/dashboard", "/dashboard/account", "/developer/analytics", "/login", "/signup", "/reset-password", "/auth/confirm",
      "/player", "/tv", "/pair", "/api/health", "/terms", "/privacy", "/es/dashboard", "/pricing?x=1", "/pricing/", "", null, 42]) {
      expect(isTrackedPath(bad), String(bad)).toBe(false);
    }
  });

  it("reduces a referrer to its host and drops this site; keeps only short utm tokens", () => {
    expect(referrerHost("https://www.google.com/search?q=menu+board&token=abc")).toBe("www.google.com");
    expect(referrerHost("https://l.facebook.com/l.php?u=x")).toBe("l.facebook.com");
    for (const self of ["https://pekkotv.com/pricing", "https://www.pekkotv.com/", "https://pantalla-chi.vercel.app/x", "http://localhost:3000/"]) expect(referrerHost(self)).toBe("");
    for (const bad of ["", "android-app://com.x", "javascript:alert(1)", "not a url", 7]) expect(referrerHost(bad)).toBe("");
    expect(utmToken("Facebook")).toBe("facebook");
    expect(utmToken("someone@example.com")).toBe("");
    expect(utmToken("a b")).toBe("");
    expect(utmToken("x".repeat(61))).toBe("");
  });

  it("keeps a source only on landings and maps it to the console's channels", () => {
    const land = (extra: object) => reduceBeacon({ path: "/", landing: true, ...extra }, now);
    expect(land({ utm_source: "facebook", utm_medium: "paid_social" })?.channel).toBe("meta");
    expect(land({ referrer: "https://m.facebook.com/" })?.channel).toBe("meta");
    expect(land({ utm_source: "google", utm_medium: "cpc" })?.channel).toBe("google_ads");
    expect(land({ referrer: "https://www.google.com/" })?.channel).toBe("google_organic");
    expect(land({ referrer: "https://news.example.org/a" })).toMatchObject({ channel: "referral", referrerHost: "news.example.org" });
    expect(land({ utm_source: "newsletter" })?.channel).toBe("campaign_other");
    expect(land({})?.channel).toBe("direct");
    const inSite = reduceBeacon({ path: "/es/pricing", landing: false, referrer: "https://www.google.com/", utm_source: "facebook" }, now);
    expect(inSite).toEqual({ day: "2026-11-16", path: "/es/pricing", landing: false, channel: "", referrerHost: "", utmSource: "" });
    expect(reduceBeacon({ path: "/dashboard", landing: true }, now)).toBeNull();
    expect(reduceBeacon("x", now)).toBeNull();
  });

  it("hashes visitors one way, per daily salt, with nothing reversible in the output", () => {
    const a = visitorHash("s".repeat(64), "203.0.113.7", CHROME);
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(visitorHash("s".repeat(64), "203.0.113.7", CHROME)).toBe(a);
    expect(visitorHash("t".repeat(64), "203.0.113.7", CHROME)).not.toBe(a);
    expect(a).not.toContain("203");
  });

  it("skips bots and visitors who opt out", () => {
    expect(isBotUserAgent(CHROME)).toBe(false);
    for (const ua of [null, "", "curl/8.4.0", "Mozilla/5.0 (compatible; Googlebot/2.1)", "Mozilla/5.0 HeadlessChrome/131", "python-requests/2.31"]) expect(isBotUserAgent(ua), String(ua)).toBe(true);
    expect(optedOut(new Headers({ "sec-gpc": "1" }))).toBe(true);
    expect(optedOut(new Headers({ dnt: "1" }))).toBe(true);
    expect(optedOut(new Headers({}))).toBe(false);
  });

  it("the beacon sets no cookie, respects GPC/DNT, skips signed-in people and runs on marketing pages only", () => {
    const beacon = readFileSync("components/site/traffic-beacon.tsx", "utf8");
    expect(beacon).not.toContain("document.cookie");
    expect(beacon).not.toMatch(/localStorage\.setItem/);
    expect(beacon).toContain("globalPrivacyControl");
    expect(beacon).toContain('nav.doNotTrack === "1"');
    expect(beacon).toContain("signedIn()");
    expect(beacon).toContain("if (!isTrackedPath(path) || optedOut() || signedIn()) return;");
    expect(readFileSync("components/public-page.tsx", "utf8")).toContain("{dark ? <TrafficBeacon /> : null}");
  });
});

describe("traffic report: conversion and customer exclusions", () => {
  const range = parseRange(new URLSearchParams("range=30d"), NOW)!;
  const customers = (includeInternal: boolean) => computeDashboard({
    snapshot: teamtegrateSnapshot(), billing: teamtegrateBilling(), range, now: NOW, includeInternal, domains: [...DEFAULT_INTERNAL_DOMAINS],
  });
  const traffic: TrafficSnapshot = {
    first_day: "2026-11-01",
    daily: [{ day: "2026-11-14", visitors: 40, page_views: 90, landings: 50 }, { day: "2026-11-15", visitors: 60, page_views: 110, landings: 70 }],
    pages: [{ path: "/", page_views: 120, landings: 90 }, { path: "/es/pricing", page_views: 80, landings: 30 }],
    sources: [
      { channel: "meta", referrer_host: "l.facebook.com", utm_source: "facebook", landings: 30 },
      { channel: "google_organic", referrer_host: "www.google.com", utm_source: "", landings: 25 },
      { channel: "direct", referrer_host: "", utm_source: "", landings: 65 },
    ],
  };

  it("divides customer registrations (internal accounts excluded) by visitors", () => {
    const withInternal = customers(true).overview.accounts.newInRange;
    const onlyCustomers = customers(false).overview.accounts.newInRange;
    expect(withInternal).toBeGreaterThan(onlyCustomers); // the fixture has internal/QA accounts in range
    const r = buildTrafficReport({ traffic, customers: customers(false), range, now: NOW });
    expect(r.totals).toEqual({ visitors: 100, pageViews: 200, landings: 120 });
    expect(r.registrations.customers).toBe(onlyCustomers);
    expect(r.registrations.conversion).toBeCloseTo(onlyCustomers / 100, 10);
    expect(r.pages[0]).toEqual({ path: "/", landings: 90, pageViews: 120 });
    expect(r.referrers.map((x) => x.host)).toEqual(["l.facebook.com", "www.google.com"]);
    expect(r.notes.map((n) => n.key)).toEqual(expect.arrayContaining(["collectingSince", "customersOnly", "conversionEstimate", "cookieless"]));
  });

  it("per-source registrations come from the same customer attribution, hidden groups stay hidden", () => {
    const c = customers(false);
    const r = buildTrafficReport({ traffic, customers: c, range, now: NOW });
    for (const row of r.channels) {
      // A hidden (<3) group stays null; a channel with no row at all is 0.
      const found = c.attribution.channels.find((x) => x.key === row.key);
      const reg = found ? found.accounts : 0;
      expect(row.registrations, row.key).toBe(reg);
      expect(row.conversion, row.key).toBe(reg === null || row.landings === 0 ? null : reg / row.landings);
    }
    expect(r.channels.find((x) => x.key === "meta")?.landings).toBe(30);
  });

  it("shows nothing as data before collection is set up", () => {
    const r = buildTrafficReport({ traffic: null, customers: customers(false), range, now: NOW });
    expect(r.collecting).toBe(false);
    expect(r.totals).toEqual({ visitors: 0, pageViews: 0, landings: 0 });
    expect(r.registrations.conversion).toBeNull();
    expect(r.daily).toEqual([]);
    expect(r.notes[0].key).toBe("notCollecting");
  });
});
