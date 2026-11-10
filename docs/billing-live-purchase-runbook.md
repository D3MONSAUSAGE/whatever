# Live purchase and refund runbook

Do not run this until Francisco approves billing going live. This document does not change Stripe, production environment variables, prices, or customer data.

## Account

Use Francisco's own Pekko account on https://pekkotv.com, the one he will name in the approval. Do not use a customer org. Confirm the account is the owner (`accounts.owner_user_id` matches the signed-in user) and that `BILLING_ENFORCE` is still not `1`.

## Plan

Starter, $19/month, one screen. The live price is `STRIPE_LIVE_PRICE_STARTER`. Do not create a new price.

## Steps

1. Sign in on pekkotv.com and open Account → Manage billing. If Stripe has no customer yet, the button opens the plan picker.
2. Choose Starter. Checkout must be the live Stripe Checkout page, not a second subscription if one already exists.
3. Pay with a real card Francisco designates. Expect Stripe events, in order, on the live webhook:
   - `checkout.session.completed`
   - `customer.subscription.created` or `customer.subscription.updated`
   - `invoice.paid`
4. In `accounts` for that org, expect one row with:
   - `plan` = `starter`
   - `subscription_status` = `active`
   - `stripe_customer_id` set
   - `stripe_subscription_id` set to that single subscription
   - `screen_limit` behavior follows Starter (1 screen) after the webhook
5. In `stripe_events`, those event ids exist and `processed_at` is set. Replaying the same event does not create another subscription id.

## Refund and cancel

1. In the live Stripe dashboard, open that payment's invoice and refund it in full. Do this immediately, before the run is considered finished.
2. Cancel the subscription at period end (Customer Portal, or the subscription page). Do not delete the Pekko account.
3. Expect `charge.refunded` or `credit_note.created` in Stripe, and `customer.subscription.updated` with `cancel_at_period_end` true. Pekko's row stays `subscription_status` `active` until the period ends, with `cancel_at_period_end` true. `customer.subscription.deleted` arrives at period end and sets `subscription_status` to `canceled`.

## Rollback

- Refund first, then cancel at period end, as above.
- Do not change live prices, do not set `BILLING_ENFORCE`, and do not edit other customers.
- If the webhook wrote the wrong plan, Francisco can set that one account's `plan` and `subscription_status` back from the Stripe subscription that remains. Do not delete `stripe_events` rows; they are the replay record.
