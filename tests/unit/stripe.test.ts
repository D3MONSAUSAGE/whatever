import { describe, expect, it } from "vitest";
import Stripe from "stripe";
import { planForPrice, stripeKey } from "@/lib/server/stripe";

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
