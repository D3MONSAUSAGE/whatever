import { describe, expect, it } from "vitest";
import {
  cachedPaymentMethod,
  checkoutPendingFromRow,
  PAYMENT_METHOD_TTL_MS,
  paymentMethodFromStripe,
  paymentMethodFromSubscription,
  resolvePaymentMethod,
} from "@/lib/server/billing-status";
import type Stripe from "stripe";

const NOW = Date.parse("2026-11-21T20:00:00.000Z");

describe("payment method cache", () => {
  it("reads brand and last4 from an expanded Stripe card", () => {
    expect(paymentMethodFromStripe({
      card: { brand: "Visa", last4: "4242" },
    } as Stripe.PaymentMethod)).toEqual({ brand: "visa", last4: "4242" });
    expect(paymentMethodFromStripe("pm_123")).toBeNull();
    expect(paymentMethodFromStripe(null)).toBeNull();
  });

  it("treats a fresh cache as authoritative and a stale cache as refreshable", () => {
    const row = {
      payment_method_brand: "visa",
      payment_method_last4: "4242",
      payment_method_synced_at: new Date(NOW - 60_000).toISOString(),
    };
    expect(cachedPaymentMethod(row, NOW)).toEqual({ pm: { brand: "visa", last4: "4242" }, fresh: true, exists: true });
    const stale = cachedPaymentMethod({
      ...row,
      payment_method_synced_at: new Date(NOW - PAYMENT_METHOD_TTL_MS - 1).toISOString(),
    }, NOW);
    expect(stale.fresh).toBe(false);
    expect(stale.pm).toEqual({ brand: "visa", last4: "4242" });
  });

  it("never treats an open unpaid checkout as a payment method", () => {
    const pending = checkoutPendingFromRow({
      checkout_session_id: "cs_test_1",
      checkout_session_price: "price_multi",
      checkout_session_expires_at: new Date(NOW + 3_600_000).toISOString(),
    }, NOW);
    expect(pending?.session_id).toBe("cs_test_1");
    expect(cachedPaymentMethod({
      checkout_session_id: "cs_test_1",
      checkout_session_price: "price_multi",
      checkout_session_expires_at: new Date(NOW + 3_600_000).toISOString(),
    }, NOW).pm).toBeNull();
  });

  it("hides an expired stored checkout session", () => {
    expect(checkoutPendingFromRow({
      checkout_session_id: "cs_test_1",
      checkout_session_price: "price_multi",
      checkout_session_expires_at: new Date(NOW - 1).toISOString(),
    }, NOW)).toBeNull();
  });

  it("keeps the stale cache when Stripe is down", async () => {
    const row = {
      stripe_customer_id: "cus_1",
      payment_method_brand: "mastercard",
      payment_method_last4: "4444",
      payment_method_synced_at: new Date(NOW - PAYMENT_METHOD_TTL_MS - 1).toISOString(),
    };
    const pm = await resolvePaymentMethod("acct_1", row, async () => "error", NOW);
    expect(pm).toEqual({ brand: "mastercard", last4: "4444" });
  });

  it("reads an expanded default payment method off a subscription", () => {
    expect(paymentMethodFromSubscription({
      default_payment_method: { card: { brand: "amex", last4: "0005" } },
    } as Stripe.Subscription)).toEqual({ brand: "amex", last4: "0005" });
  });
});
