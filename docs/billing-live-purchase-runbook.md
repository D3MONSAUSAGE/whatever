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

## Duplicate-subscription guard (live proof)

With the Starter subscription active, still signed in as the same owner:

1. Open Billing. Starter shows `Current plan`; the other plans show `Switch to Business` / `Switch to Multi`, not `Choose`. No `Coming soon` appears once the page has loaded.
2. Call `POST /api/billing/checkout` with `{"plan":"starter"}` (or click Starter). Expect `200 {"updated":false}` and no Checkout URL. No new Checkout session or subscription appears in the live dashboard.
3. Do not click Switch unless Francisco also approves the upgrade charge (see below). The guard's update path was proven in test mode on the preview.
4. Open Manage billing. It must open `billing.stripe.com` with the three plans (Starter $19, Business $39, Multi $59), cancel at period end, and return to `https://pekkotv.com/dashboard/account`.
5. In Stripe, the customer has exactly one subscription.

## Optional: live plan change (needs its own approval)

The live portal and the app both use `proration_behavior: always_invoice`. Switching Starter to Business mid-cycle immediately charges the difference for the rest of the period (about $20 right after purchase), as a separate invoice with `billing_reason` `subscription_update`. The renewal date does not move. The app uses `payment_behavior: error_if_incomplete`, so if that charge is declined the route returns 402 and the plan stays Starter. A downgrade creates a negative invoice that becomes customer credit; it is not a refund to the card.

If approved, expect `customer.subscription.updated` and `invoice.paid` on the webhook, `accounts.plan` = `business` with the same `current_period_end`, and still one subscription. Refund that second invoice too.

## Refund and cancel

1. In the live Stripe dashboard, open each paid invoice from the run (the first purchase, and the plan-change invoice if one was made) and refund it in full. Do this immediately, before the run is considered finished. A downgrade credit sits on the customer balance; it is not returned to the card unless you refund the charge.
2. Cancel the subscription at period end (Customer Portal, or the subscription page). Do not delete the Pekko account.
3. Expect `charge.refunded` or `credit_note.created` in Stripe, and `customer.subscription.updated` with `cancel_at_period_end` true. Pekko's row stays `subscription_status` `active` until the period ends, with `cancel_at_period_end` true. `customer.subscription.deleted` arrives at period end and sets `subscription_status` to `canceled`.

## After the run

- Look at Vercel runtime logs for `/api/billing/*` errors for 10 minutes.
- Check the live webhook `we_1UZboD9BrfExUgkqTvISHGO6` for failed deliveries.
- If anything is wrong, refund first. Production can be rolled back by promoting the previous deployment; that does not change Stripe.

## Rollback

- Refund first, then cancel at period end, as above.
- Do not change live prices, do not set `BILLING_ENFORCE`, and do not edit other customers.
- If the webhook wrote the wrong plan, Francisco can set that one account's `plan` and `subscription_status` back from the Stripe subscription that remains. Do not delete `stripe_events` rows; they are the replay record.
