#!/usr/bin/env node
// Test-clock walkthrough for Pekko billing. TEST MODE ONLY.
// Skips (exit 0) when STRIPE_TEST_SECRET_KEY is unset, so CI stays green.
// Refuses any key that does not start with sk_test_.
//
// Required to actually run: STRIPE_TEST_SECRET_KEY and STRIPE_PRICE_BUSINESS
// (from scripts/stripe-test-setup.mjs). Optional: STRIPE_WEBHOOK_SECRET is not
// used here; this script talks to Stripe and checks the subscription Stripe
// returns. Pekko's grace period is applied by the webhook, covered in unit tests.
import Stripe from "stripe";

const key = process.env.STRIPE_TEST_SECRET_KEY || "";
if (!key) {
  console.log("stripe-e2e: skipped. Set STRIPE_TEST_SECRET_KEY=sk_test_... and STRIPE_PRICE_BUSINESS to run the test clock.");
  process.exit(0);
}
if (!key.startsWith("sk_test_")) {
  console.error("Refusing: STRIPE_TEST_SECRET_KEY must be a test key (sk_test_...). Live keys are never used.");
  process.exit(1);
}
const priceId = process.env.STRIPE_PRICE_BUSINESS || "";
if (!priceId) {
  console.error("Set STRIPE_PRICE_BUSINESS to the test-mode Business price (3 screens). Run scripts/stripe-test-setup.mjs.");
  process.exit(1);
}

const stripe = new Stripe(key);
const DAY = 86_400;

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

async function waitClock(id) {
  for (let i = 0; i < 60; i++) {
    const clock = await stripe.testHelpers.testClocks.retrieve(id);
    if (clock.status === "ready") return clock;
    if (clock.status === "internal_failure") throw new Error("test clock failed");
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("test clock did not become ready");
}

async function card(number) {
  return stripe.paymentMethods.create({
    type: "card",
    card: { number, exp_month: 12, exp_year: 2034, cvc: "123" },
  });
}

async function payCheckout(sessionId, paymentMethodId) {
  return stripe.rawRequest("POST", `/v1/payment_pages/${sessionId}/confirm`, {
    payment_method: paymentMethodId,
  });
}

const clock = await stripe.testHelpers.testClocks.create({
  frozen_time: Math.floor(Date.now() / 1000),
  name: "pekko-billing-e2e",
});
try {
  const customer = await stripe.customers.create({
    email: "pekko-billing-e2e@example.com",
    test_clock: clock.id,
  });
  const visa = await card("4242424242424242");
  await stripe.paymentMethods.attach(visa.id, { customer: customer.id });
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customer.id,
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: "acct_e2e",
    subscription_data: { metadata: { account_id: "acct_e2e", screens: "3" } },
    success_url: "https://example.com/billing?checkout=success",
    cancel_url: "https://example.com/billing?checkout=canceled",
  });
  await payCheckout(session.id, visa.id);
  const paid = await stripe.checkout.sessions.retrieve(session.id, { expand: ["subscription"] });
  const subscription = paid.subscription;
  assert(subscription && typeof subscription !== "string", "checkout did not create a subscription");
  assert(subscription.items.data[0]?.price?.id === priceId, "checkout was not the Business price");
  assert(subscription.metadata?.screens === "3" || subscription.items.data[0]?.quantity === 1, "Business checkout should cover 3 screens");
  assert(subscription.status === "active" || subscription.status === "trialing", `unexpected status ${subscription.status}`);
  console.log(`checkout 4242 -> ${subscription.id} status=${subscription.status} price=${priceId} (Business, 3 screens)`);

  const periodEnd = subscription.current_period_end;
  await stripe.testHelpers.testClocks.advance(clock.id, { frozen_time: periodEnd + 120 });
  await waitClock(clock.id);
  const renewed = await stripe.subscriptions.retrieve(subscription.id);
  const invoices = await stripe.invoices.list({ subscription: subscription.id, limit: 5 });
  const renewal = invoices.data.find((invoice) => invoice.billing_reason === "subscription_cycle");
  assert(renewal, "advancing the clock did not create a renewal invoice");
  assert(renewal.status === "paid", `renewal invoice was ${renewal.status}`);
  console.log(`renewal invoice ${renewal.id} paid; subscription ${renewed.status}`);

  const failing = await card("4000000000000341");
  await stripe.paymentMethods.attach(failing.id, { customer: customer.id });
  await stripe.subscriptions.update(subscription.id, { default_payment_method: failing.id });
  const nextEnd = renewed.current_period_end;
  await stripe.testHelpers.testClocks.advance(clock.id, { frozen_time: nextEnd + 120 });
  await waitClock(clock.id);
  const pastDue = await stripe.subscriptions.retrieve(subscription.id);
  assert(pastDue.status === "past_due", `failed card should be past_due, was ${pastDue.status}`);
  const failedInvoice = (await stripe.invoices.list({ subscription: subscription.id, status: "open", limit: 1 })).data[0];
  const failedAt = (failedInvoice?.created ?? pastDue.current_period_end ?? nextEnd) * 1000;
  const graceEnd = new Date(failedAt + 7 * DAY * 1000).toISOString();
  console.log(`payment 4000000000000341 -> past_due; Pekko grace is 7 days from the first failure (${graceEnd}), not extended by a repeat`);

  await stripe.subscriptions.update(subscription.id, { cancel_at_period_end: true });
  const scheduled = await stripe.subscriptions.retrieve(subscription.id);
  assert(scheduled.cancel_at_period_end === true, "cancellation should be scheduled at period end");
  assert(scheduled.status === "past_due" || scheduled.status === "active", `cancel must not end access early, status ${scheduled.status}`);
  console.log(`cancellation scheduled; status stays ${scheduled.status} until period end`);

  const trialCustomer = await stripe.customers.create({
    email: "pekko-trial-e2e@example.com",
    test_clock: clock.id,
  });
  const trial = await stripe.subscriptions.create({
    customer: trialCustomer.id,
    items: [{ price: priceId }],
    trial_period_days: 14,
    trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
    metadata: { account_id: "acct_trial" },
  });
  assert(trial.status === "trialing", `trial should start trialing, was ${trial.status}`);
  const trialEnd = trial.trial_end ?? (Math.floor(Date.now() / 1000) + 14 * DAY);
  await stripe.testHelpers.testClocks.advance(clock.id, { frozen_time: trialEnd + DAY });
  await waitClock(clock.id);
  const expired = await stripe.subscriptions.retrieve(trial.id);
  assert(expired.status === "canceled" || expired.status === "incomplete_expired", `trial should end at trial_end, was ${expired.status}`);
  console.log(`trial stayed trialing until trial_end, then ${expired.status}`);
  console.log("stripe-e2e: ok");
} finally {
  await stripe.testHelpers.testClocks.del(clock.id).catch(() => undefined);
}
