import { describe, expect, it } from "vitest";
import Stripe from "stripe";
import { billingReturnOrigin, checkoutAction, checkoutBlocked, checkoutSessionRequest, CHECKOUT_API_VERSION, periodEndSeconds, planForPrice, portalAccess, portalReturnUrl, portalSessionParams, priceFor, stripeKey, subscriptionPriceChange, webhookEventAllowed, webhookSecret, WEBHOOK_API_VERSION } from "@/lib/server/stripe";

describe("stripe test mode guard", () => {
  it("refuses live and missing keys", () => {
    expect(stripeKey({ STRIPE_TEST_SECRET_KEY: "sk_live_abc" })).toBeNull();
    expect(stripeKey({})).toBeNull();
    expect(stripeKey({ STRIPE_TEST_SECRET_KEY: "sk_test_abc" })).toBe("sk_test_abc");
  });
  it("maps prices to plans", () => {
    const env = { STRIPE_PRICE_STARTER: "p1", STRIPE_PRICE_BUSINESS: "p2", STRIPE_PRICE_MULTI: "p3" };
    expect(planForPrice("p2", env)).toBe("business");
    expect(planForPrice("x", env)).toBeNull();
  });
  it("webhook signatures verify and tampering fails", () => {
    const s = new Stripe("sk_test_dummy");
    const secret = "whsec_test";
    const payload = JSON.stringify({ id: "evt_1", object: "event", type: "ping", livemode: false, data: { object: {} } });
    const header = s.webhooks.generateTestHeaderString({ payload, secret });
    expect(s.webhooks.constructEvent(payload, header, secret).id).toBe("evt_1");
    expect(() => s.webhooks.constructEvent(payload.replace("evt_1", "evt_2"), header, secret)).toThrow();
    const old = s.webhooks.generateTestHeaderString({ payload, secret, timestamp: Math.floor(Date.now() / 1000) - 3600 });
    expect(() => s.webhooks.constructEvent(payload, old, secret)).toThrow();
  });
});

describe("billing env diagnostics", () => {
  it("names missing vars and rejects a live key without returning values", async () => {
    const { billingDiagnostics } = await import("@/lib/server/stripe");
    const prices = { STRIPE_PRICE_STARTER: "price_a", STRIPE_PRICE_BUSINESS: "price_b", STRIPE_PRICE_MULTI: "price_c" };
    const missing = billingDiagnostics({ STRIPE_WEBHOOK_SECRET: "whsec_ok", ...prices });
    expect(missing.missing).toEqual(["STRIPE_TEST_SECRET_KEY"]);
    expect(missing.available).toBe(false);
    expect(JSON.stringify(missing)).not.toContain("whsec_ok");
    const live = billingDiagnostics({ STRIPE_TEST_SECRET_KEY: "sk_live_secret", STRIPE_WEBHOOK_SECRET: "whsec_ok", ...prices });
    expect(live.rejected).toEqual(["STRIPE_TEST_SECRET_KEY"]);
    expect(live.shapes.STRIPE_TEST_SECRET_KEY.prefix).toBe("sk_live_");
    expect(live.shapes.STRIPE_TEST_SECRET_KEY.length).toBe("sk_live_secret".length);
    expect(JSON.stringify(live)).not.toContain("sk_live_secret");
    const redacted = billingDiagnostics({ STRIPE_TEST_SECRET_KEY: "[REDACTED]", STRIPE_WEBHOOK_SECRET: "whsec_ok", ...prices });
    expect(redacted.rejected).toEqual(["STRIPE_TEST_SECRET_KEY"]);
    expect(redacted.shapes.STRIPE_TEST_SECRET_KEY.redacted).toBe(true);
    expect(redacted.available).toBe(false);
    const quoted = billingDiagnostics({ STRIPE_TEST_SECRET_KEY: "\"sk_test_abc\"", STRIPE_WEBHOOK_SECRET: "whsec_ok", ...prices });
    expect(quoted.available).toBe(true);
    expect(quoted.missing).toEqual([]);
  });
});

