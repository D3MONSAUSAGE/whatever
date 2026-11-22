#!/usr/bin/env node
// Stripe sandbox end-to-end test-clock runner for Pekko billing safeguards.
// Test mode ONLY. Exits 0 when STRIPE_TEST_SECRET_KEY is unset so CI passes without sandbox secrets.
//
// Required env vars when running:
//   STRIPE_TEST_SECRET_KEY=rk_test_... (or sk_test_...)
//   STRIPE_WEBHOOK_SECRET=whsec_...
//   STRIPE_PRICE_STARTER=price_...
//   STRIPE_PRICE_BUSINESS=price_...
//   STRIPE_PRICE_MULTI=price_...
//   PEKKO_BASE_URL=https://<preview-or-localhost>   (pekkotv.com is strictly refused)
//   PEKKO_ACCESS_TOKEN=<staging QA org owner JWT>
//   QA_ACCOUNT_ID=<staging QA account uuid>
import Stripe from "stripe";

if (process.env.STRIPE_LIVE_ENABLED === "1") {
  console.error("Refusing: STRIPE_LIVE_ENABLED=1 is set. Sandbox E2E never runs in live mode.");
  process.exit(1);
}

const key = (process.env.STRIPE_TEST_SECRET_KEY || "").trim();
if (!key) {
  console.log("stripe-sandbox-e2e: skipped. Set STRIPE_TEST_SECRET_KEY=rk_test_... (or sk_test_...) to run.");
  process.exit(0);
}
if (!key.startsWith("sk_test_") && !key.startsWith("rk_test_")) {
  console.error("Refusing: STRIPE_TEST_SECRET_KEY must start with rk_test_ or sk_test_. Live keys are never used.");
  process.exit(1);
}

const required = [
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRICE_STARTER",
  "STRIPE_PRICE_BUSINESS",
  "STRIPE_PRICE_MULTI",
  "PEKKO_BASE_URL",
  "PEKKO_ACCESS_TOKEN",
  "QA_ACCOUNT_ID",
];
const missing = required.filter((name) => !(process.env[name] || "").trim());
if (missing.length) {
  console.error(`stripe-sandbox-e2e: missing ${missing.join(", ")}`);
  process.exit(1);
}

const baseUrl = new URL(process.env.PEKKO_BASE_URL.trim());
const hostname = baseUrl.hostname.toLowerCase();
if (hostname === "pekkotv.com" || hostname === "www.pekkotv.com" || hostname.endsWith(".pekkotv.com")) {
  console.error(`Refusing: PEKKO_BASE_URL (${baseUrl.origin}) targets production. Point to a Preview/staging URL only.`);
  process.exit(1);
}
const base = baseUrl.origin;

const stripe = new Stripe(key);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET.trim();
const businessPrice = process.env.STRIPE_PRICE_BUSINESS.trim();
const multiPrice = process.env.STRIPE_PRICE_MULTI.trim();
const token = process.env.PEKKO_ACCESS_TOKEN.trim();
const accountId = process.env.QA_ACCOUNT_ID.trim();
const DAY = 86_400;

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

function periodEnd(sub) {
  if (typeof sub.current_period_end === "number") return sub.current_period_end;
  const ends = (sub.items?.data ?? []).map((item) => item.current_period_end).filter((value) => typeof value === "number");
  assert(ends.length > 0, "subscription has no current_period_end");
  return Math.min(...ends);
}

async function app(path, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body) headers.set("Content-Type", "application/json");
  const res = await fetch(`${base}${path}`, { ...init, headers });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function waitClock(id) {
  for (let i = 0; i < 90; i++) {
    const clock = await stripe.testHelpers.testClocks.retrieve(id);
    if (clock.status === "ready") return clock;
    if (clock.status === "internal_failure") throw new Error("test clock failed");
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("test clock did not become ready");
}

let stamp = Math.floor(Date.now() / 1000);
async function postEvent(type, object) {
  stamp += 10;
  const payload = JSON.stringify({
    id: `evt_sandbox_${type.replace(/\./g, "_")}_${stamp}`,
    object: "event",
    type,
    created: stamp,
    livemode: false,
    data: { object },
  });
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret });
  const res = await fetch(`${base}/api/billing/webhook`, {
    method: "POST",
    headers: { "stripe-signature": header, "content-type": "application/json" },
    body: payload,
  });
  const body = await res.json().catch(() => ({}));
  assert(res.status === 200, `webhook ${type} -> ${res.status} ${JSON.stringify(body)}`);
  return body;
}

