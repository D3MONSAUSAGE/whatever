import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/developer/accounts/route";
import { ACCOUNT_ROW_KEYS } from "@/lib/dev-accounts";
import { setTestBillingLoader } from "@/lib/server/dev-analytics/stripe-source";
import { setTestDb } from "@/lib/server/supabase";
import { A, billing, list } from "../fixtures/dev-accounts";
import { createFakeDb, type Store } from "./fake-db";

const DEV = "d0000000-0000-4000-8000-00000000000d";
const OTHER = "11111111-1111-4111-8111-111111111111";
let developers: Set<string>;
let listCalls: unknown[];
let dbRecheckRejects: boolean;
let listError: { code: string; message: string } | null;
let rpcCalls: string[];
let rateLimited: boolean;
let current: ReturnType<typeof list>;
let store: Store;
const prev = { a: process.env.DEV_ANALYTICS_DISABLED, b: process.env.DEV_ACCOUNTS_DISABLED, d: process.env.DEV_ANALYTICS_INTERNAL_DOMAINS };

beforeEach(() => {
  const fake = createFakeDb();
  fake.addUser("token-dev", DEV, "dev@example.com");
  fake.addUser("token-other", OTHER, "owner@public-mail.test");
  developers = new Set([DEV]);
  listCalls = [];
  dbRecheckRejects = false;
  listError = null;
  rpcCalls = [];
  rateLimited = false;
  current = list();
  store = fake.store;
  const base = fake.client as unknown as Record<string, unknown> & { rpc: (n: string, a?: Record<string, unknown>) => Promise<unknown> };
  const client = {
    ...base,
    async rpc(name: string, args: Record<string, unknown> = {}) {
      rpcCalls.push(name);
      if (name === "rate_limit_hit" && rateLimited) return { data: false, error: null };
      if (name === "is_developer") return { data: developers.has(String(args.p_user)), error: null };
      if (name === "dev_accounts_list") {
        listCalls.push(args.p_actor);
        if (listError) return { data: null, error: listError };
        if (dbRecheckRejects || !developers.has(String(args.p_actor))) return { data: null, error: { code: "42501", message: "not_authorized" } };
        return { data: current, error: null };
      }
      return base.rpc(name, args);
    },
  };
  setTestDb(client as unknown as SupabaseClient);
  setTestBillingLoader(async () => billing());
  delete process.env.DEV_ANALYTICS_DISABLED;
  delete process.env.DEV_ACCOUNTS_DISABLED;
  process.env.DEV_ANALYTICS_INTERNAL_DOMAINS = "internal-qa.test";
});

