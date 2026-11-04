# Entitlement and trial-status API (Pantalla to Gother), v2

Status: built on branch `cursor/m17-entitlements` (PR below). Not deployed. Enforcement flag `BILLING_ENFORCE` is off, so today every response has `"enforced": false` and nothing is blocked. All endpoints use the existing Bearer auth. Example bodies for every state are in `fixtures/` (also in the repo at `docs/billing/fixtures/`).

## 1. States (closed enum)
`trial`, `trial_grace`, `active`, `past_due`, `grandfathered`, `canceled`, `expired`. There is no `inactive` state; a lapsed paid plan is `canceled`, and a lapsed trial is `expired`. Treat an unknown value like `canceled`, show the warning message, and don't crash.

| state | meaning |
|---|---|
| trial | 14-day trial, up to 5 screens, no card |
| trial_grace | the 3 days after the trial ends: screens keep playing, no new screens |
| active | paid plan (Stripe active/trialing, or canceled but still inside the paid period) |
| past_due | payment failed; screens play until `grace_ends_at` |
| grandfathered | account that existed before billing ("Early customer"); existing screens never pause |
| canceled | paid plan ended; screens paused, content kept |
| expired | trial and grace over; screens paused, content kept |

## 2. GET /api/entitlements
Fields: `account_id, state, plan` (`trial|starter|business|multi|grandfathered`), `plan_name, screen_limit, active_screens, total_screens, can_add_screen, playback_allowed, trial {started_at, ends_at, days_left} | null, subscription {status, current_period_end, cancel_at_period_end} | null, grace_ends_at, suspend_at, features_locked, warning, enforced, billing_url, server_time`. All times are ISO UTC. Use `server_time` rather than the phone clock for countdowns.

`days_left` rounding: ceil((ends_at - server_time) / 24h). It is 14 at the start, 1 during the last 24 hours, 0 at or after the end, and null when there is no end date. Display dates in the device's time zone. Server warning text says "(UTC)".

`suspend_at`: when screens will pause if nothing changes (trial: end + 3 days; past_due: grace end). null when nothing is scheduled or already paused.

`warning`: `{kind, message, action} | null`. Kinds: `trial_ending` (7 or fewer days left), `trial_ended`, `payment_failed`, `over_limit`, `expired`, `canceled`. `action`: `"open_plan" | "select_screens" | null`. Show `message` as-is. In the app, map `open_plan` to read-only plan info (see policy below) and `select_screens` to the screen picker.

`features_locked`: always `[]` in M17. No premium-gated features; every plan and the trial get everything.

## 3. Per-state matrix (applies only when enforced is true)
| state | TV playback | pair new screen | uploads / publish |
|---|---|---|---|
| trial | yes | if under 5 | yes |
| trial_grace | yes | no: 403 `subscription_inactive` | yes |
| active | yes, up to the plan limit | if under the limit, else 403 `screen_limit` | yes |
| past_due | yes until grace_ends_at | no: 403 `subscription_inactive` | yes |
| grandfathered | yes, all existing screens | if under 5, else 403 `screen_limit` | yes |
| canceled | no | no: 403 `subscription_inactive` | yes |
| expired | no | no: 403 `subscription_inactive` | yes |

Pairing (`POST /api/displays/pair`) error body: `{error, code}`. A paused TV gets HTTP 402 from `/api/player/state` and shows "This screen is paused". It stays paired, re-checks every 60 s, and resumes by itself. No content is ever deleted.

## 4. Screens over the limit
- `GET /api/displays`: each item has `entitled: boolean` (false means paused by billing). It is always true when not enforced, or if the check errors.
- `POST /api/entitlements/active-screens` with body `{"displayIds": ["uuid", ...]}` sets which screens stay on. Unlisted screens pause; nothing is deleted. 200 returns the entitlements body. Errors: 400 `invalid` (bad body), 400 `too_many` (more than screen_limit), 403 `not_found` (an id isn't this account's active screen). 409 is not used: the call is idempotent and the last write wins.
- Default if the owner never picks: the most recently active screens stay on (latest confirmed playback, then newest).

## 5. Push: trial_reminder
New data type: `{type: "trial_reminder", alertId, daysLeft?}`. FCM data values are strings, so `daysLeft` is a string like "3". It is in the type now; sending is planned for M17.4 (days 7/11/13/14). On tap, open plan info.

## 6. Account scope
Status is per account (one account per user). Refetch `/api/entitlements` on sign-in, on account switch, on app foreground, and after a 402 or 403 billing code.

## 7. /api/overview?include=entitlements
Not built in M17.1-2; call `/api/entitlements` separately. It can be added later if needed.

## 8. Mobile policy and billing_url
The mobile app doesn't use `billing_url` for now (store-billing-compliance.md, option A: sign-in only, no prices, no purchase links in the app). The web billing page works in a phone browser; if the user is signed out it goes through `/login?next=/dashboard/billing` and returns there. Online checkout isn't live ("coming soon").
