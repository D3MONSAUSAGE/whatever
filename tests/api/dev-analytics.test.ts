import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/developer/analytics/route";
import { setTestBillingLoader } from "@/lib/server/dev-analytics/stripe-source";
import { setTestDb } from "@/lib/server/supabase";
import { billing, snapshot } from "../fixtures/dev-analytics";
import { createFakeDb } from "./fake-db";

const DEV = "d0000000-0000-4000-8000-00000000000d";
const OTHER = "11111111-1111-4111-8111-111111111111";
let developers: Set<string>;
let snapshotCalls: { p_actor: unknown; p_since: unknown }[];
let dbRecheckRejects: boolean;
const prevDisabled = process.env.DEV_ANALYTICS_DISABLED;

beforeEach(() => {
  const fake = createFakeDb();
  fake.addUser("token-dev", DEV, "dev@example.com");
  fake.addUser("token-other", OTHER, "owner@gmail.com");
  developers = new Set([DEV]);
  snapshotCalls = [];
  dbRecheckRejects = false;
  const base = fake.client as unknown as Record<string, unknown> & { rpc: (n: string, a?: Record<string, unknown>) => Promise<unknown> };
  // DA-1 functions from 0029_dev_analytics.sql; everything else goes to the shared fake.
  const client = {
    ...base,
    async rpc(name: string, args: Record<string, unknown> = {}) {
      if (name === "is_developer") return { data: developers.has(String(args.p_user)), error: null };
      if (name === "dev_analytics_snapshot") {
        snapshotCalls.push({ p_actor: args.p_actor, p_since: args.p_since });
        if (dbRecheckRejects || !developers.has(String(args.p_actor))) return { data: null, error: { code: "42501", message: "not_authorized" } };
        return { data: snapshot(), error: null };
      }
      return base.rpc(name, args);
    },
  };
  setTestDb(client as unknown as SupabaseClient);
  setTestBillingLoader(async () => billing());
  delete process.env.DEV_ANALYTICS_DISABLED;
});

afterEach(() => {
  setTestDb(null);
  setTestBillingLoader(null);
  if (prevDisabled === undefined) delete process.env.DEV_ANALYTICS_DISABLED;
  else process.env.DEV_ANALYTICS_DISABLED = prevDisabled;
});

const req = (token?: string, query = "") =>
  new Request(`https://pekkotv.com/api/developer/analytics${query}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });

describe("DA-1 /api/developer/analytics authorization", () => {
  it("answers 404 to signed-out visitors", async () => {
    const res = await GET(req());
    expect(res.status).toBe(404);
    expect(snapshotCalls).toEqual([]);
  });
  it("answers 404 to an invalid token", async () => {
    expect((await GET(req("nope"))).status).toBe(404);
    expect(snapshotCalls).toEqual([]);
  });
  it("answers 404 to a signed-in customer who isn't a developer, without reading data", async () => {
    const res = await GET(req("token-other"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toMatch(/developer|analytics/i);
    expect(snapshotCalls).toEqual([]);
  });
  it("answers 404 when the database re-check refuses the caller", async () => {
    dbRecheckRejects = true;
    expect((await GET(req("token-dev"))).status).toBe(404);
    expect(snapshotCalls).toHaveLength(1);
  });
  it("answers 404 to everyone when switched off", async () => {
    process.env.DEV_ANALYTICS_DISABLED = "1";
    expect((await GET(req("token-dev"))).status).toBe(404);
  });
  it("checks authorization before validating the range", async () => {
    expect((await GET(req("token-other", "?range=custom&from=x"))).status).toBe(404);
  });
});

describe("DA-1 /api/developer/analytics for developers", () => {
  it("returns aggregates with exclusions applied by default", async () => {
    const res = await GET(req("token-dev"));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(res.headers.get("cache-control")).toContain("no-store");
    const body = await res.json();
    expect(body.population.includeInternal).toBe(false);
    expect(body.population.excludedExplicit + body.population.excludedByRule).toBe(3);
    expect(snapshotCalls[0].p_actor).toBe(DEV);
    const text = JSON.stringify(body);
    expect(text).not.toMatch(/@|gmail|hotmail|guanatostacos|grokbot/);
  });
  it("includes internal accounts on request", async () => {
    const body = await (await GET(req("token-dev", "?include=internal"))).json();
    expect(body.population.includeInternal).toBe(true);
    expect(body.population.customerAccounts).toBe(9);
  });
  it("rejects a bad range with 400", async () => {
    const res = await GET(req("token-dev", "?range=custom&from=2026-11-10&to=2026-11-01"));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("bad_range");
  });
  it("reads at least 37 days back so 30-day windows are complete", async () => {
    await GET(req("token-dev", "?range=today"));
    const since = Date.parse(String(snapshotCalls[0].p_since));
    expect(Date.now() - since).toBeGreaterThanOrEqual(37 * 86_400_000 - 1000);
  });
});