describe("billing return origin", () => {
  const preview = { VERCEL_ENV: "preview" } as unknown as NodeJS.ProcessEnv;
  const prod = { VERCEL_ENV: "production", NEXT_PUBLIC_APP_URL: "https://pekkotv.com" } as unknown as NodeJS.ProcessEnv;
  it("keeps a preview on its own origin", () => {
    expect(portalReturnUrl("https://pantalla-git-billing-safety-teamtegrate.vercel.app", preview)).toBe("https://pantalla-git-billing-safety-teamtegrate.vercel.app/dashboard/account");
    expect(billingReturnOrigin("https://pantalla-ierg3rdh0-teamtegrate.vercel.app", preview)).toBe("https://pantalla-ierg3rdh0-teamtegrate.vercel.app");
    expect(billingReturnOrigin("https://pantalla-chi.vercel.app", preview)).toBe("https://pantalla-chi.vercel.app");
  });
  it("always lands production customers on pekkotv.com", () => {
    expect(portalReturnUrl("https://pekkotv.com", prod)).toBe("https://pekkotv.com/dashboard/account");
    expect(billingReturnOrigin("https://www.pekkotv.com", prod)).toBe("https://www.pekkotv.com");
    expect(billingReturnOrigin("https://pantalla-chi.vercel.app", prod)).toBe("https://pekkotv.com");
    expect(billingReturnOrigin("https://pantalla-git-main-teamtegrate.vercel.app", prod)).toBe("https://pekkotv.com");
  });
  it("falls back to the site URL for hosts off the allowlist", () => {
    for (const bad of ["https://evil.example", "https://pekkotv.com.evil.example", "https://other-teamtegrate.vercel.app", "http://pantalla-x-teamtegrate.vercel.app", "https://pekkotv.com:8443", "not a url"]) {
      expect(billingReturnOrigin(bad, preview)).toBe("https://pekkotv.com");
    }
  });
});

describe("billing portal and plan changes", () => {
  it("sends the portal back to the account page and never a vercel.app host", () => {
    expect(portalReturnUrl("https://pekkotv.com/dashboard/billing")).toBe("https://pekkotv.com/dashboard/account");
    expect(billingReturnOrigin("https://pantalla-abc.vercel.app")).toBe("https://pekkotv.com");
    expect(portalReturnUrl("https://pantalla-abc.vercel.app")).not.toContain("vercel.app");
    expect(portalSessionParams("cus_1", "https://pekkotv.com/dashboard/account")).toEqual({
      customer: "cus_1",
      return_url: "https://pekkotv.com/dashboard/account",
    });
  });
  it("updates the existing item and keeps the trial end", () => {
    expect(checkoutBlocked("active")).toBe(true);
    expect(checkoutBlocked("trialing")).toBe(true);
    expect(checkoutBlocked("past_due")).toBe(true);
    expect(checkoutBlocked("canceled")).toBe(false);
    expect(checkoutBlocked(null)).toBe(false);
    expect(checkoutAction({ status: "active", subscriptionId: "sub_1", currentPriceId: "price_start", nextPriceId: "price_biz" })).toBe("update");
    expect(checkoutAction({ status: "trialing", subscriptionId: "sub_1", currentPriceId: "price_biz", nextPriceId: "price_start" })).toBe("update");
    expect(checkoutAction({ status: "active", subscriptionId: "sub_1", currentPriceId: "price_biz", nextPriceId: "price_biz" })).toBe("same");
    expect(checkoutAction({ status: "past_due", subscriptionId: "sub_1", currentPriceId: "price_start", nextPriceId: "price_biz" })).toBe("portal");
    expect(checkoutAction({ status: "active", subscriptionId: "sub_1", currentPriceId: null, nextPriceId: "price_biz" })).toBe("portal");
    expect(checkoutAction({ status: "canceled", subscriptionId: "sub_1", currentPriceId: "price_start", nextPriceId: "price_biz" })).toBe("checkout");
    expect(checkoutAction({ status: null, subscriptionId: null, currentPriceId: null, nextPriceId: "price_biz" })).toBe("checkout");
    expect(subscriptionPriceChange({ subscriptionItemId: "si_1", price: "price_biz", trialEnd: 1_700_000_000 })).toEqual({
      items: [{ id: "si_1", price: "price_biz" }],
      proration_behavior: "create_prorations",
      trial_end: 1_700_000_000,
    });
    expect(subscriptionPriceChange({ subscriptionItemId: "si_1", price: "price_biz", trialEnd: null }).trial_end).toBeUndefined();
    expect(portalAccess({ userId: "user-b", ownerUserId: "user-a", customerId: "cus_a" })).toEqual({ ok: false, status: 403, code: "not_owner" });
    expect(portalAccess({ userId: "user-a", ownerUserId: "user-a", customerId: null })).toEqual({ ok: false, status: 200, code: "plans" });
    expect(portalAccess({ userId: "user-a", ownerUserId: "user-a", customerId: "cus_a" })).toEqual({ ok: true, customerId: "cus_a" });
  });
});

