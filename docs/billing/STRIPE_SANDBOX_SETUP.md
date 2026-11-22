# Stripe Sandbox Setup & Isolation

This document describes Pekko's isolated Stripe test/sandbox environment and the code guards that keep sandbox billing completely separated from Production (`pekkotv.com`).

No sandbox credentials are stored in this repository, and sandbox integration stays disabled until the checklist below is completed and staging database isolation is in place.

## 1. Isolation Guarantees (Code + Environment)

1. **Environment-locked mode (`lib/server/stripe.ts`):**
   - When `VERCEL_ENV === "production"`, `billingMode()` is locked to `"live"`. Production can **never** load `STRIPE_TEST_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, or `STRIPE_PRICE_*`. If `STRIPE_LIVE_ENABLED !== "1"` on Production, all Stripe key, price, and webhook checks fail closed (`null` / `""` / `false`).
   - When `VERCEL_ENV === "preview"`, `billingMode()` is locked to `"test"`. Preview can **never** load `STRIPE_LIVE_*` variables. If `STRIPE_LIVE_ENABLED === "1"` on Preview, all Stripe key, price, and webhook checks fail closed (`preview_live_forbidden`).
2. **Strict key-prefix & `livemode` checks:**
   - Live mode accepts only `sk_live_` in `STRIPE_LIVE_SECRET_KEY`.
   - Test mode accepts only `rk_test_` or `sk_test_` in `STRIPE_TEST_SECRET_KEY`.
   - `checkoutSessionRequest()` fails closed on any key/mode mismatch.
   - `POST /api/billing/checkout` checks `livemode` on retrieved subscriptions and Checkout sessions before reusing or updating them.
   - `POST /api/billing/webhook` verifies the signature with the mode-specific webhook secret and rejects any event whose `ev.livemode` does not match the active mode (`400 test events refused` in live mode; `400 live events refused` in test mode).
3. **Database isolation guard (`preview_db_not_isolated`):**
   - Preview deployments fail closed for Stripe test billing (`stripeKey()`, `webhookSecret()`, `webhookEventAllowed()` return empty/false) whenever `VERCEL_ENV === "preview"` and `NEXT_PUBLIC_SUPABASE_URL` still points to the Production Supabase project (`iybmjtkjfxcqupvhoddh.supabase.co`).
   - Test-mode webhooks and Preview Checkout cannot write `cus_test_*` / `sub_test_*` / `stripe_events` into Production Supabase tables.

## 2. Staging Database Options (Choose Before Enabling Preview Sandbox)

Because `D3MONSAUSAGE's Org` on Supabase is on `pro`, any additional project inside that org or an active Supabase Branch incurs usage charges. Cheapest options to keep Preview test data out of Production tables:

- **Option A — $0/mo (recommended cheapest):** Create a Free-tier Supabase project in a separate Free Supabase organization, apply `supabase/migrations/*`, and override `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` on Vercel **Preview** only.
- **Option B — ~$0.01344/hr while active:** Create a temporary Supabase Branch off `Pantalla` during QA windows and delete it immediately after testing.
- **Option C — $0/mo local-only:** Run against local Postgres / Supabase (`supabase start`) and forward test events via `stripe listen --forward-to localhost:3000/api/billing/webhook`.

## 3. Sandbox Setup Checklist (Manual Steps for Owner)

1. **Create a Stripe Sandbox:** Create a separate test-mode Sandbox inside the Pekko Stripe account (never live mode).
2. **Create a Restricted Test Key (`rk_test_...`):**
   - Customers: Write
   - Checkout Sessions: Write
   - Billing Portal (configurations & sessions): Write
   - Subscriptions: Write
   - Invoices: Read (Write if running manual invoice tests)
   - Products & Prices: Write (needed for `scripts/stripe-test-setup.mjs`; Read at runtime)
   - Payment Methods: Read
   - Test Helpers / Test Clocks: Write (needed for `scripts/stripe-sandbox-e2e.mjs`)
   - Webhook Endpoints: Read (Write only if configuring via API)
