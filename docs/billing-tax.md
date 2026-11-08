# Billing and tax (draft)

This note records how Pekko bills. It does not enable Stripe Tax, file a return, or make a legal commitment beyond naming who sells the service.

## Merchant of record

Francisco Lopez, a sole proprietor doing business as Pekko, is the merchant of record. He is responsible for sales tax. Pekko uses standard Stripe Billing. Stripe Tax is not enabled.

Pekko is the seller. Managed Payments, where Stripe would be the seller, is not the live configuration.

## Live Checkout

Live Checkout sends `managed_payments[enabled]=false` only when `STRIPE_MANAGED_PAYMENTS` is exactly `0`. That variable is required for live. If it is unset, or any other value, Checkout is refused and the Stripe account default is not used.

`STRIPE_LIVE_ENABLED` must also be exactly `1` before a live key is accepted. Leaving it unset keeps Checkout in test mode. This document does not turn either flag on.

## What Stripe does

Stripe charges the card and sends the receipt from Stripe's own email setting. Pekko does not store card numbers and does not calculate tax in the app.
