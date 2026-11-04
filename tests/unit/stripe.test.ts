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