afterEach(() => {
  setTestDb(null);
  setTestBillingLoader(null);
  for (const [k, v] of [["DEV_ANALYTICS_DISABLED", prev.a], ["DEV_ACCOUNTS_DISABLED", prev.b], ["DEV_ANALYTICS_INTERNAL_DOMAINS", prev.d]] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

const req = (token?: string, query = "") =>
  new Request(`https://pekkotv.com/api/developer/accounts${query}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
const NOT_FOUND = { error: "Not found.", code: "not_found" };

describe("DA-2 /api/developer/accounts authorization", () => {
  it("answers the plain 404 to signed-out visitors, bad tokens and non-developers, without reading data", async () => {
    for (const token of [undefined, "nope", "token-other"]) {
      for (const query of ["", "?population=all", "?population=internal&q=a"]) {
        const res = await GET(req(token, query));
        expect(res.status).toBe(404);
        expect(res.headers.get("cache-control")).toContain("no-store");
        expect(await res.json()).toEqual(NOT_FOUND);
      }
    }
    expect(listCalls).toEqual([]);
  });
  it("creates no account for a signed-in non-developer (no ensure_account on the 404)", async () => {
    const res = await GET(new Request("https://pekkotv.com/api/developer/accounts", { headers: { Authorization: "Bearer token-other", "Accept-Language": "es" } }));
    expect(res.status).toBe(404);
    expect(rpcCalls).toEqual(["is_developer"]);
    expect(store.accounts).toHaveLength(0);
  });
  it("answers 404 when the database re-check refuses the caller", async () => {
    dbRecheckRejects = true;
    expect((await GET(req("token-dev"))).status).toBe(404);
    expect(listCalls).toEqual([DEV]);
  });
  it("answers 404 to everyone when either kill switch is on", async () => {
    process.env.DEV_ACCOUNTS_DISABLED = "1";
    expect((await GET(req("token-dev"))).status).toBe(404);
    delete process.env.DEV_ACCOUNTS_DISABLED;
    process.env.DEV_ANALYTICS_DISABLED = "1";
    expect((await GET(req("token-dev"))).status).toBe(404);
    expect(listCalls).toEqual([]);
  });
  it("answers 429 when the 60 s window is full", async () => {
    rateLimited = true;
    const res = await GET(req("token-dev"));
    expect(res.status).toBe(429);
    expect(listCalls).toEqual([]);
  });
});

describe("DA-2 /api/developer/accounts for developers", () => {
  it("lists real customers by default, no-store and noindex", async () => {
    const res = await GET(req("token-dev"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    const body = await res.json();
    expect(body.population).toBe("customers");
    expect(body.counts).toEqual({ customers: 5, internal: 4, all: 9 });
    expect(body.rows.every((r: { internal: boolean }) => !r.internal)).toBe(true);
    expect(listCalls).toEqual([DEV]);
  });
  it("filters internal/demo/test accounts and says why each is internal", async () => {
    const body = await (await GET(req("token-dev", "?population=internal"))).json();
    expect(body.rows.map((r: { internalReason: string }) => r.internalReason).sort()).toEqual(["comp", "internal_domain", "internal_domain", "reviewer"]);
  });
  it("never returns anything outside the field allowlist", async () => {
    const res = await GET(req("token-dev", "?population=all&pageSize=100"));
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(["billing", "counts", "dir", "generatedAt", "notes", "page", "pageSize", "population", "query", "rows", "sort", "total"]);
    for (const r of body.rows) expect(Object.keys(r).sort()).toEqual([...ACCOUNT_ROW_KEYS].sort());
    // Every key at every depth is on this list: nothing else can leak in later without failing here.
    const keys = new Set<string>();
    const walk = (v: unknown, top: boolean) => {
      if (Array.isArray(v)) v.forEach((x) => walk(x, false));
      else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { if (!top) keys.add(k); walk(x, false); }
    };
    walk(body.rows, false);
    expect([...keys].sort()).toEqual([
      ...ACCOUNT_ROW_KEYS,
      "status", "startedAt", "endsAt", "playbackEndsAt",
      "source", "plan", "cancelAtPeriodEnd", "currentPeriodEnd", "mismatch",
      "paired", "activeScreens", "screensEver", "firstPairedAt", "lastCheckInAt",
      "firstConfirmedAt", "lastConfirmedAt",
      "at", "action", "lastSignInAt",
      "channel", "utmSource", "utmMedium", "utmCampaign", "referrerHost",
    ].filter((k, i, a) => a.indexOf(k) === i).sort());
    expect([...keys].filter((k) => /pass|hash|token|secret|card|payment|stripe|price|media|file|storage|playlist|menu|message|subject|detail|^ip|address|location|agent/i.test(k))).toEqual([]);
    expect(JSON.stringify(body)).not.toMatch(/ffffffff-0000/);
  });
  it("a deleted account disappears on the next request", async () => {
    let body = await (await GET(req("token-dev", "?population=all"))).json();
    expect(body.rows.some((r: { id: string }) => r.id === A.trial)).toBe(true);
    current.accounts = current.accounts.filter((a) => a.id !== A.trial);
    body = await (await GET(req("token-dev", "?population=all"))).json();
    expect(body.rows.some((r: { id: string }) => r.id === A.trial)).toBe(false);
  });
  it("answers 500, never 404, to a confirmed developer when the list can't be read", async () => {
    listError = { code: "PGRST202", message: "Could not find the function" };
    const res = await GET(req("token-dev"));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("Couldn't load accounts.");
  });
});
