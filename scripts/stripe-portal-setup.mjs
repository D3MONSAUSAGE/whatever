#!/usr/bin/env node
// Idempotently creates Pekko's TEST-mode Customer Portal configuration.
// Usage: STRIPE_TEST_SECRET_KEY=sk_test_... node scripts/stripe-portal-setup.mjs
// Refuses any key that is not sk_test_. Does not call live Stripe.
// Safe to re-run: finds the configuration by metadata pekko=billing-safety.
import Stripe from "stripe";

const key = process.env.STRIPE_TEST_SECRET_KEY || "";
if (!key.startsWith("sk_test_")) {
  console.error("Refusing: STRIPE_TEST_SECRET_KEY must be a test key (sk_test_...). Live Stripe is not touched.");
  process.exit(1);
}
const stripe = new Stripe(key);
const LOOKUPS = [
  { plan: "starter", lookup: "pekko_starter_monthly_usd" },
  { plan: "business", lookup: "pekko_business_monthly_usd" },
  { plan: "multiscreen", lookup: "pekko_multiscreen_monthly_usd" },
];

const products = [];
for (const item of LOOKUPS) {
  const found = await stripe.prices.list({ lookup_keys: [item.lookup], active: true, limit: 1 });
  const price = found.data[0];
  if (!price || price.livemode) {
    console.error(`Missing test price for ${item.lookup}. Run scripts/stripe-test-setup.mjs first.`);
    process.exit(1);
  }
  const product = typeof price.product === "string" ? price.product : price.product.id;
  const existing = products.find((row) => row.product === product);
  if (existing) existing.prices.push(price.id);
  else products.push({ product, prices: [price.id] });
}

const features = {
  payment_method_update: { enabled: true },
  invoice_history: { enabled: true },
  subscription_cancel: { enabled: true, mode: "at_period_end", proration_behavior: "none" },
  subscription_update: {
    enabled: true,
    default_allowed_updates: ["price"],
    proration_behavior: "create_prorations",
    products,
  },
};

const listed = await stripe.billingPortal.configurations.list({ limit: 100 });
const current = listed.data.find((row) => row.metadata?.pekko === "billing-safety" && !row.livemode);
if (current) {
  const updated = await stripe.billingPortal.configurations.update(current.id, { features, active: true });
  console.error(`updated ${updated.id}`);
  console.log(updated.id);
} else {
  const created = await stripe.billingPortal.configurations.create({
    metadata: { pekko: "billing-safety" },
    features,
    business_profile: { headline: "Manage your Pekko plan" },
  }, { idempotencyKey: "pekko-portal-billing-safety-v1" });
  console.error(`created ${created.id}`);
  console.log(created.id);
}
