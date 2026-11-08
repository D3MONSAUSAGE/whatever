import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as billingReminders } from "@/app/api/cron/billing-reminders/route";
import { setTestDb } from "@/lib/server/supabase";
import { createFakeDb, type Store } from "./fake-db";

const SECRET = "fixture-cron-secret";
const saved = {
  cron: process.env.CRON_SECRET,
  reminders: process.env.BILLING_REMINDERS,
  enforce: process.env.BILLING_ENFORCE,
  live: process.env.STRIPE_LIVE_ENABLED,
};

let store: Store;

beforeEach(() => {
  delete process.env.BILLING_REMINDERS;
  delete process.env.BILLING_ENFORCE;
  delete process.env.STRIPE_LIVE_ENABLED;
  const fake = createFakeDb();
  store = fake.store;
  store.accounts.push({
    id: "65310cfc-a046-451c-8912-d73cb986747e",
    owner_user_id: "11111111-1111-4111-8111-111111111111",
    name: "Inactive",
    billing_transition_started_at: null,
  });
  store.users.set("token-owner", { id: "11111111-1111-4111-8111-111111111111", email: "hidden@example.com" });
  setTestDb(fake.client);
});

afterEach(() => {
  restore("CRON_SECRET", saved.cron);
  restore("BILLING_REMINDERS", saved.reminders);
  restore("BILLING_ENFORCE", saved.enforce);
  restore("STRIPE_LIVE_ENABLED", saved.live);
});

afterAll(() => setTestDb(null));

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

async function call(url: string, authorization?: string) {
  const headers = new Headers();
  if (authorization) headers.set("Authorization", authorization);
  const res = await billingReminders(new Request(url, { headers }));
  const body = await res.json();
  return { status: res.status, body };
}

describe("GET /api/cron/billing-reminders", () => {
  it("proves a matching bearer with reminders off and does not echo the secret", async () => {
    process.env.CRON_SECRET = SECRET;
    const lines: string[] = [];
    const spy = vi.spyOn(console, "info").mockImplementation((message) => { lines.push(String(message)); });
    try {
      const res = await call("http://localhost/api/cron/billing-reminders?dryRun=1", `Bearer ${SECRET}`);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        ok: true,
        cronAuth: "accepted",
        enabled: false,
        dryRun: true,
        sent: 0,
        stamped: 0,
        orgs: [],
      });
      const encoded = JSON.stringify(res.body);
      expect(encoded).not.toContain(SECRET);
      expect(encoded).not.toContain("hidden@example.com");
      expect(encoded).not.toContain("65310cfc-a046-451c-8912-d73cb986747e");
      expect(lines.join("\n")).not.toContain(SECRET);
      expect(store.accounts[0].billing_transition_started_at).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });

  it("rejects a wrong bearer and a missing app secret without cronAuth", async () => {
    process.env.CRON_SECRET = SECRET;
    const wrong = await call("http://localhost/api/cron/billing-reminders?dryRun=1", "Bearer not-the-secret");
    expect(wrong.status).toBe(401);
    expect(wrong.body).toEqual({ error: "Unauthorized." });
    expect(JSON.stringify(wrong.body)).not.toContain(SECRET);

    delete process.env.CRON_SECRET;
    const missing = await call("http://localhost/api/cron/billing-reminders?dryRun=1", `Bearer ${SECRET}`);
    expect(missing.status).toBe(503);
    expect(missing.body).toEqual({ error: "Cron isn't configured." });
    expect(JSON.stringify(missing.body)).not.toContain("cronAuth");
  });

  it("treats every reminders value other than 1 as off", async () => {
    process.env.CRON_SECRET = SECRET;
    process.env.BILLING_REMINDERS = "true";
    const res = await call("http://localhost/api/cron/billing-reminders", `Bearer ${SECRET}`);
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(false);
    expect(res.body.cronAuth).toBe("accepted");
    expect(res.body.orgs).toEqual([]);
  });
});
