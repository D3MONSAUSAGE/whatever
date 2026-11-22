import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

const mockStripe = {
  checkout: {
    sessions: {
      create: vi.fn(),
      retrieve: vi.fn(),
      expire: vi.fn(),
    },
  },
  subscriptions: {
    retrieve: vi.fn(),
    update: vi.fn(),
    resume: vi.fn(),
  },
  billingPortal: {
    sessions: {
      create: vi.fn(),
    },
  },
};

vi.mock("@/lib/server/stripe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/stripe")>();
  return {
    ...actual,
    stripe: () => mockStripe,
    stripeKey: () => "sk_test_paused_incomplete",
    priceFor: (plan: string) => {
      const prices: Record<string, string> = {
        starter: "price_starter",
        business: "price_business",
        multi: "price_multi",
      };
      return prices[plan] ?? null;
    },
  };
});

import { POST as checkout } from "@/app/api/billing/checkout/route";
import { POST as portal } from "@/app/api/billing/portal/route";
import { POST as createPlaylist } from "@/app/api/playlists/route";
import { GET as playerState } from "@/app/api/player/state/route";
import { setTestDb } from "@/lib/server/supabase";
import { sha256 } from "@/lib/server/crypto";
import type { EntitlementRow } from "@/lib/server/entitlements";
import { createFakeDb, type Store } from "./fake-db";

const previous: Record<string, string | undefined> = {};
function remember(name: string, value: string) {
  if (!(name in previous)) previous[name] = process.env[name];
  process.env[name] = value;
}

const ACCT_A = "aaaa1111-1111-4111-8111-111111111111";
const ACCT_B = "bbbb2222-2222-4222-8222-222222222222";
const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const USER_MEMBER = "33333333-3333-4333-8333-333333333333";
const DISP_A = "1111aaaa-1111-4111-8111-111111111111";
const DISP_B = "1111bbbb-1111-4111-8111-111111111111";
const TOKEN_DISP_A = "player-token-a-0123456789abcdef";
const TOKEN_DISP_B = "player-token-b-0123456789abcdef";

let store: Store;
let entitlements: Map<string, EntitlementRow>;
let accountByToken: Map<string, string>;

