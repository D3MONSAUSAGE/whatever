#!/usr/bin/env node
// Plans Pekko's LIVE monthly prices and the production webhook.
// Default is dry-run: it prints the objects and does not call Stripe.
//
//   node scripts/stripe-live-setup.mjs
//   STRIPE_LIVE_ENABLED=1 STRIPE_LIVE_SECRET_KEY=sk_live_... \
//     node scripts/stripe-live-setup.mjs --confirm-live
//
// --confirm-live is refused unless STRIPE_LIVE_ENABLED is exactly 1 and the key
// is sk_live_. Test keys and test price env names are never read.
import Stripe from "stripe";

const WEBHOOK_URL = "https://pekkotv.com/api/billing/webhook";
const EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.trial_will_end",
  "invoice.paid",
  "invoice.payment_failed",
];
const PLANS = [
  { plan: "starter", appPlan: "starter", name: "Pekko Starter", cents: 1900, dollars: 19, screens: 1, env: "STRIPE_LIVE_PRICE_STARTER", lookup: "pekko_starter_monthly_usd" },
  { plan: "business", appPlan: "business", name: "Pekko Business", cents: 3900, dollars: 39, screens: 3, env: "STRIPE_LIVE_PRICE_BUSINESS", lookup: "pekko_business_monthly_usd" },
  { plan: "multiscreen", appPlan: "multi", name: "Pekko Multi-screen", cents: 5900, dollars: 59, screens: 5, env: "STRIPE_LIVE_PRICE_MULTI", lookup: "pekko_multiscreen_monthly_usd" },
];

const confirm = process.argv.includes("--confirm-live") && !process.argv.includes("--dry-run");

function planText() {
  const lines = [
    "stripe-live-setup: dry-run. No Stripe API calls.",
    "operator: Francisco Lopez, a sole proprietor doing business as Pekko",
    `webhook: ${WEBHOOK_URL}`,
    `events: ${EVENTS.join(", ")}`,
    "prices:",
  ];
  for (const p of PLANS) {
    lines.push(`  ${p.lookup} $${p.dollars}/month (${p.cents} cents, ${p.screens} screen${p.screens === 1 ? "" : "s"}) -> ${p.env}`);
  }
  lines.push("Set STRIPE_LIVE_WEBHOOK_SECRET from the endpoint secret after --confirm-live.");
  lines.push("Pass --confirm-live to create these objects. This default does not.");
  return lines.join("\n");
}

if (!confirm) {
  console.log(planText());
  process.exit(0);
}

const enabled = process.env.STRIPE_LIVE_ENABLED === "1";
const key = (process.env.STRIPE_LIVE_SECRET_KEY || "").trim().replace(/^['"]|['"]$/g, "");
if (!enabled) {
  console.error("Refusing: STRIPE_LIVE_ENABLED must be exactly 1. Live setup does not run while the flag is off.");
  process.exit(1);
}
if (!key.startsWith("sk_live_")) {
  console.error("Refusing: STRIPE_LIVE_SECRET_KEY must start with sk_live_. Test keys are never used here.");
  process.exit(1);
}

const stripe = new Stripe(key);
const out = [];
for (const p of PLANS) {
  const found = await stripe.prices.list({ lookup_keys: [p.lookup], active: true, limit: 1 });
  let price = found.data[0];
  if (price && (!price.livemode || price.unit_amount !== p.cents || price.currency !== "usd" || price.recurring?.interval !== "month")) {
    console.error(`Existing live price ${price.id} for ${p.lookup} does not match $${p.dollars}/month. Fix it in the Stripe dashboard. No fallback to test prices.`);
    process.exit(1);
  }
  if (!price) {
    const products = await stripe.products.search({ query: `metadata['plan']:'${p.plan}' AND active:'true'` }).catch(() => ({ data: [] }));
    const product = products.data.find((item) => item.livemode) ?? await stripe.products.create({
      name: p.name,
      metadata: { plan: p.plan, app_plan: p.appPlan, screens: String(p.screens) },
    }, { idempotencyKey: `pekko-live-product-${p.plan}-v1` });
    price = await stripe.prices.create({
      product: product.id,
      currency: "usd",
      unit_amount: p.cents,
      recurring: { interval: "month" },
      lookup_key: p.lookup,
      metadata: { plan: p.plan, app_plan: p.appPlan },
    }, { idempotencyKey: `pekko-live-price-${p.plan}-v1` });
    console.error(`created ${p.name}: ${price.id}`);
  } else {
    console.error(`exists  ${p.name}: ${price.id}`);
  }
  out.push(`${p.env}=${price.id}`);
}

const hooks = await stripe.webhookEndpoints.list({ limit: 100 });
const hook = hooks.data.find((item) => item.url === WEBHOOK_URL && item.status !== "disabled");
if (hook) {
  console.error(`exists  webhook ${hook.id} ${WEBHOOK_URL}`);
  console.error("Webhook secret is only shown when the endpoint is created. If you still need it, roll the secret in the Stripe dashboard into STRIPE_LIVE_WEBHOOK_SECRET.");
} else {
  const created = await stripe.webhookEndpoints.create({
    url: WEBHOOK_URL,
    enabled_events: EVENTS,
    description: "Pekko billing",
  }, { idempotencyKey: "pekko-live-webhook-v1" });
  console.error(`created webhook ${created.id}`);
  console.error(`STRIPE_LIVE_WEBHOOK_SECRET=${created.secret}`);
}
console.log(out.join("\n"));
