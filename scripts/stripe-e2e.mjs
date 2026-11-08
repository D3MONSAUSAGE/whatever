#!/usr/bin/env node
// Billing walkthrough using Stripe's public API and Pekko's HTTP API. Test mode only.
// Exits 0 when STRIPE_TEST_SECRET_KEY is unset so CI does not need a sandbox key.
//
//   STRIPE_TEST_SECRET_KEY=sk_test_... \
//   STRIPE_WEBHOOK_SECRET=whsec_... \
//   STRIPE_PRICE_BUSINESS=price_... \
//   PEKKO_ACCESS_TOKEN=<QA org owner access token> \
//   node scripts/stripe-e2e.mjs
//
// Optional: PEKKO_BASE_URL, QA_ACCOUNT_ID (defaults to the pekkoqa org).
//
// Hosted Checkout is a browser step: the script prints the session URL. Pay there
// with 4242 if you want that session itself completed. The clock-driven subscription
// is created with the public test PaymentMethod pm_card_visa so renewal, failure,
// cancel, and trial do not depend on a browser. Screen count is read from
// GET /api/entitlements. Checkout quantity is 1 and must not be treated as the limit.
import Stripe from "stripe";

const key = process.env.STRIPE_TEST_SECRET_KEY || "";
if (!key) {
  console.log("stripe-e2e: skipped. Set STRIPE_TEST_SECRET_KEY=sk_test_... to run.");
  process.exit(0);
}
if (!key.startsWith("sk_test_")) {
  console.error("Refusing: STRIPE_TEST_SECRET_KEY must start with sk_test_. Live keys are never used.");
  process.exit(1);
}

const required = ["STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_BUSINESS", "PEKKO_ACCESS_TOKEN"];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`stripe-e2e: missing ${missing.join(", ")}`);
  process.exit(1);
}

const stripe = new Stripe(key);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const priceId = process.env.STRIPE_PRICE_BUSINESS;
const base = (process.env.PEKKO_BASE_URL || "https://pantalla-git-cursor-m17-stripe-test-teamtegrate.vercel.app").replace(/\/+$/, "");
const token = process.env.PEKKO_ACCESS_TOKEN;
const accountId = process.env.QA_ACCOUNT_ID || "e567a9a3-940d-466e-b847-9291e04190fc";
const DAY = 86_400;

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

function periodEnd(sub) {
  if (typeof sub.current_period_end === "number") return sub.current_period_end;
  const ends = (sub.items?.data ?? []).map((item) => item.current_period_end).filter((value) => typeof value === "number");
  assert(ends.length, "subscription has no current_period_end");
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
    id: `evt_e2e_${type.replace(/\./g, "_")}_${stamp}`,
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
  if (res.status !== 200) throw new Error(`webhook ${type} -> ${res.status} ${JSON.stringify(body)}`);
  return body;
}