function entRow(overrides: Partial<EntitlementRow> = {}): EntitlementRow {
  return {
    state: "active",
    plan: "multi",
    screen_limit: 5,
    active_screens: 1,
    total_screens: 1,
    trial_started_at: null,
    trial_ends_at: null,
    playback_ends_at: null,
    subscription_status: "active",
    current_period_end: "2026-12-11T15:27:47.000Z",
    cancel_at_period_end: false,
    grace_ends_at: null,
    playback_allowed: true,
    can_add_screen: true,
    server_time: "2026-11-21T20:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  remember("BILLING_ENFORCE", "1");
  remember("STRIPE_LIVE_ENABLED", "0");
  remember("STRIPE_TEST_SECRET_KEY", "sk_test_paused_incomplete");
  remember("STRIPE_PRICE_STARTER", "price_starter");
  remember("STRIPE_PRICE_BUSINESS", "price_business");
  remember("STRIPE_PRICE_MULTI", "price_multi");

  const fake = createFakeDb();
  store = fake.store;
  entitlements = new Map();
  accountByToken = new Map([
    ["token-a", ACCT_A],
    ["token-member-a", ACCT_A],
    ["token-b", ACCT_B],
  ]);

  fake.addUser("token-a", USER_A, "a@example.com");
  fake.addUser("token-member-a", USER_MEMBER, "member@example.com");
  fake.addUser("token-b", USER_B, "b@example.com");

  store.accounts.push(
    {
      id: ACCT_A,
      name: "Cafe A",
      owner_user_id: USER_A,
      plan: "multi",
      stripe_customer_id: "cus_acct_a",
      stripe_subscription_id: "sub_acct_a",
      subscription_status: "paused",
      trial_started_at: "2026-11-01T08:00:00.000Z",
      trial_ends_at: "2026-11-15T08:00:00.000Z",
      locale: "en",
    },
    {
      id: ACCT_B,
      name: "Cafe B",
      owner_user_id: USER_B,
      plan: "trial",
      stripe_customer_id: "cus_acct_b",
      stripe_subscription_id: null,
      subscription_status: null,
      trial_started_at: "2026-11-15T08:00:00.000Z",
      trial_ends_at: "2026-11-29T08:00:00.000Z",
      locale: "en",
    },
  );
  store.displays.push(
    { id: DISP_A, account_id: ACCT_A, name: "A TV", status: "active", billing_active: true, token_hash: sha256(TOKEN_DISP_A), content_version: 1 },
    { id: DISP_B, account_id: ACCT_B, name: "B TV", status: "active", billing_active: true, token_hash: sha256(TOKEN_DISP_B), content_version: 1 },
  );

  const baseClient = fake.client as unknown as {
    auth: { getUser: (t: string) => Promise<{ data: { user: { id: string; email: string } | null }; error: unknown }> };
    from: (table: string) => unknown;
    rpc: (name: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
    storage: unknown;
  };

  setTestDb({
    auth: baseClient.auth,
    storage: baseClient.storage,
    from: baseClient.from,
    async rpc(name: string, args: Record<string, unknown> = {}) {
      if (name === "ensure_account") {
        // Resolve member to ACCT_A without changing owner_user_id
        const uid = String(args.p_user_id ?? "");
        if (uid === USER_A || uid === USER_MEMBER) return { data: ACCT_A, error: null };
        if (uid === USER_B) return { data: ACCT_B, error: null };
      }
      if (name === "account_entitlement") {
        const row = entitlements.get(String(args.p_account ?? ""));
        return { data: row ? [row] : [], error: null };
      }
      if (name === "display_entitled") {
        const disp = store.displays.find((d) => d.id === String(args.p_display ?? ""));
        if (!disp) return { data: false, error: null };
        const row = entitlements.get(String(disp.account_id));
        return { data: !!row?.playback_allowed, error: null };
      }
      if (name === "player_pending_commands") return { data: [], error: null };
      return baseClient.rpc(name, args);
    },
  } as never);

  // Reset mocks cleanly
  mockStripe.checkout.sessions.create.mockReset();
  mockStripe.checkout.sessions.retrieve.mockReset();
  mockStripe.checkout.sessions.expire.mockReset();
  mockStripe.subscriptions.retrieve.mockReset();
  mockStripe.subscriptions.update.mockReset();
  mockStripe.subscriptions.resume.mockReset();
  mockStripe.billingPortal.sessions.create.mockReset();
  void accountByToken;
  void createHash;
});

afterEach(() => {
  setTestDb(null);
  for (const [name, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

function postCheckout(token: string, body: object) {
  return checkout(new Request("https://pekkotv.com/api/billing/checkout", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
}

function postPortal(token: string, body: object = {}) {
  return portal(new Request("https://pekkotv.com/api/billing/portal", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
}

describe("Safeguard 2: paused & incomplete duplicate-checkout prevention and recovery", () => {
  it("blocks duplicate checkout for paused & incomplete owners (409 subscription_exists -> portal) without resuming or charging", async () => {
    for (const status of ["paused", "incomplete"] as const) {
      store.accounts[0].subscription_status = status;
      const res = await postCheckout("token-a", { plan: "business" });
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({
        error: "Use Manage billing to change this plan.",
        code: "subscription_exists",
        action: "portal",
      });
      expect(mockStripe.checkout.sessions.create).not.toHaveBeenCalled();
      expect(mockStripe.subscriptions.update).not.toHaveBeenCalled();
      expect(mockStripe.subscriptions.resume).not.toHaveBeenCalled();
    }
  });

  it("blocks duplicate checkout even when DB says active but Stripe subscription is paused/incomplete", async () => {
    for (const liveStatus of ["paused", "incomplete"] as const) {
      mockStripe.subscriptions.retrieve.mockResolvedValue({
        id: "sub_acct_a",
        status: liveStatus,
        items: { data: [{ id: "si_1", price: { id: "price_multi" } }] },
      });
      store.accounts[0].subscription_status = "active";
      const res = await postCheckout("token-a", { plan: "business" });
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({
        error: "Use Manage billing to change this plan.",
        code: "subscription_exists",
        action: "portal",
      });
      expect(mockStripe.subscriptions.update).not.toHaveBeenCalled();
      expect(mockStripe.subscriptions.resume).not.toHaveBeenCalled();
      expect(mockStripe.checkout.sessions.create).not.toHaveBeenCalled();
    }
  });

  it("enforces owner-only authorization (403 not_owner) and tenant isolation on checkout & portal for paused accounts", async () => {
    store.accounts[0].subscription_status = "paused";

    // Non-owner in the same org gets 403 not_owner on both checkout and portal
    const nonOwnerCheckout = await postCheckout("token-member-a", { plan: "business" });
    expect(nonOwnerCheckout.status).toBe(403);
    expect(await nonOwnerCheckout.json()).toEqual({
      error: "Only the account owner can change the plan.",
      code: "not_owner",
    });

    const nonOwnerPortal = await postPortal("token-member-a");
    expect(nonOwnerPortal.status).toBe(403);
    expect(await nonOwnerPortal.json()).toEqual({
      error: "Only the account owner can manage billing.",
      code: "not_owner",
    });
    expect(mockStripe.billingPortal.sessions.create).not.toHaveBeenCalled();

    // Owner of paused org opens Portal strictly for their own org's stripe_customer_id (ignores forged customerId)
    mockStripe.billingPortal.sessions.create.mockResolvedValue({ url: "https://billing.stripe.com/p/session/paused_a" });
    const ownerPortal = await postPortal("token-a", { customerId: "cus_acct_b" });
    expect(ownerPortal.status).toBe(200);
    expect(await ownerPortal.json()).toEqual({ url: "https://billing.stripe.com/p/session/paused_a" });
    expect(mockStripe.billingPortal.sessions.create).toHaveBeenCalledWith({
      customer: "cus_acct_a",
      return_url: "https://pekkotv.com/dashboard/account",
    });
    expect(mockStripe.subscriptions.resume).not.toHaveBeenCalled();
    expect(mockStripe.subscriptions.update).not.toHaveBeenCalled();

    // Tenant B (trial, no subscription) is completely unaffected and can start Checkout normally
    mockStripe.checkout.sessions.create.mockResolvedValue({
      id: "cs_tenant_b",
      url: "https://checkout.stripe.com/c/pay/cs_tenant_b",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    });
    const bCheckout = await postCheckout("token-b", { plan: "starter" });
    expect(bCheckout.status).toBe(200);
    expect(await bCheckout.json()).toEqual({ url: "https://checkout.stripe.com/c/pay/cs_tenant_b" });
  });

  it("allows fresh Checkout once incomplete_expired or canceled", async () => {
    store.accounts[0].subscription_status = "incomplete_expired";
    mockStripe.checkout.sessions.create.mockResolvedValue({
      id: "cs_retry",
      url: "https://checkout.stripe.com/c/pay/cs_retry",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    });
    const res = await postCheckout("token-a", { plan: "business" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://checkout.stripe.com/c/pay/cs_retry" });
    expect(mockStripe.checkout.sessions.create).toHaveBeenCalledTimes(1);
  });

  it("preserves trial playback continuity when incomplete/incomplete_expired while locking paused and trial_grace writes", async () => {
    // Tenant A: trial with incomplete initial payment -> playback 200 and writes 200
    entitlements.set(ACCT_A, entRow({
      state: "trial",
      plan: "trial",
      screen_limit: 5,
      trial_started_at: "2026-11-01T08:00:00.000Z",
      trial_ends_at: "2026-11-15T08:00:00.000Z",
      playback_ends_at: "2026-11-18T08:00:00.000Z",
      subscription_status: "incomplete",
      playback_allowed: true,
      can_add_screen: true,
      server_time: "2026-11-10T08:00:00.000Z",
    }));
    // Tenant B: active paid plan stays completely unaffected
    entitlements.set(ACCT_B, entRow({ state: "active", plan: "multi", playback_allowed: true }));

    expect((await playerState(new Request("https://pekkotv.com/api/player/state", {
      headers: { "x-display-token": TOKEN_DISP_A },
    }))).status).toBe(200);
    expect((await createPlaylist(new Request("https://pekkotv.com/api/playlists", {
      method: "POST",
      headers: { Authorization: "Bearer token-a", "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Trial Playlist", items: [] }),
    }))).status).not.toBe(403);

    // Tenant A enters 3-day trial_grace after incomplete_expired -> playback stays 200, writes locked 403
    entitlements.set(ACCT_A, entRow({
      state: "trial_grace",
      plan: "trial",
      screen_limit: 5,
      trial_started_at: "2026-11-01T08:00:00.000Z",
      trial_ends_at: "2026-11-15T08:00:00.000Z",
      playback_ends_at: "2026-11-18T08:00:00.000Z",
      subscription_status: "incomplete_expired",
      playback_allowed: true,
      can_add_screen: false,
      server_time: "2026-11-16T08:00:00.000Z",
    }));
    expect((await playerState(new Request("https://pekkotv.com/api/player/state", {
      headers: { "x-display-token": TOKEN_DISP_A },
    }))).status).toBe(200);
    const graceWrite = await createPlaylist(new Request("https://pekkotv.com/api/playlists", {
      method: "POST",
      headers: { Authorization: "Bearer token-a", "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Grace Blocked", items: [] }),
    }));
    expect(graceWrite.status).toBe(403);
    expect(await graceWrite.json()).toMatchObject({ code: "subscription_inactive" });

    // Tenant A paused paid subscription -> player 402, writes 403, Tenant B player stays 200
    entitlements.set(ACCT_A, entRow({
      state: "canceled",
      plan: "multi",
      screen_limit: 0,
      subscription_status: "paused",
      playback_allowed: false,
      can_add_screen: false,
    }));
    expect((await playerState(new Request("https://pekkotv.com/api/player/state", {
      headers: { "x-display-token": TOKEN_DISP_A },
    }))).status).toBe(402);
    expect((await playerState(new Request("https://pekkotv.com/api/player/state", {
      headers: { "x-display-token": TOKEN_DISP_B },
    }))).status).toBe(200);
  });
});