describe("checkout session", () => {
  const input = {
    price: "price_biz",
    accountId: "acct_1",
    email: "owner@example.com",
    customerId: null as string | null,
    origin: "https://preview.example",
    managedPayments: undefined as string | undefined,
    secretKey: "sk_test_abc" as string | undefined,
  };
  it("disables Managed Payments on basil and leaves the client on acacia", () => {
    const client = new Stripe("sk_test_dummy");
    expect((client as unknown as { getApiField(key: string): string }).getApiField("version")).toBe(WEBHOOK_API_VERSION);
    expect(WEBHOOK_API_VERSION).toBe("2025-02-24.acacia");
    const off = checkoutSessionRequest(input);
    expect(off.ok).toBe(true);
    if (!off.ok) return;
    expect(off.options.apiVersion).toBe(CHECKOUT_API_VERSION);
    expect(CHECKOUT_API_VERSION).toBe("2025-03-31.basil");
    expect(off.params.managed_payments).toEqual({ enabled: false });
    expect(off.params.mode).toBe("subscription");
    const on = checkoutSessionRequest({ ...input, managedPayments: "1", customerId: "cus_1" });
    expect(on.ok).toBe(true);
    if (!on.ok) return;
    expect(on.params.managed_payments).toEqual({ enabled: true });
    expect(on.params).toMatchObject({ customer: "cus_1" });
    const spelled = checkoutSessionRequest({ ...input, managedPayments: "true" });
    expect(spelled.ok && spelled.params.managed_payments?.enabled).toBe(false);
  });
  it("opts live Checkout out of Managed Payments only when STRIPE_MANAGED_PAYMENTS is 0", () => {
    const unset = checkoutSessionRequest({ ...input, secretKey: "sk_live_abc", managedPayments: undefined });
    expect(unset.ok).toBe(false);
    if (!unset.ok) {
      expect(unset.code).toBe("managed_payments_config");
      expect(unset.error).toMatch(/STRIPE_MANAGED_PAYMENTS/);
      expect(unset.error).toMatch(/unset/);
    }
    const blank = checkoutSessionRequest({ ...input, secretKey: "sk_live_abc", managedPayments: "  " });
    expect(blank.ok).toBe(false);
    const other = checkoutSessionRequest({ ...input, secretKey: "sk_live_abc", managedPayments: "1" });
    expect(other.ok).toBe(false);
    const optedOut = checkoutSessionRequest({ ...input, secretKey: "sk_live_abc", managedPayments: "0" });
    expect(optedOut.ok).toBe(true);
    if (optedOut.ok) expect(optedOut.params.managed_payments).toEqual({ enabled: false });
    const quoted = checkoutSessionRequest({ ...input, secretKey: "\"sk_test_abc\"", managedPayments: undefined });
    expect(quoted.ok).toBe(true);
    if (quoted.ok) expect(quoted.params.managed_payments).toEqual({ enabled: false });
  });
  it("reads the period end from the subscription or, on basil, from the items", () => {
    const asSub = (value: unknown) => periodEndSeconds(value as Stripe.Subscription);
    expect(asSub({ status: "active", current_period_end: 100, items: { data: [{ current_period_end: 200 }] } })).toBe(100);
    expect(asSub({ status: "active", items: { data: [{ current_period_end: 200 }, { current_period_end: 150 }] } })).toBe(150);
    expect(asSub({ status: "trialing", trial_end: 80, current_period_end: 100 })).toBe(80);
    expect(asSub({ status: "active" })).toBeNull();
  });
});

