import { describe, expect, it } from "vitest";
import { ACCOUNT_ROW_KEYS } from "@/lib/dev-accounts";
import { buildAccounts, currentSub, displayedStatus, parseAccountsQuery } from "@/lib/server/dev-accounts/build";
import { A, acct, billing, DOMAINS, list, sub } from "../fixtures/dev-accounts";

const q = (s = "") => parseAccountsQuery(new URLSearchParams(s));
const build = (s = "", b = billing(), l = list()) => buildAccounts({ list: l, billing: b, query: q(s), domains: DOMAINS });
const row = (id: string, s = "population=all") => build(s).rows.find((r) => r.id === id)!;

describe("DA-2 customer accounts: query parsing", () => {
  it("defaults to real customers, newest registrations first, 25 per page", () => {
    expect(q()).toEqual({ population: "customers", q: "", sort: "registered", dir: "desc", page: 1, pageSize: 25 });
  });
  it("only accepts known values and clamps numbers", () => {
    expect(q("population=everyone&sort=password&dir=up&page=-4&pageSize=5000")).toEqual({ population: "customers", q: "", sort: "registered", dir: "desc", page: 1, pageSize: 100 });
    expect(q("sort=email").dir).toBe("asc");
    expect(q(`q=${"x".repeat(300)}`).q).toHaveLength(100);
  });
});

describe("DA-2 customer accounts: population filter", () => {
  it("shows only real customers by default, internal ones on request, and both under All", () => {
    const def = build();
    expect(def.counts).toEqual({ customers: 5, internal: 4, all: 9 });
    expect(def.rows.map((r) => r.id).sort()).toEqual([A.paid, A.trial, A.old, A.expired, A.orphan].sort());
    expect(def.rows.every((r) => !r.internal)).toBe(true);
    const internal = build("population=internal");
    expect(internal.rows.map((r) => [r.id, r.internalReason]).sort()).toEqual([
      [A.qa, "internal_domain"], [A.listed, "reviewer"], [A.comp, "comp"], [A.orphanQa, "internal_domain"],
    ].sort());
    expect(build("population=all").total).toBe(9);
  });
  it("a +alias on a public domain is a hint only, never internal by itself", () => {
    const r = row(A.expired);
    expect(r.internal).toBe(false);
    expect(r.plusAliasHint).toBe(true);
  });
});

describe("DA-2 customer accounts: fields", () => {
  it("returns only the allowlisted keys", () => {
    for (const r of build("population=all").rows) expect(Object.keys(r).sort()).toEqual([...ACCOUNT_ROW_KEYS].sort());
  });
  it("trial status and expiry", () => {
    expect(row(A.trial).trial).toMatchObject({ status: "active", endsAt: "2026-11-27T18:00:00.000Z" });
    expect(row(A.expired).trial.status).toBe("grace");
    expect(row(A.old).trial.status).toBe("expired");
    expect(row(A.paid).trial.status).toBe("not_on_trial");
    expect(row(A.orphan).trial.status).toBe("not_started");
  });
  it("subscription comes from Stripe, and flags Pekko's stored copy when it differs", () => {
    expect(row(A.paid).subscription).toEqual({ source: "stripe", status: "active", plan: "multi", cancelAtPeriodEnd: false, currentPeriodEnd: "2026-12-01T18:00:00Z", mismatch: false });
    const b = billing();
    b.subs[0] = sub(A.paid, "past_due");
    expect(build("", b).rows.find((r) => r.id === A.paid)!.subscription).toMatchObject({ source: "stripe", status: "past_due", mismatch: true });
    // Stripe has nothing although Pekko's copy says active: shown as none, flagged.
    expect(build("", { available: true, livemode: true, subs: [] }).rows.find((r) => r.id === A.paid)!.subscription).toMatchObject({ source: "none", mismatch: true });
  });
  it("falls back to the stored copy, labelled, when Stripe can't be read", () => {
    const res = build("", { available: false, livemode: null, subs: [] });
    expect(res.rows.find((r) => r.id === A.paid)!.subscription).toMatchObject({ source: "stored", status: "active", plan: "multi", currentPeriodEnd: "2026-12-01T18:00:00Z" });
    expect(res.notes.map((n) => n.key)).toContain("billingUnavailable");
  });
  it("prefers a live Stripe subscription over older canceled ones", () => {
    expect(currentSub([sub(A.paid, "canceled", { createdAt: "2026-11-10T00:00:00Z" }), sub(A.paid, "active")])!.status).toBe("active");
    expect(currentSub([sub(A.paid, "canceled", { createdAt: "2026-11-10T00:00:00Z" }), sub(A.paid, "canceled")])!.createdAt).toBe("2026-11-10T00:00:00Z");
  });
  it("paired TV means ever paired, with current and total counts", () => {
    expect(row(A.paid).tv).toEqual({ paired: true, activeScreens: 2, screensEver: 3, firstPairedAt: "2026-11-01T19:00:00Z", lastCheckInAt: "2026-11-15T19:59:00Z" });
    expect(row(A.old).tv.paired).toBe(true);
    expect(row(A.expired).tv.paired).toBe(false);
  });
  it("content shown: yes on a TV confirmation, never guessed before tracking started", () => {
    expect(row(A.paid).displayed.status).toBe("yes");
    expect(row(A.trial).displayed.status).toBe("not_yet");
    expect(row(A.old).displayed.status).toBe("unknown");
    expect(row(A.expired).displayed.status).toBe("no_tv");
    expect(displayedStatus({ screens_ever: 1, ever_confirmed: false, first_playback_at: "2026-11-02T00:00:00Z", first_paired_at: "2026-10-01T00:00:00Z" })).toBe("yes");
  });
  it("last activity is the newer of the latest owner action and the last sign-in", () => {
    expect(row(A.paid).lastActivity).toEqual({ at: "2026-11-14T17:00:00Z", source: "owner_action", action: "publish", lastSignInAt: "2026-11-10T17:00:00Z" });
    expect(row(A.trial).lastActivity).toMatchObject({ at: "2026-11-15T09:00:00Z", source: "sign_in", action: null });
    expect(row(A.expired).lastActivity).toEqual({ at: null, source: null, action: null, lastSignInAt: null });
  });
  it("sign-up source from first-party tags; not tracked before capture started", () => {
    expect(row(A.trial).signupSource).toEqual({ channel: "meta", utmSource: "facebook", utmMedium: "paid_social", utmCampaign: "launch", referrerHost: null });
    expect(row(A.old).signupSource.channel).toBe("not_tracked");
    expect(row(A.orphan).signupSource.channel).toBe("direct");
  });
  it("marks a pending deletion", () => {
    expect(row(A.expired).deletionPending).toBe(true);
  });
});

