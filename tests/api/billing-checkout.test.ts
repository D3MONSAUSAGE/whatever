import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sessions = {
  create: vi.fn(),
  retrieve: vi.fn(),
  expire: vi.fn(),
};

vi.mock("@/lib/server/stripe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/stripe")>();
  return {
    ...actual,
    stripe: () => ({ checkout: { sessions } }),
    stripeKey: () => "sk_test_checkout_123",
    priceFor: (plan: string) => {
      const prices: Record<string, string> = { starter: "price_starter", business: "price_business", multi: "price_multi" };
      return prices[plan] ?? null;
    },
  };
});

import { GET as me } from "@/app/api/me/route";
import { POST as checkout } from "@/app/api/billing/checkout/route";
import { setTestDb } from "@/lib/server/supabase";
import { createFakeDb, type Store } from "./fake-db";

const previous: Record<string, string | undefined> = {};
let store: Store;

function remember(name: string, value: string) {
  if (!(name in previous)) previous[name] = process.env[name];
  process.env[name] = value;
}

beforeEach(() => {
  const fake = createFakeDb();
  store = fake.store;
  setTestDb(fake.client);
  remember("STRIPE_LIVE_ENABLED", "0");
  remember("STRIPE_TEST_SECRET_KEY", "sk_test_checkout_123");
  remember("STRIPE_PRICE_STARTER", "price_starter");
  remember("STRIPE_PRICE_BUSINESS", "price_business");
  remember("STRIPE_PRICE_MULTI", "price_multi");
  fake.addUser("token-owner", "11111111-1111-4111-8111-111111111111", "owner@example.com");
  sessions.create.mockReset();
  sessions.retrieve.mockReset();
  sessions.expire.mockReset();
});

afterEach(() => {
  setTestDb(null);
  for (const [name, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

function post(body: object) {
  return checkout(new Request("https://pekkotv.com/api/billing/checkout", {
    method: "POST",
    headers: { Authorization: "Bearer token-owner", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
}

async function account() {
  await me(new Request("https://pekkotv.com/api/me", { headers: { Authorization: "Bearer token-owner" } }));
  const row = store.accounts.find((item) => item.owner_user_id === "11111111-1111-4111-8111-111111111111");
  if (!row) throw new Error("missing account");
  return row;
}

function withOpenTrial(row: Store["accounts"][number]) {
  const start = new Date();
  row.trial_started_at = start.toISOString();
  row.trial_ends_at = new Date(start.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();
  return row;
}

describe("billing checkout resume", () => {
  it("creates a session and stores it on the account", async () => {
    const row = withOpenTrial(await account());
    sessions.create.mockResolvedValue({
      id: "cs_test_new",
      url: "https://checkout.stripe.com/c/pay/cs_test_new",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    });
    const res = await post({ plan: "multi" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://checkout.stripe.com/c/pay/cs_test_new" });
    expect(sessions.create).toHaveBeenCalledTimes(1);
    const created = sessions.create.mock.calls[0][0] as { subscription_data?: { trial_end?: number }; payment_method_types?: string[] };
    expect(created.subscription_data?.trial_end).toBeGreaterThan(Math.floor(Date.now() / 1000) + 47 * 60 * 60);
    expect(created.payment_method_types).toEqual(["card"]);
    expect(row.checkout_session_id).toBe("cs_test_new");
    expect(row.checkout_session_price).toBe("price_multi");
  });

  it("resumes an eligible open session instead of creating a second one", async () => {
    const row = withOpenTrial(await account());
    const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    row.checkout_session_id = "cs_test_open";
    row.checkout_session_price = "price_multi";
    row.checkout_session_expires_at = expires;
    sessions.retrieve.mockResolvedValue({
      id: "cs_test_open",
      status: "open",
      url: "https://checkout.stripe.com/c/pay/cs_test_open",
      client_reference_id: row.id,
      amount_total: 0,
    });
    const res = await post({ plan: "multi" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://checkout.stripe.com/c/pay/cs_test_open", resumed: true });
    expect(sessions.create).not.toHaveBeenCalled();
    expect(sessions.expire).not.toHaveBeenCalled();
  });


  it("does not resume a due-today session when the trial should defer the first charge", async () => {
    const row = withOpenTrial(await account());
    row.checkout_session_id = "cs_test_due";
    row.checkout_session_price = "price_multi";
    row.checkout_session_expires_at = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    sessions.retrieve.mockResolvedValue({
      id: "cs_test_due",
      status: "open",
      url: "https://checkout.stripe.com/c/pay/cs_test_due",
      client_reference_id: row.id,
      amount_total: 5900,
    });
    sessions.expire.mockResolvedValue({ id: "cs_test_due", status: "expired" });
    sessions.create.mockResolvedValue({
      id: "cs_test_deferred",
      url: "https://checkout.stripe.com/c/pay/cs_test_deferred",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    });
    const res = await post({ plan: "multi" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://checkout.stripe.com/c/pay/cs_test_deferred" });
    expect(sessions.expire).toHaveBeenCalledWith("cs_test_due");
    expect(sessions.create).toHaveBeenCalledTimes(1);
    const created = sessions.create.mock.calls[0][0] as { subscription_data?: { trial_end?: number } };
    expect(created.subscription_data?.trial_end).toBeGreaterThan(Math.floor(Date.now() / 1000) + 47 * 60 * 60);
  });

  it("expires only this org's session when replace is true, then creates a new one", async () => {
    const row = await account();
    row.checkout_session_id = "cs_test_old";
    row.checkout_session_price = "price_multi";
    row.checkout_session_expires_at = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    sessions.retrieve.mockResolvedValue({
      id: "cs_test_old",
      status: "open",
      url: "https://checkout.stripe.com/c/pay/cs_test_old",
      client_reference_id: row.id,
    });
    sessions.expire.mockResolvedValue({ id: "cs_test_old", status: "expired" });
    sessions.create.mockResolvedValue({
      id: "cs_test_replacement",
      url: "https://checkout.stripe.com/c/pay/cs_test_replacement",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    });
    const res = await post({ plan: "multi", replace: true });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://checkout.stripe.com/c/pay/cs_test_replacement" });
    expect(sessions.expire).toHaveBeenCalledWith("cs_test_old");
    expect(sessions.create).toHaveBeenCalledTimes(1);
    expect(row.checkout_session_id).toBe("cs_test_replacement");
  });

  it("refuses to expire a checkout session that belongs to another org", async () => {
    const row = await account();
    row.checkout_session_id = "cs_test_other";
    row.checkout_session_price = "price_starter";
    row.checkout_session_expires_at = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    sessions.retrieve.mockResolvedValue({
      id: "cs_test_other",
      status: "open",
      url: "https://checkout.stripe.com/c/pay/cs_test_other",
      client_reference_id: "other-org-id",
    });
    const res = await post({ plan: "multi" });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "checkout_conflict" });
    expect(sessions.expire).not.toHaveBeenCalled();
    expect(sessions.create).not.toHaveBeenCalled();
  });
});