3. **Create Test Products & Prices (or run script):**
   - Match the three live monthly USD plans:
     - `pekko_starter_monthly_usd`: $19/month (`STRIPE_PRICE_STARTER`)
     - `pekko_business_monthly_usd`: $39/month (`STRIPE_PRICE_BUSINESS`)
     - `pekko_multiscreen_monthly_usd`: $59/month (`STRIPE_PRICE_MULTI`)
   - Alternatively, once `STRIPE_TEST_SECRET_KEY` is stored in secure env vars, run:
     - `node scripts/stripe-test-setup.mjs`
     - `node scripts/stripe-portal-setup.mjs` (keeps `subscription_pause` disabled, matching live)
4. **Create a Test Webhook Endpoint in the Sandbox:**
   - URL: `https://<staging-preview-domain>/api/billing/webhook` (never `pekkotv.com`)
   - Events (11 total): `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.trial_will_end`, `customer.subscription.paused`, `customer.subscription.resumed`, `invoice.paid`, `invoice.payment_failed`.
   - Note: `checkout.session.expired` remains deferred.
   - Save the generated signing secret (`whsec_...`) for `STRIPE_WEBHOOK_SECRET`.
5. **Configure Vercel Environment Variables (Preview Target Only):**
   - **Preview-only (never set on Production):**
     - `STRIPE_TEST_SECRET_KEY` (`rk_test_...` or `sk_test_...`)
     - `STRIPE_WEBHOOK_SECRET` (`whsec_...`)
     - `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_BUSINESS`, `STRIPE_PRICE_MULTI`
     - `BILLING_ENFORCE` (`1` when testing enforcement on Preview)
     - Staging `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (Preview target only)
   - **Production-only (never set on Preview):**
     - `STRIPE_LIVE_ENABLED`, `STRIPE_LIVE_SECRET_KEY`, `STRIPE_LIVE_WEBHOOK_SECRET`, `STRIPE_LIVE_PRICE_STARTER`, `STRIPE_LIVE_PRICE_BUSINESS`, `STRIPE_LIVE_PRICE_MULTI`, `STRIPE_MANAGED_PAYMENTS`
6. **Supply Secrets Securely:** Provide all secret values through **Grok Bot secure secrets** (or Vercel encrypted sensitive env vars directly). Never paste secrets in chat or commit them to code.

## 4. Test-Clock Verification Plan (Run After Configuration)

Once Preview is wired to the staging DB and sandbox credentials, verify `GET /api/billing/checkout?debug=1` on the Preview URL reports `available: true`, `webhook: true`, `databaseIsolated: true`, and `blockedReason: null`, then run:

```bash
STRIPE_TEST_SECRET_KEY=rk_test_... \
STRIPE_WEBHOOK_SECRET=whsec_... \
STRIPE_PRICE_STARTER=price_... \
STRIPE_PRICE_BUSINESS=price_... \
STRIPE_PRICE_MULTI=price_... \
PEKKO_BASE_URL=https://<preview-url> \
PEKKO_ACCESS_TOKEN=<staging-qa-owner-jwt> \
QA_ACCOUNT_ID=<staging-qa-account-uuid> \
node scripts/stripe-sandbox-e2e.mjs
```

`scripts/stripe-sandbox-e2e.mjs` advances Stripe Test Clocks against synthetic test customers only and checks:
1. 14-day Option B trial (`trialing`) and pre-charge cancellation (`trial_grace` / `canceled`).
2. Delayed/incomplete first payment (`incomplete` + `invoice.payment_failed` preserving trial, no 7-day `past_due` grace, expiry to `incomplete_expired`).
3. Paused subscription transition (`paused` via trial end with missing payment method).
4. Duplicate-subscription prevention (`POST /api/billing/checkout` returning `409 subscription_exists` with `action: "portal"` during `incomplete` and `paused`, and only 1 subscription in Stripe).
5. Failed renewal payment (`past_due` + immutable 7-day `grace_ends_at`).
6. Scheduled `cancel_at_period_end` and period-end cutoff (`canceled`).
