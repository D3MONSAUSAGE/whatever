# Pekko — Meta Pixel + Conversions API: privacy & technical review (DRAFT)

Status: development/testing only. Both flags default OFF. No dataset, Pixel id or token exists; no request has ever been sent to Meta. Not deployed. Privacy-policy text below is a draft for legal review, not published.

## Controls
- Flags: `META_PIXEL_ENABLED`, `META_CAPI_ENABLED` (exact string `"true"` + ids/token required). Off = no banner, no fbq, no CAPI, consent POST is a no-op.
- Consent: opt-in for every visitor (no region logic). Default = nothing loads. fbq script (connect.facebook.net) is injected only after the server returns a Pixel id for a recorded `granted` row.
- Global Privacy Control: `Sec-GPC: 1` → grant refused (409), no Allow button, no Pixel, no CAPI, even if a grant was recorded earlier.
- Withdraw: "Privacy choices" link in the footer of sign-in/legal pages reopens the dialog. Withdrawal sets status `withdrawn`, nulls fbp/fbc/fbclid in the same write (DB CHECK enforces it), expires `_fbp`/`_fbc`, reloads to drop fbq. Later events are blocked by the gate.

## Data collected (only after consent)
| Data | Where | Sent to Meta | Notes |
|---|---|---|---|
| visitor id (random UUID, httpOnly cookie `pk_mc`) | marketing_consent | no | set only after a choice |
| fbp, fbc, fbclid | marketing_consent | fbp/fbc via CAPI | format-validated |
| consent status, version, timestamps | marketing_consent | no | audit trail |
| email | not stored by this feature | SHA-256 via CAPI only | never in browser Pixel (no advanced matching) |
| IP, user agent | not stored | CAPI only, per request | |
| event_name, event_id, status, attempts, error | meta_event_log | name/id | no personal data |

Never sent: screen/display names, media, playlists, menus, promos, business name or any customer content (custom_data allowlist: content_name landing|pricing, status, value, currency, plan, screens_paired). event_source_url has its query string stripped.

## Storage
Dedicated tables `marketing_consent` and `meta_event_log` (migration 0015, additive). RLS on, no policies, revoked from anon/authenticated → service role only. Nothing on profiles/accounts.

## Retention & deletion
- `marketing_purge(13, dry_run)` deletes consent rows with no activity for 13 months and log rows older than 13 months (needs a cron hook when enabled).
- Account deletion: `marketing_consent.user_id` → `auth.users on delete cascade` removes linked rows immediately.
- Withdrawal purges identifiers immediately.

## Events
| Event | Source | action_source | event_id |
|---|---|---|---|
| PageView, ViewContent | browser fbq + /api/meta/event | website | browser UUID (same both sides) |
| CompleteRegistration | browser + server (auth required) | website | `reg:<user_id>` server-side |
| StartTrial | server only, after backend commits trial | system_generated | `trial:<user_id>` |
| Subscribe | server only, verified Stripe webhook (stub until M17.3) | system_generated | `sub:<stripe_subscription_id>` |
Revenue: Subscribe carries value (19/39/59 USD). **Purchase is not sent** → no double count. ActivatedTrial is defined but not wired.
Dedupe: Meta dedupes on event_name+event_id; locally an insert-first unique (event_name,event_id) log means retries/repeat views never resend.
Reliability: CAPI runs in `after()` (non-blocking), 3 tries with backoff on 5xx/429/network, no retry on 4xx, 5 s timeout, failures logged (no token in logs) and recorded in meta_event_log.
Testing: `META_CAPI_ENDPOINT` points at a mock; `META_TEST_EVENT_CODE` adds test_event_code and marks rows test_mode.

## Open items before any production activation (need Francisco)
1. Legal review of the policy text; verified legal entity.
2. Create dataset in the existing Business portfolio; token as Vercel server env var.
3. Wire StartTrial into the M17 trial code and Subscribe into the M17.3 webhook; schedule marketing_purge.
4. Meta's Data Processing Terms / Limited Data Use decision for CA etc.
5. Explicit approval to send real data.

## Draft privacy-policy text (not published)
**Marketing cookies and Meta.** If you choose "Allow", we use Meta Platforms' Pixel and Conversions API to measure our ads. We share with Meta: cookie identifiers (_fbp, _fbc), the ad click id from your link, your IP address and browser type, the pages you view on our website, and — if you sign up — a one-way hashed (SHA-256) version of your email and whether you started a trial or subscribed (with the plan price). We never share your screens, media, menus or other content. Marketing cookies are off unless you opt in, and we honor Global Privacy Control signals. You can withdraw anytime with "Privacy choices" at the bottom of the page; we then stop sending data and delete stored identifiers. We delete marketing records after 13 months of inactivity, and immediately when you delete your account. Meta processes data under its own terms and privacy policy.

## Local tests
`npm run build && npx next start -p 3100` then `npx playwright test -c playwright.local.config.ts --workers=1` (EXPECT_BANNER=1 with flags on + dummy ids + META_CAPI_ENDPOINT=http://127.0.0.1:9).