describe("DA-2 customer accounts: deletion", () => {
  it("a deleted account is simply absent: nothing is kept from an earlier read", () => {
    const before = build("population=all");
    expect(before.rows.some((r) => r.id === A.trial)).toBe(true);
    const l = list();
    l.accounts = l.accounts.filter((a) => a.id !== A.trial);
    const after = build("population=all", billing(), l);
    expect(after.rows.some((r) => r.id === A.trial)).toBe(false);
    expect(JSON.stringify(after)).not.toContain("zed@other-mail.test");
    expect(after.counts.all).toBe(before.counts.all - 1);
  });
  it("Stripe subscriptions without a Pekko account never create rows", () => {
    const res = build("population=all");
    expect(res.rows.some((r) => r.id.startsWith("ffffffff"))).toBe(false);
  });
});

describe("DA-2 customer accounts: search, sort, pages", () => {
  it("searches by email, case-insensitive", () => {
    expect(build("q=PUBLIC-MAIL").rows.map((r) => r.id).sort()).toEqual([A.paid, A.expired, A.orphan].sort());
  });
  it("sorts by registration, email and last activity (no activity last)", () => {
    expect(build("sort=registered&dir=asc").rows[0].id).toBe(A.old);
    expect(build("sort=email").rows.map((r) => r.email)[0]).toBe("early@customer-biz.test");
    const act = build("sort=activity").rows.map((r) => r.id);
    expect(act.slice(0, 2)).toEqual([A.trial, A.paid]);
    expect(build("sort=activity&dir=asc").rows.slice(-1)[0].lastActivity.at).toBeNull();
  });
  it("paginates", () => {
    const p1 = build("population=all&pageSize=4&page=1");
    const p3 = build("population=all&pageSize=4&page=3");
    expect(p1.rows).toHaveLength(4);
    expect(p3.rows).toHaveLength(1);
    expect(build("population=all&pageSize=4&page=99").page).toBe(3);
  });
  it("orders a tie by id so pages are stable", () => {
    const l = list();
    l.accounts.push(acct("a9000000-0000-4000-8000-000000000009", "twin@public-mail.test", "2026-11-01T18:00:00Z"));
    const ids = buildAccounts({ list: l, billing: billing(), query: q("sort=registered&dir=asc"), domains: DOMAINS }).rows.map((r) => r.id);
    expect(ids.indexOf(A.paid)).toBeLessThan(ids.indexOf("a9000000-0000-4000-8000-000000000009"));
  });
});