async function entitlement() {
  const res = await app("/api/entitlements");
  assert(res.status === 200, `entitlements ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

async function pairScreen(name) {
  const created = await fetch(`${base}/api/player/pair`, { method: "POST" });
  const pair = await created.json();
  assert(created.status === 200 && pair.code, `player pair ${created.status}`);
  const claim = await app("/api/displays/pair", { method: "POST", body: JSON.stringify({ code: pair.code, name }) });
  return { pair, claim };
}

const clock = await stripe.testHelpers.testClocks.create({
  frozen_time: Math.floor(Date.now() / 1000),
  name: "pekko-billing-e2e",
});
const createdDisplays = [];

try {
  const checkout = await app("/api/billing/checkout", { method: "POST", body: JSON.stringify({ plan: "business" }) });
  assert(checkout.status === 200 && checkout.body.url, `checkout failed ${checkout.status} ${JSON.stringify(checkout.body)}`);
  const sessionMatch = String(checkout.body.url).match(/cs_(?:test|live)_[A-Za-z0-9]+/);
  assert(sessionMatch, "checkout URL did not contain a session id");
  const session = await stripe.checkout.sessions.retrieve(sessionMatch[0], { expand: ["line_items"] });
  const quantity = session.line_items?.data?.[0]?.quantity ?? null;
  console.log("Browser step: open this Checkout URL and pay with 4242 if you want this session completed:");
  console.log(checkout.body.url);

  const customer = await stripe.customers.create({
    email: "pekko-qa-billing@example.com",
    test_clock: clock.id,
    metadata: { account_id: accountId },
  });
  const subscription = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: priceId, quantity: 1 }],
    default_payment_method: "pm_card_visa",
    metadata: { account_id: accountId, screens: "3" },
  });
  assert(subscription.status === "active" || subscription.status === "trialing", `pm_card_visa subscription was ${subscription.status}`);
  await postEvent("customer.subscription.created", subscription);

  const afterCheckout = await entitlement();
  assert(afterCheckout.account_id === accountId, `entitlement account is ${afterCheckout.account_id}`);
  assert(afterCheckout.plan === "business", `plan is ${afterCheckout.plan}, expected business`);
  assert(afterCheckout.screen_limit === 3, `screen_limit is ${afterCheckout.screen_limit}, expected 3`);
  assert(quantity === 1, `Checkout quantity is ${quantity}; the line item must stay 1`);
  if (afterCheckout.screen_limit === quantity) throw new Error("quantity alone must not satisfy the screen-limit check");
  console.log(`Business entitlement screen_limit=${afterCheckout.screen_limit}; checkout quantity=${quantity}`);

  const firstPeriodEnd = periodEnd(subscription);
  await stripe.testHelpers.testClocks.advance(clock.id, { frozen_time: firstPeriodEnd + 120 });
  await waitClock(clock.id);
  const renewed = await stripe.subscriptions.retrieve(subscription.id);
  const renewal = (await stripe.invoices.list({ subscription: subscription.id, limit: 5 })).data
    .find((invoice) => invoice.billing_reason === "subscription_cycle");
  assert(renewal && renewal.status === "paid", "renewal invoice was not paid");
  await postEvent("invoice.paid", { id: renewal.id, subscription: subscription.id });
  const afterRenewal = await entitlement();
  assert(afterRenewal.playback_allowed === true, `renewal left playback_allowed ${afterRenewal.playback_allowed}`);
  console.log(`renewal ${renewal.id} paid`);

  await stripe.subscriptions.update(subscription.id, { default_payment_method: "pm_card_chargeCustomerFail" });
  await stripe.testHelpers.testClocks.advance(clock.id, { frozen_time: periodEnd(renewed) + 120 });
  await waitClock(clock.id);
  const pastDue = await stripe.subscriptions.retrieve(subscription.id);
  assert(pastDue.status === "past_due", `failed card should be past_due, was ${pastDue.status}`);
  await postEvent("invoice.payment_failed", { id: `in_fail_${pastDue.id}`, subscription: subscription.id });
  const firstGrace = (await entitlement()).grace_ends_at;
  assert(firstGrace, "first past_due did not set grace_ends_at");
  await postEvent("invoice.payment_failed", { id: `in_fail2_${pastDue.id}`, subscription: subscription.id });
  const secondGrace = (await entitlement()).grace_ends_at;
  assert(secondGrace === firstGrace, `grace moved from ${firstGrace} to ${secondGrace}`);
  console.log(`past_due grace unchanged at ${firstGrace}`);

  await stripe.subscriptions.update(subscription.id, { cancel_at_period_end: true });
  const scheduled = await stripe.subscriptions.retrieve(subscription.id);
  assert(scheduled.cancel_at_period_end === true, "cancellation was not scheduled at period end");
  await postEvent("customer.subscription.updated", scheduled);
  const whileCanceling = await entitlement();
  assert(whileCanceling.playback_allowed === true, "cancel at period end stopped playback early");
  assert(whileCanceling.subscription?.cancel_at_period_end === true, "entitlement did not record cancel_at_period_end");
  console.log(`cancellation stays in force until ${whileCanceling.subscription.current_period_end}`);

  const paired = [];
  for (let n = 1; n <= 4; n++) {
    const row = await pairScreen(`QA billing screen ${n}`);
    paired.push(row);
    if (row.claim.status === 200 && row.claim.body.id) createdDisplays.push(row.claim.body.id);
  }
  const ent = await entitlement();
  const ids = paired.map((row) => row.claim.body.id).filter(Boolean);
  if (ent.enforced) {
    assert(paired[3].claim.status === 403 && paired[3].claim.body.code === "screen_limit", `4th screen should be refused, got ${paired[3].claim.status}`);
    const status = await fetch(`${base}/api/player/pair/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: paired[0].pair.sessionId, secret: paired[0].pair.secret }),
    });
    const handed = await status.json();
    const player = await fetch(`${base}/api/player/state`, { headers: { "x-display-token": handed.token } });
    assert(player.status === 200, `a screen inside the limit was ${player.status}`);
    console.log("player authorization: 4th screen refused, a screen within the limit plays");
  } else {
    assert(ids.length === 4, "enforcement is off, so four screens should pair");
    const tooMany = await app("/api/entitlements/active-screens", { method: "POST", body: JSON.stringify({ displayIds: ids }) });
    assert(tooMany.status === 400 && tooMany.body.code === "too_many", `selecting 4 screens was ${tooMany.status} ${tooMany.body.code}`);
    const kept = await app("/api/entitlements/active-screens", { method: "POST", body: JSON.stringify({ displayIds: ids.slice(0, 3) }) });
    assert(kept.status === 200 && kept.body.screen_limit === 3, "keeping 3 screens should match the Business limit");
    const status = await fetch(`${base}/api/player/pair/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: paired[0].pair.sessionId, secret: paired[0].pair.secret }),
    });
    const handed = await status.json();
    const player = await fetch(`${base}/api/player/state`, { headers: { "x-display-token": handed.token } });
    assert(player.status === 200, `player state for an allowed screen was ${player.status}`);
    console.log("enforcement is off; the plan still rejects a 4th selected screen and the player token is accepted");
  }

  const trialCustomer = await stripe.customers.create({ email: "pekko-qa-trial@example.com", test_clock: clock.id });
  const trial = await stripe.subscriptions.create({
    customer: trialCustomer.id,
    items: [{ price: priceId, quantity: 1 }],
    trial_period_days: 14,
    trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
    metadata: { account_id: accountId },
  });
  assert(trial.status === "trialing", `trial started as ${trial.status}`);
  await postEvent("customer.subscription.updated", trial);
  const during = await entitlement();
  assert(during.subscription?.status === "trialing", `Pekko status during trial is ${during.subscription?.status}`);
  await stripe.testHelpers.testClocks.advance(clock.id, { frozen_time: trial.trial_end + DAY });
  await waitClock(clock.id);
  const expired = await stripe.subscriptions.retrieve(trial.id);
  assert(expired.status === "canceled" || expired.status === "incomplete_expired", `trial ended as ${expired.status}`);
  await postEvent("customer.subscription.deleted", expired);
  const afterTrial = await entitlement();
  assert(afterTrial.subscription?.status === "canceled", `trial expiry left status ${afterTrial.subscription?.status}`);
  const periodEndMs = Date.parse(afterTrial.subscription?.current_period_end || "");
  const serverNow = Date.parse(afterTrial.server_time);
  if (Number.isFinite(periodEndMs) && serverNow >= periodEndMs) {
    assert(afterTrial.playback_allowed === false, "trial period has ended but playback is still allowed");
  } else {
    assert(afterTrial.playback_allowed === true, "trial cancellation must keep playback until period end");
  }
  console.log(`trial stayed trialing until trial_end, then status=${afterTrial.subscription.status} state=${afterTrial.state}`);
  console.log("stripe-e2e: ok");
} finally {
  for (const id of createdDisplays) {
    await app(`/api/displays/${id}`, { method: "DELETE" }).catch(() => undefined);
  }
  await stripe.testHelpers.testClocks.del(clock.id).catch(() => undefined);
}
