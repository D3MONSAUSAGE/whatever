import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as collect } from "@/app/api/traffic/collect/route";
import { POST as funnelEvent } from "@/app/api/traffic/event/route";
import { GET as devTraffic } from "@/app/api/developer/traffic/route";
import { setTestDb } from "@/lib/server/supabase";
import { resetTrafficCache } from "@/lib/server/traffic";
import { teamtegrateSnapshot } from "../fixtures/dev-analytics";
import { createFakeDb } from "./fake-db";

const DEV = "d0000000-0000-4000-8000-00000000000d";
const CUSTOMER = "11111111-1111-4111-8111-111111111111";
const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";
const IP = "203.0.113.77";

let calls: { name: string; args: Record<string, unknown> }[];
let schemaMissing: boolean;
let rateLimited: boolean;
let ensureAccountCalls: number;

beforeEach(() => {
  resetTrafficCache();
  const fake = createFakeDb();
  fake.addUser("token-dev", DEV, "dev@example.com");
  fake.addUser("token-customer", CUSTOMER, "owner@public-mail.test");
  calls = [];
  schemaMissing = false;
  rateLimited = false;
  ensureAccountCalls = 0;
  const base = fake.client as unknown as Record<string, unknown> & { rpc: (n: string, a?: Record<string, unknown>) => Promise<unknown> };
  const missing = { data: null, error: { code: "PGRST202", message: "Could not find the function" } };
  setTestDb({
    ...base,
    async rpc(name: string, args: Record<string, unknown> = {}) {
      calls.push({ name, args });
      if (name === "ensure_account") ensureAccountCalls++;
      if (name === "rate_limit_hit") return { data: !rateLimited, error: null };
      if (name === "is_developer") return { data: args.p_user === DEV, error: null };
      if (name === "traffic_salt") return schemaMissing ? missing : { data: "a".repeat(64), error: null };
      if (name === "traffic_record") return schemaMissing ? missing : { data: null, error: null };
      if (name === "dev_traffic_snapshot") {
        if (args.p_actor !== DEV) return { data: null, error: { code: "42501", message: "not_authorized" } };
        return schemaMissing ? missing : { data: { first_day: "2026-11-01", daily: [{ day: "2026-11-15", visitors: 50, page_views: 80, landings: 60 }], pages: [], sources: [] }, error: null };
      }
      if (name === "funnel_record") return schemaMissing ? missing : { data: null, error: null };
      if (name === "dev_funnel_snapshot") {
        if (args.p_actor !== DEV) return { data: null, error: { code: "42501", message: "not_authorized" } };
        return schemaMissing ? missing : { data: { first_day: "2026-11-19", rows: [
          { event: "cta_click", detail: "hero", count: 6 }, { event: "cta_click", detail: "sticky", count: 2 },
          { event: "signup_view", detail: "", count: 7 }, { event: "signup_submit", detail: "", count: 4 },
          { event: "signup_error", detail: "short_password", count: 1 }, { event: "template_try", detail: "hero", count: 9 },
        ] }, error: null };
      }
      if (name === "dev_analytics_snapshot") {
        return args.p_actor === DEV ? { data: teamtegrateSnapshot(), error: null } : { data: null, error: { code: "42501", message: "not_authorized" } };
      }
      return base.rpc(name, args);
    },
  } as unknown as SupabaseClient);
});

afterEach(() => setTestDb(null));

