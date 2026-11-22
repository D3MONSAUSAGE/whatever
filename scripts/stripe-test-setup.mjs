#!/usr/bin/env node
// Idempotently creates Pekko's 3 TEST-mode products + monthly USD prices.
// Usage: STRIPE_TEST_SECRET_KEY=rk_test_... (or sk_test_...) node scripts/stripe-test-setup.mjs
// Refuses live keys and refuses to run if STRIPE_LIVE_ENABLED=1. Safe to re-run: finds prices by lookup_key.
import Stripe from "stripe";

if (process.env.STRIPE_LIVE_ENABLED === "1") {
  console.error("Refusing: STRIPE_LIVE_ENABLED=1 is set. Test setup only runs in test mode.");
  process.exit(1);
}
const key = (process.env.STRIPE_TEST_SECRET_KEY || "").trim();
if (!key.startsWith("sk_test_") && !key.startsWith("rk_test_")) {
  console.error("Refusing: STRIPE_TEST_SECRET_KEY must be a test key (sk_test_... or rk_test_...).");
  process.exit(1);
}
const stripe = new Stripe(key);
const PLANS = [
  { plan: "starter", appPlan: "starter", name: "Pekko Starter", cents: 1900, screens: 1, env: "STRIPE_PRICE_STARTER" },
  { plan: "business", appPlan: "business", name: "Pekko Business", cents: 3900, screens: 3, env: "STRIPE_PRICE_BUSINESS" },
  { plan: "multiscreen", appPlan: "multi", name: "Pekko Multi-screen", cents: 5900, screens: 5, env: "STRIPE_PRICE_MULTI" },
];

const out = [];
for (const p of PLANS) {
  const lookup = `pekko_${p.plan}_monthly_usd`;
  const found = await stripe.prices.list({ lookup_keys: [lookup], active: true, limit: 1 });
  let price = found.data[0];
  if (price && (price.livemode || price.unit_amount !== p.cents || price.currency !== "usd" || price.recurring?.interval !== "month")) {
    console.error(`Existing price ${price.id} for ${lookup} doesn't match; fix it in the Stripe test dashboard.`);
    process.exit(1);
  }
  if (!price) {
    const products = await stripe.products.search({ query: `metadata['plan']:'${p.plan}' AND active:'true'` }).catch(() => ({ data: [] }));
    const product = products.data[0] ?? (await stripe.products.create({
      name: p.name,
      metadata: { plan: p.plan, app_plan: p.appPlan, screens: String(p.screens) },
    }, { idempotencyKey: `pekko-product-${p.plan}-v1` }));
    price = await stripe.prices.create({
      product: product.id, currency: "usd", unit_amount: p.cents, recurring: { interval: "month" },
      lookup_key: lookup, metadata: { plan: p.plan, app_plan: p.appPlan },
    }, { idempotencyKey: `pekko-price-${p.plan}-v1` });
    console.error(`created ${p.name}: ${price.id}`);
  } else console.error(`exists  ${p.name}: ${price.id}`);
  out.push(`${p.env}=${price.id}`);
}
console.log(out.join("\n"));
