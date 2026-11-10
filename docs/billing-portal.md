# Stripe Customer Portal

Pekko opens the portal with `POST /api/billing/portal` for the signed-in account's stored `stripe_customer_id`. The browser returns to `/dashboard/account` on the request origin. A `vercel.app` host is never used as that return URL.

This file is the configuration. Do not apply it to live Stripe until Francisco approves billing. The script below is test mode only.

## What customers can do

- Update the payment method.
- View invoices.
- Cancel at period end (not immediately).
- Switch among the three existing monthly prices (Starter, Business, Multi-screen) with proration (`create_prorations`).

They cannot add a second subscription from the portal. Price changes use the products and prices already created for those three plans.

## Test mode

1. Create the three test prices if they are missing: `STRIPE_TEST_SECRET_KEY=sk_test_... node scripts/stripe-test-setup.mjs`
2. Create or update the portal configuration: `STRIPE_TEST_SECRET_KEY=sk_test_... node scripts/stripe-portal-setup.mjs`

The portal script refuses any key that does not start with `sk_test_`. Re-running it updates the configuration whose metadata is `pekko=billing-safety`.

Set the returned configuration id as the default in the Stripe test dashboard, or pass it later if a session needs `configuration`. The API default is enough when this is the only active test configuration you want customers to see. If Stripe already has another default, mark this configuration as the default in the test dashboard: Settings → Billing → Customer portal.

## Live mode (do not run yet)

When Francisco approves billing, repeat the same features on the live Customer Portal. Do not point `scripts/stripe-portal-setup.mjs` at a live key. In the live Stripe dashboard, Settings → Billing → Customer portal:

- Payment methods: customers can update.
- Invoices: customers can view invoice history.
- Cancellations: at period end only.
- Subscriptions: customers can switch prices, proration on, limited to the three live Pekko prices (`STRIPE_LIVE_PRICE_STARTER`, `STRIPE_LIVE_PRICE_BUSINESS`, `STRIPE_LIVE_PRICE_MULTI`).

No other products. Do not change those prices. Do not set `BILLING_ENFORCE`.

## Return URLs and cancellation display

- Portal `return_url` and Checkout `success_url`/`cancel_url` use the request's own origin when it is pekkotv.com or www.pekkotv.com, or (outside production only) pantalla-chi.vercel.app or a `pantalla-*-teamtegrate.vercel.app` preview. Anything else falls back to the site URL, so production always returns to pekkotv.com.
- A portal "cancel at period end" is stored by the webhook as `accounts.cancel_at_period_end = true` plus `current_period_end` (the subscription is re-fetched on the acacia API, which reports period-end cancels this way). No new column is needed. Plan & billing shows "Cancels on <date>, you keep <plan> until then" with Keep my plan / Manage billing. A custom-date cancel (`cancel_at` before the period end, set only from the Stripe dashboard) is not shown separately.
- Plan changes on an existing subscription prorate. The difference for the rest of the period is added to the next invoice together with the new monthly price (for example Starter → Business on day one: $39 + $20 = $59).
