import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as accessGET } from "@/app/api/developer/access/route";
import { GET as analyticsGET } from "@/app/api/developer/analytics/route";
import { GET as accountsGET } from "@/app/api/developer/accounts/route";
import DeveloperAnalyticsPage from "@/app/developer/analytics/page";
import { setTestBillingLoader } from "@/lib/server/dev-analytics/stripe-source";
import { setTestDb } from "@/lib/server/supabase";
import { billing, snapshot } from "../fixtures/dev-analytics";
import { list } from "../fixtures/dev-accounts";
import { createFakeDb, type Store } from "./fake-db";

/** Developer console: the link check and every developer API refuse non-developers on the server. */
const DEV = "d0000000-0000-4000-8000-00000000000d";
const ADMIN = "a0000000-0000-4000-8000-00000000000a";
const CUSTOMER = "11111111-1111-4111-8111-111111111111";
let roles: Map<string, "developer" | "admin">;
let store: Store;
let ensureAccountCalls: number;
const prevDisabled = process.env.DEV_ANALYTICS_DISABLED;

beforeEach(() => {
  const fake = createFakeDb();
  fake.addUser("token-dev", DEV, "dev@example.com");
  fake.addUser("token-admin", ADMIN, "admin@example.com");
  fake.addUser("token-customer", CUSTOMER, "owner@public-mail.test");
  roles = new Map([[DEV, "developer"], [ADMIN, "admin"]]);
  store = fake.store;
  ensureAccountCalls = 0;
  const base = fake.client as unknown as Record<string, unknown> & { rpc: (n: string, a?: Record<string, unknown>) => Promise<unknown> };
  const client = {
    ...base,
    async rpc(name: string, args: Record<string, unknown> = {}) {
      if (name === "ensure_account") ensureAccountCalls++;
      // 0029 is_developer: any row in developer_users, role developer or admin.
      if (name === "is_developer") return { data: roles.has(String(args.p_user)), error: null };
      if (name === "dev_analytics_snapshot") {
        return roles.has(String(args.p_actor)) ? { data: snapshot(), error: null } : { data: null, error: { code: "42501", message: "not_authorized" } };
      }
      if (name === "dev_accounts_list") {
        return roles.has(String(args.p_actor)) ? { data: list(), error: null } : { data: null, error: { code: "42501", message: "not_authorized" } };
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

const req = (path: string, token?: string) =>
  new Request(`https://pekkotv.com${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });

describe("GET /api/developer/access (decides only whether the link shows)", () => {
  it("says yes to developer and admin roles", async () => {
    for (const token of ["token-dev", "token-admin"]) {
      const res = await accessGET(req("/api/developer/access", token));
      expect(res.status, token).toBe(200);
      expect(await res.json()).toEqual({ developer: true });
    }
  });

  it("gives everyone else the same plain 404, and never creates an account by asking", async () => {
    for (const token of [undefined, "token-customer", "not-a-real-token"]) {
      const res = await accessGET(req("/api/developer/access", token));
      expect(res.status, String(token)).toBe(404);
      expect(await res.json()).toEqual({ error: "Not found.", code: "not_found" });
    }
    expect(ensureAccountCalls).toBe(0);
    expect(store.accounts ?? []).toHaveLength(0);
  });

  it("is off for everyone with DEV_ANALYTICS_DISABLED=1", async () => {
    process.env.DEV_ANALYTICS_DISABLED = "1";
    expect((await accessGET(req("/api/developer/access", "token-admin"))).status).toBe(404);
  });
});

describe("developer data APIs still authorize every request on the server", () => {
  it("serve developers and admins", async () => {
    for (const token of ["token-dev", "token-admin"]) {
      expect((await analyticsGET(req("/api/developer/analytics?range=30d", token))).status, token).toBe(200);
      expect((await accountsGET(req("/api/developer/accounts", token))).status, token).toBe(200);
    }
  });

  it("refuse signed-out visitors, bad tokens and regular customers with 404, even when called directly", async () => {
    for (const token of [undefined, "not-a-real-token", "token-customer"]) {
      expect((await analyticsGET(req("/api/developer/analytics?range=30d", token))).status, String(token)).toBe(404);
      expect((await accountsGET(req("/api/developer/accounts", token))).status, String(token)).toBe(404);
    }
    expect(ensureAccountCalls).toBe(0);
  });
});

describe("/developer/analytics page", () => {
  it("answers a real 404 to every visitor, like /developer/accounts; the console mounts in not-found", () => {
    let thrown: unknown;
    try { DeveloperAnalyticsPage(); } catch (e) { thrown = e; }
    expect(String((thrown as { digest?: string })?.digest)).toMatch(/404/);
    const nf = readFileSync("app/developer/analytics/not-found.tsx", "utf8");
    expect(nf).toContain("<DeveloperAnalytics notFound={notFound} />");
    const client = readFileSync("app/developer/analytics/client.tsx", "utf8");
    // The console shows nothing until the gated API confirms a developer.
    expect(client).toContain('if (load.state === "notFound") return <>{notFound}</>;');
    expect(client).toContain("if (!confirmed)");
    expect(client.match(/fetch\(/g)).toHaveLength(1);
  });
});

describe("developer-only navigation", () => {
  it("shows the link only after the server says the user is a developer", () => {
    const shell = readFileSync("components/shell.tsx", "utf8");
    const account = readFileSync("app/dashboard/account/page.tsx", "utf8");
    const hook = readFileSync("lib/dev-access.ts", "utf8");
    expect(shell).toMatch(/\{developer \? \(\s*<StudioGuardedLink href="\/developer\/analytics"/);
    // The link sits above Sign out at the bottom of the desktop sidebar.
    expect(shell.indexOf('data-testid="nav-developer"')).toBeLessThan(shell.indexOf("<SignOutButton onSignOut={signOut} className={`nav-link"));
    expect(account).toMatch(/\{developer \? \(\s*<li className="card[^"]*md:hidden" data-testid="developer-card">/);
    expect(hook).toContain('fetch("/api/developer/access"');
    // Signing out forgets the cached answer.
    expect(shell).toContain("clearDeveloperAccess();");
  });
});