const beacon = (body: unknown, headers: Record<string, string> = {}) =>
  collect(new Request("https://pekkotv.com/api/traffic/collect", {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": CHROME, "x-real-ip": IP, origin: "https://pekkotv.com", "sec-fetch-site": "same-origin", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }));
const records = () => calls.filter((c) => c.name === "traffic_record");

describe("POST /api/traffic/collect", () => {
  it("records a landing on a marketing page, without the IP address or user agent", async () => {
    const res = await beacon({ path: "/es/pricing", landing: true, referrer: "https://www.google.com/search?q=x", utm_source: "Google", utm_medium: "organic" });
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    expect(records()).toHaveLength(1);
    const args = records()[0].args;
    expect(args).toMatchObject({ p_path: "/es/pricing", p_landing: true, p_channel: "google_organic", p_referrer_host: "www.google.com", p_utm_source: "google" });
    expect(String(args.p_visitor_hash)).toMatch(/^[0-9a-f]{32}$/);
    // Nothing identifying is sent to the database: not in the record, not in the rate-limit key.
    const everything = JSON.stringify(calls);
    expect(everything).not.toContain(IP);
    expect(everything).not.toContain("Chrome/131");
    expect(everything).not.toContain("search?q=");
    expect(calls.find((c) => c.name === "rate_limit_hit")?.args.p_key).toBe(`traffic:${args.p_visitor_hash}`);
  });

  it("the same visitor gets the same hash within a day", async () => {
    await beacon({ path: "/", landing: true });
    await beacon({ path: "/features", landing: false });
    const [a, b] = records().map((r) => r.args.p_visitor_hash);
    expect(a).toBe(b);
    expect(records()[1].args).toMatchObject({ p_landing: false, p_channel: "direct", p_referrer_host: "", p_utm_source: "" });
  });

  it("ignores non-marketing pages, bots, opt-outs, other sites and junk, always with 204", async () => {
    const cases: [unknown, Record<string, string>][] = [
      [{ path: "/dashboard", landing: true }, {}],
      [{ path: "/login", landing: true }, {}],
      [{ path: "/developer/analytics", landing: true }, {}],
      [{ path: "/player", landing: true }, {}],
      [{ path: "/api/health", landing: true }, {}],
      [{ path: "/", landing: true }, { "user-agent": "curl/8.0" }],
      [{ path: "/", landing: true }, { "sec-gpc": "1" }],
      [{ path: "/", landing: true }, { dnt: "1" }],
      [{ path: "/", landing: true }, { origin: "https://evil.example", "sec-fetch-site": "cross-site" }],
      ["not json", {}],
      ["x".repeat(5000), {}],
    ];
    for (const [body, headers] of cases) {
      const res = await beacon(body, headers);
      expect(res.status, JSON.stringify(headers)).toBe(204);
    }
    expect(records()).toHaveLength(0);
  });

  it("does nothing (and never errors) before migration 0031 is applied, or when rate-limited", async () => {
    schemaMissing = true;
    expect((await beacon({ path: "/", landing: true })).status).toBe(204);
    expect(records()).toHaveLength(0);
    resetTrafficCache();
    schemaMissing = false;
    rateLimited = true;
    expect((await beacon({ path: "/", landing: true })).status).toBe(204);
    expect(records()).toHaveLength(0);
  });
});

const event = (body: unknown, headers: Record<string, string> = {}) =>
  funnelEvent(new Request("https://pekkotv.com/api/traffic/event", {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": CHROME, "x-real-ip": IP, origin: "https://pekkotv.com", "sec-fetch-site": "same-origin", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }));
const funnelRecords = () => calls.filter((c) => c.name === "funnel_record");

describe("POST /api/traffic/event (signup funnel, migration 0032)", () => {
  it("records an allowed event as a plain daily counter, with nothing identifying", async () => {
    for (const body of [{ event: "cta_click", detail: "hero" }, { event: "signup_view" }, { event: "signup_submit" }, { event: "signup_error", detail: "rate_limit" }, { event: "template_try", detail: "demo" }]) {
      expect((await event(body)).status).toBe(204);
    }
    expect(funnelRecords().map((r) => [r.args.p_event, r.args.p_detail])).toEqual([
      ["cta_click", "hero"], ["signup_view", ""], ["signup_submit", ""], ["signup_error", "rate_limit"], ["template_try", "demo"],
    ]);
    for (const r of funnelRecords()) expect(Object.keys(r.args).sort()).toEqual(["p_day", "p_detail", "p_event"]);
    const everything = JSON.stringify(calls);
    expect(everything).not.toContain(IP);
    expect(everything).not.toContain("Chrome/131");
  });

  it("drops unknown events and details, emails, bots, opt-outs, other sites and junk, always with 204", async () => {
    const cases: [unknown, Record<string, string>][] = [
      [{ event: "purchase" }, {}],
      [{ event: "cta_click", detail: "footer" }, {}],
      [{ event: "cta_click" }, {}],
      [{ event: "signup_error", detail: "owner@example.com" }, {}],
      [{ event: "signup_error", detail: "Password should be at least 8 characters" }, {}],
      [{ event: "signup_view", detail: "x" }, {}],
      [{ event: "signup_view" }, { "user-agent": "curl/8.0" }],
      [{ event: "signup_view" }, { "sec-gpc": "1" }],
      [{ event: "signup_view" }, { dnt: "1" }],
      [{ event: "signup_view" }, { origin: "https://evil.example", "sec-fetch-site": "cross-site" }],
      ["not json", {}],
      ["x".repeat(2000), {}],
    ];
    for (const [body, headers] of cases) expect((await event(body, headers)).status, JSON.stringify([body, headers])).toBe(204);
    expect(funnelRecords()).toHaveLength(0);
  });

  it("does nothing before 0031/0032 are applied, or when rate-limited", async () => {
    schemaMissing = true;
    expect((await event({ event: "signup_view" })).status).toBe(204);
    expect(funnelRecords()).toHaveLength(0);
    resetTrafficCache();
    schemaMissing = false;
    rateLimited = true;
    expect((await event({ event: "signup_view" })).status).toBe(204);
    expect(funnelRecords()).toHaveLength(0);
  });
});

describe("GET /api/developer/traffic", () => {
  const req = (token?: string) => new Request("https://pekkotv.com/api/developer/traffic?range=30d", { headers: token ? { Authorization: `Bearer ${token}` } : {} });

  it("refuses everyone but developers with the plain 404, and creates no account", async () => {
    for (const token of [undefined, "bad-token", "token-customer"]) {
      const res = await devTraffic(req(token));
      expect(res.status, String(token)).toBe(404);
      expect(await res.json()).toEqual({ error: "Not found.", code: "not_found" });
    }
    expect(ensureAccountCalls).toBe(0);
    expect(calls.some((c) => c.name === "dev_traffic_snapshot")).toBe(false);
  });

  it("gives developers real counts and customer-only registrations; the database re-checks the developer", async () => {
    const res = await devTraffic(req("token-dev"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.collecting).toBe(true);
    expect(body.totals).toEqual({ visitors: 50, pageViews: 80, landings: 60 });
    expect(calls.find((c) => c.name === "dev_traffic_snapshot")?.args.p_actor).toBe(DEV);
    // The teamtegrate fixture has internal accounts; they must not count as registrations.
    expect(body.registrations.customers).toBeGreaterThanOrEqual(0);
    expect(body.notes.map((n: { key: string }) => n.key)).toContain("customersOnly");
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  it("includes the signup funnel: browser steps from 0032, registrations and confirmations from account data", async () => {
    const body = await (await devTraffic(req("token-dev"))).json();
    expect(calls.find((c) => c.name === "dev_funnel_snapshot")?.args.p_actor).toBe(DEV);
    expect(body.funnel.collecting).toBe(true);
    const stage = (k: string) => body.funnel.stages.find((s: { key: string }) => s.key === k);
    expect(stage("landings").count).toBe(60);
    expect(stage("ctaClicks").count).toBe(8);
    expect(stage("ctaClicks").fromPrevious).toBeCloseTo(8 / 60);
    expect(stage("signupViews").count).toBe(7);
    expect(stage("signupSubmits").count).toBe(4);
    expect(body.funnel.stages.map((s: { key: string }) => s.key)).toEqual(["landings", "ctaClicks", "signupViews", "signupSubmits", "registrations", "confirmed"]);
    expect(body.funnel.errorsByCode).toEqual([{ code: "short_password", count: 1 }]);
    expect(body.funnel.ctaByLocation.find((c: { location: string }) => c.location === "sticky").count).toBe(2);
  });

  it("reports collecting=false with no numbers before 0031 is applied", async () => {
    schemaMissing = true;
    const body = await (await devTraffic(req("token-dev"))).json();
    expect(body).toMatchObject({ collecting: false, totals: { visitors: 0, pageViews: 0, landings: 0 }, registrations: { conversion: null } });
    // The funnel panel degrades the same way: no invented browser counts.
    expect(body.funnel.collecting).toBe(false);
    expect(body.funnel.stages.slice(0, 4).map((s: { count: number }) => s.count)).toEqual([0, 0, 0, 0]);
  });
});
