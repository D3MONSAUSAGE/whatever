import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as me } from "@/app/api/me/route";
import { POST as portal } from "@/app/api/billing/portal/route";
import { setTestDb } from "@/lib/server/supabase";
import { createFakeDb, type Store } from "./fake-db";

const previousKey = process.env.STRIPE_TEST_SECRET_KEY;
let store: Store;

beforeEach(() => {
  const fake = createFakeDb();
  store = fake.store;
  setTestDb(fake.client);
  delete process.env.STRIPE_TEST_SECRET_KEY;
  fake.addUser("token-owner", "11111111-1111-4111-8111-111111111111", "owner@example.com");
  fake.addUser("token-other", "22222222-2222-4222-8222-222222222222", "other@example.com");
});

afterEach(() => {
  setTestDb(null);
  if (previousKey === undefined) delete process.env.STRIPE_TEST_SECRET_KEY;
  else process.env.STRIPE_TEST_SECRET_KEY = previousKey;
});


function notOwnerDb() {
  const account = {
    id: "acct-not-owner",
    owner_user_id: "99999999-9999-4999-8999-999999999999",
    stripe_customer_id: "cus_existing",
    locale: "en",
  };
  return {
    auth: {
      getUser: async (token: string) => token === "token-owner"
        ? { data: { user: { id: "11111111-1111-4111-8111-111111111111", email: "owner@example.com" } }, error: null }
        : { data: { user: null }, error: { message: "invalid" } },
    },
    rpc: async (name: string) => name === "ensure_account"
      ? { data: account.id, error: null }
      : { data: null, error: { message: "unhandled" } },
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        maybeSingle: async () => ({ data: account, error: null }),
      };
    },
  };
}

function bearer(token: string, body = "{}") {
  return new Request("https://pekkotv.com/api/billing/portal", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body,
  });
}

describe("billing portal", () => {
  it("requires a session", async () => {
    expect((await portal(new Request("https://pekkotv.com/api/billing/portal", { method: "POST", body: "{}" }))).status).toBe(401);
  });

  it("sends a trial with no Stripe customer to the plan picker", async () => {
    await me(new Request("https://pekkotv.com/api/me", { headers: { Authorization: "Bearer token-owner" } }));
    const res = await portal(bearer("token-owner", JSON.stringify({ customerId: "cus_other_org" })));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ action: "plans" });
  });

  it("does not open another org when this org has no customer", async () => {
    await me(new Request("https://pekkotv.com/api/me", { headers: { Authorization: "Bearer token-owner" } }));
    await me(new Request("https://pekkotv.com/api/me", { headers: { Authorization: "Bearer token-other" } }));
    const other = store.accounts.find((item) => item.owner_user_id === "22222222-2222-4222-8222-222222222222");
    if (other) other.stripe_customer_id = "cus_other";
    const res = await portal(bearer("token-owner", JSON.stringify({ customerId: "cus_other" })));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ action: "plans" });
  });

  it("accepts the app bearer token and returns a stable 403 not_owner shape", async () => {
    setTestDb(notOwnerDb() as never);
    const res = await portal(bearer("token-owner"));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: "Only the account owner can manage billing.",
      code: "not_owner",
    });
  });

  it("keeps the same 403 not_owner shape for a Dart User-Agent", async () => {
    setTestDb(notOwnerDb() as never);
    const res = await portal(new Request("https://pekkotv.com/api/billing/portal", {
      method: "POST",
      headers: {
        Authorization: "Bearer token-owner",
        "Content-Type": "application/json",
        "user-agent": "Dart/3.8.0 (dart:io)",
      },
      body: "{}",
    }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: "Only the account owner can manage billing.",
      code: "not_owner",
    });
  });
});