describe("live mode stays off and does not share secrets with test", () => {
  const testPrices = { STRIPE_PRICE_STARTER: "price_test_s", STRIPE_PRICE_BUSINESS: "price_test_b", STRIPE_PRICE_MULTI: "price_test_m" };
  const livePrices = { STRIPE_LIVE_PRICE_STARTER: "price_live_s", STRIPE_LIVE_PRICE_BUSINESS: "price_live_b", STRIPE_LIVE_PRICE_MULTI: "price_live_m" };
  it("refuses an sk_live_ key until STRIPE_LIVE_ENABLED is exactly 1", () => {
    expect(stripeKey({ STRIPE_LIVE_SECRET_KEY: "sk_live_abc", STRIPE_TEST_SECRET_KEY: "sk_test_abc" })).toBe("sk_test_abc");
    expect(stripeKey({ STRIPE_LIVE_ENABLED: "true", STRIPE_LIVE_SECRET_KEY: "sk_live_abc" })).toBeNull();
    expect(stripeKey({ STRIPE_LIVE_ENABLED: "1", STRIPE_LIVE_SECRET_KEY: "sk_live_abc", STRIPE_TEST_SECRET_KEY: "sk_test_abc" })).toBe("sk_live_abc");
    expect(stripeKey({ STRIPE_LIVE_ENABLED: "1", STRIPE_LIVE_SECRET_KEY: "sk_test_nope", STRIPE_TEST_SECRET_KEY: "sk_test_abc" })).toBeNull();
  });
  it("never falls back across price or webhook secrets", () => {
    expect(priceFor("business", { ...testPrices, ...livePrices })).toBe("price_test_b");
    expect(priceFor("business", { STRIPE_LIVE_ENABLED: "1", ...testPrices, ...livePrices })).toBe("price_live_b");
    expect(priceFor("business", { STRIPE_LIVE_ENABLED: "1", ...testPrices })).toBeNull();
    expect(planForPrice("price_test_b", { STRIPE_LIVE_ENABLED: "1", ...testPrices, ...livePrices })).toBeNull();
    expect(planForPrice("price_live_b", { STRIPE_LIVE_ENABLED: "1", ...livePrices })).toBe("business");
    expect(webhookSecret({ STRIPE_WEBHOOK_SECRET: "whsec_test", STRIPE_LIVE_WEBHOOK_SECRET: "whsec_live" })).toBe("whsec_test");
    expect(webhookSecret({ STRIPE_LIVE_ENABLED: "1", STRIPE_WEBHOOK_SECRET: "whsec_test", STRIPE_LIVE_WEBHOOK_SECRET: "whsec_live" })).toBe("whsec_live");
    expect(webhookEventAllowed(true, {})).toBe(false);
    expect(webhookEventAllowed(false, { STRIPE_LIVE_ENABLED: "1" })).toBe(false);
    expect(webhookEventAllowed(true, { STRIPE_LIVE_ENABLED: "1" })).toBe(true);
  });
});

describe("checkout availability", () => {
  it("needs a test key and all prices", async () => {
    const { checkoutAvailable } = await import("@/lib/server/stripe");
    const prices = { STRIPE_PRICE_STARTER: "a", STRIPE_PRICE_BUSINESS: "b", STRIPE_PRICE_MULTI: "c" };
    expect(checkoutAvailable({})).toBe(false);
    expect(checkoutAvailable({ STRIPE_TEST_SECRET_KEY: "sk_live_x", ...prices })).toBe(false);
    expect(checkoutAvailable({ STRIPE_TEST_SECRET_KEY: "sk_test_x", STRIPE_PRICE_STARTER: "a" })).toBe(false);
    expect(checkoutAvailable({ STRIPE_TEST_SECRET_KEY: "sk_test_x", ...prices })).toBe(true);
  });
});
