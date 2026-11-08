# Live billing rollout

Live charges stay **off**. `STRIPE_LIVE_ENABLED` and `BILLING_ENFORCE` both default off. Nothing in this document turns them on. Do not merge live keys into the test sandbox, and do not run `scripts/stripe-live-setup.mjs` until Francisco confirms.

The operator is Francisco Lopez, a sole proprietor doing business as Pekko. Unpublished legal drafts are in `docs/legal/`. They are not linked from the site.

## What is ready

- Test Checkout and webhooks keep using only `STRIPE_TEST_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `STRIPE_PRICE_STARTER` / `STRIPE_PRICE_BUSINESS` / `STRIPE_PRICE_MULTI`.
- Live mode is a separate set of variables. It is selected only when `STRIPE_LIVE_ENABLED` is exactly `1`, and then only an `sk_live_` key is accepted. Test values are not used as a fallback, and live values are not used while the flag is off.
- `scripts/stripe-live-setup.mjs` prints the three live monthly prices and the webhook at `https://pekkotv.com/api/billing/webhook`. It does not call Stripe unless `--confirm-live` is passed, and it still refuses unless the live flag is `1` and the key is `sk_live_`.
- New organizations already get a **14-day trial from creation** (`accounts.trial_ends_at` defaults to `now() + 14 days`, and the entitlement function falls back to `created_at + 14 days`). Then a 3-day playback grace (`trial_grace`). Then screens pause (`expired`). Content stays.
- Organizations that existed before billing were set to `grandfathered` in migration `0013`. They are the early customers. `rollout_notice` on `GET /api/entitlements` tells them billing changes come with advance notice and a grace period, and that content is not deleted. Grandfathered screens are not paused when enforcement is later turned on (see `account_entitlement` in `0013_billing_entitlements.sql`).
- A plan with fewer screens than are currently on requires the screen picker (`POST /api/entitlements/active-screens` and the billing page section `#screens`). Unpicked screens pause. Rows are not deleted.
- Enforcement, when `BILLING_ENFORCE` is exactly `1`, is on the backend (`POST /api/displays/pair` returns `screen_limit` or `subscription_inactive`) and in player authorization (`GET /api/player/state` returns 402 with `SUSPENDED_PAYLOAD`, which says the content is saved). While the flag is off, those checks do not block.
- Dashboard banner (`data-testid="billing-banner"`) shows the entitlement warning or the early-customer notice.
- Email copy exists for trial ending in 3 days, trial ended, payment failed (includes the grace end date), and subscription canceled. `sendBillingNotices` sends nothing unless `EMAIL_PROVIDER` is configured (`resend` plus `RESEND_API_KEY` and `ALERT_EMAIL_FROM`). Receipts are Stripe's own customer emails (`RECEIPT_CHANNEL = "stripe"`). Pekko does not send a receipt.

## Flags that must stay off until go-live

| Variable | Required value to activate | Default |
| --- | --- | --- |
| `STRIPE_LIVE_ENABLED` | exactly `1` | off |
| `BILLING_ENFORCE` | exactly `1` | off |
| `EMAIL_PROVIDER` | `resend` (and the Resend key and from-address) | unset, so no email is sent |

## Environment variables to set before any live charge

Do not set these on the test preview. Set them on production only when live mode is intentionally turned on.

| Name | Purpose |
| --- | --- |
| `STRIPE_LIVE_ENABLED` | `1` to allow an `sk_live_` key. Leave unset until go-live. |
| `STRIPE_LIVE_SECRET_KEY` | Live secret key (`sk_live_...`). Ignored unless the flag is `1`. |
| `STRIPE_LIVE_WEBHOOK_SECRET` | Signing secret for the live endpoint (`whsec_...`). |
| `STRIPE_LIVE_PRICE_STARTER` | Live price id for Starter, $19/month. |
| `STRIPE_LIVE_PRICE_BUSINESS` | Live price id for Business, $39/month. |
| `STRIPE_LIVE_PRICE_MULTI` | Live price id for Multi-screen, $59/month. |
| `STRIPE_MANAGED_PAYMENTS` | Leave unset. Live Checkout does not send `managed_payments`; the account default applies. The test opt-out stays test-only. |

Test variables stay as they are for the sandbox. They are not read in live mode:

`STRIPE_TEST_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_BUSINESS`, `STRIPE_PRICE_MULTI`.

Optional, only if billing email should actually send:

`EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `ALERT_EMAIL_FROM`.

`BILLING_ENFORCE` stays unset until the early-customer notice has been up and the grace period in this document has passed.

## Order of operations (do not start this from CI)

1. Counsel reviews `docs/legal/DRAFT-terms.md`, `docs/legal/DRAFT-privacy.md`, and `docs/legal/DRAFT-billing-refunds.md`. Fill `[Business address: to be confirmed]`. Publish only after that review. The drafts are not linked today.
2. In the live Stripe account, run `node scripts/stripe-live-setup.mjs` and read the plan. Then, only with an `sk_live_` key and `STRIPE_LIVE_ENABLED=1`, run it again with `--confirm-live`. Put the printed price ids and webhook secret into the live env names above.
3. Confirm Checkout on a live $1 or the real price only after Francisco says to. This branch does not do that.
4. Leave `BILLING_ENFORCE` off. Early customers see `rollout_notice`. Give them the advance warning and the grace period before setting the flag to `1`.
5. When enforcement is turned on, new trials still last 14 days from organization creation, downgrades open the screen picker, and no content is deleted.