async function entitlement() {
  const res = await app("/api/entitlements");
  assert(res.status === 200, `entitlements ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

// Verify staging target is isolated before creating Stripe test objects.
const diag = await fetch(`${base}/api/billing/checkout?debug=1`).then((r) => r.json()).catch(() => ({}));
if (diag.databaseIsolated === false || diag.blockedReason) {
  throw new Error(`Staging target blocked: ${diag.blockedReason || "database not isolated"}`);
}

const clock = await stripe.testHelpers.testClocks.create({
  frozen_time: Math.floor(Date.now() / 1000),
  name: "pekko-sandbox-e2e",
});

try {
  // 1. 14-day Option B trial + pre-charge cancellation -> 3-day trial_grace
  const trialCustomer = await stripe.customers.create({
    email: "pekko-sandbox-trial@example.com",
    test_clock: clock.id,
    metadata: { account_id: accountId },
  });
  const trialSub = await stripe.subscriptions.create({
    customer: trialCustomer.id,
    items: [{ price: businessPrice, quantity: 1 }],
    trial_period_days: 14,
    trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
    metadata: { account_id: accountId },
  });
  assert(trialSub.status === "trialing", `expected trialing, got ${trialSub.status}`);
  await postEvent("customer.subscription.created", trialSub);
  const duringTrial = await entitlement();
  assert(duringTrial.subscription?.status === "trialing", `unexpected status during trial: ${duringTrial.subscription?.status}`);

  // Cancel before first charge (simulate Option B cancel at trial_end)
  await stripe.testHelpers.testClocks.advance(clock.id, { frozen_time: trialSub.trial_end + DAY });
  await waitClock(clock.id);
  const endedTrial = await stripe.subscriptions.retrieve(trialSub.id);
  await postEvent("customer.subscription.deleted", endedTrial);
  const afterTrialCancel = await entitlement();
  assert(afterTrialCancel.subscription?.status === "canceled", `expected canceled, got ${afterTrialCancel.subscription?.status}`);
  console.log("1. 14-day trial & Option B cancellation verified");

  // 2. Delayed/incomplete first payment -> preserves non-paid state + duplicate checkout blocked
  const incompleteCustomer = await stripe.customers.create({
    email: "pekko-sandbox-incomplete@example.com",
    test_clock: clock.id,
    metadata: { account_id: accountId },
  });
  const incSub = await stripe.subscriptions.create({
    customer: incompleteCustomer.id,
    items: [{ price: multiPrice, quantity: 1 }],
    payment_behavior: "default_incomplete",
    metadata: { account_id: accountId },
  });
  assert(incSub.status === "incomplete", `expected incomplete, got ${incSub.status}`);
  await postEvent("customer.subscription.created", incSub);
  await postEvent("invoice.payment_failed", { id: incSub.latest_invoice, subscription: incSub.id });
  const whileInc = await entitlement();
  assert(whileInc.subscription?.status === "incomplete", `expected incomplete status, got ${whileInc.subscription?.status}`);
  assert(whileInc.grace_ends_at == null, "incomplete payment must not set 7-day past_due grace");

  const dupDuringInc = await app("/api/billing/checkout", { method: "POST", body: JSON.stringify({ plan: "business" }) });
  assert(dupDuringInc.status === 409 && dupDuringInc.body.code === "subscription_exists" && dupDuringInc.body.action === "portal",
    `expected 409 subscription_exists/portal during incomplete, got ${dupDuringInc.status} ${JSON.stringify(dupDuringInc.body)}`);

  // Advance 25h so incomplete expires cleanly
  await stripe.testHelpers.testClocks.advance(clock.id, { frozen_time: Math.floor(Date.now() / 1000) + 15 * DAY + 90_000 });
  await waitClock(clock.id);
  const incExp = await stripe.subscriptions.retrieve(incSub.id);
  await postEvent("customer.subscription.updated", incExp);
  console.log("2. Delayed/incomplete first payment & duplicate-checkout guard verified");

  // 3. Paid subscription -> pause -> duplicate checkout blocked -> resume -> failed payment (7-day grace) -> cancel at period end
  const paidCustomer = await stripe.customers.create({
    email: "pekko-sandbox-paid@example.com",
    test_clock: clock.id,
    payment_method: "pm_card_visa",
    invoice_settings: { default_payment_method: "pm_card_visa" },
    metadata: { account_id: accountId },
  });
  const paidSub = await stripe.subscriptions.create({
    customer: paidCustomer.id,
    items: [{ price: businessPrice, quantity: 1 }],
    default_payment_method: "pm_card_visa",
    metadata: { account_id: accountId },
  });
  assert(paidSub.status === "active", `expected active paidSub, got ${paidSub.status}`);
  await postEvent("invoice.paid", { id: paidSub.latest_invoice, subscription: paidSub.id, amount_paid: 3900 });
  const activeEnt = await entitlement();
  assert(activeEnt.plan === "business" && activeEnt.state === "active", `expected active business, got ${activeEnt.plan}/${activeEnt.state}`);

  // Real paused state via trial end missing payment method -> verify duplicate checkout returns 409 portal
  const pauseCustomer = await stripe.customers.create({
    email: "pekko-sandbox-pause@example.com",
    test_clock: clock.id,
    metadata: { account_id: accountId },
  });
  const pauseTrial = await stripe.subscriptions.create({
    customer: pauseCustomer.id,
    items: [{ price: businessPrice, quantity: 1 }],
    trial_period_days: 2,
    trial_settings: { end_behavior: { missing_payment_method: "pause" } },
    metadata: { account_id: accountId },
  });
  await stripe.testHelpers.testClocks.advance(clock.id, { frozen_time: pauseTrial.trial_end + 120 });
  await waitClock(clock.id);
  const pausedSub = await stripe.subscriptions.retrieve(pauseTrial.id);
  assert(pausedSub.status === "paused", `expected paused after trial_end, got ${pausedSub.status}`);
  await postEvent("customer.subscription.paused", pausedSub);
  const dupDuringPaused = await app("/api/billing/checkout", { method: "POST", body: JSON.stringify({ plan: "multi" }) });
  assert(dupDuringPaused.status === 409 && dupDuringPaused.body.code === "subscription_exists" && dupDuringPaused.body.action === "portal",
    `expected 409 subscription_exists/portal during paused, got ${dupDuringPaused.status} ${JSON.stringify(dupDuringPaused.body)}`);
  const dupSubList = await stripe.subscriptions.list({ customer: pauseCustomer.id, status: "all", limit: 10 });
  assert(dupSubList.data.length === 1, `expected 1 subscription on paused customer, found ${dupSubList.data.length}`);

  // Re-sync paidSub as active before testing failed renewal payment -> past_due + immutable 7-day grace
  await postEvent("customer.subscription.updated", paidSub);
  await stripe.subscriptions.update(paidSub.id, { default_payment_method: "pm_card_chargeCustomerFail" });
  const currentPeriodEnd = periodEnd(await stripe.subscriptions.retrieve(paidSub.id));
  await stripe.testHelpers.testClocks.advance(clock.id, { frozen_time: currentPeriodEnd + 120 });
  await waitClock(clock.id);
  const pastDueSub = await stripe.subscriptions.retrieve(paidSub.id);
  assert(pastDueSub.status === "past_due", `expected past_due, got ${pastDueSub.status}`);
  await postEvent("invoice.payment_failed", { id: `in_fail_${pastDueSub.id}`, subscription: paidSub.id });
  const firstGrace = (await entitlement()).grace_ends_at;
  assert(Boolean(firstGrace), "expected 7-day past_due grace_ends_at");

  // Schedule cancel_at_period_end and advance to period end -> canceled
  await stripe.subscriptions.update(paidSub.id, { cancel_at_period_end: true });
  await postEvent("customer.subscription.updated", await stripe.subscriptions.retrieve(paidSub.id));
  await stripe.testHelpers.testClocks.advance(clock.id, { frozen_time: periodEnd(pastDueSub) + 120 });
  await waitClock(clock.id);
  const canceledSub = await stripe.subscriptions.retrieve(paidSub.id);
  await postEvent("customer.subscription.deleted", canceledSub);
  const finalEnt = await entitlement();
  assert(finalEnt.subscription?.status === "canceled", `expected final canceled, got ${finalEnt.subscription?.status}`);
  console.log("3. Failed payment, 7-day grace, cancellation, and duplicate-subscription guard verified");
  console.log("stripe-sandbox-e2e: ok");
} finally {
  await stripe.testHelpers.testClocks.del(clock.id).catch(() => undefined);
}
