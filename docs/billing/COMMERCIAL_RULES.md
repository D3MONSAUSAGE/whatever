# Commercial billing rules (enforced only with BILLING_ENFORCE=1)

Source of truth: `commercialEntitlement()` in `lib/server/entitlements.ts`, applied on top of the SQL `account_entitlement` row by the player, pairing, screen list and entitlement API.

| Account | Access |
|---|---|
| Trial | Exactly 14 days from `trial_started_at` (a later `trial_ends_at` is capped), 5 active screens, no card. Option B subscriptions canceled before their first paid charge keep the same original 14-day end and 3-day playback grace (`state: trial_grace`): existing published content may keep playing, while editing, publishing, uploading, pairing, and `POST /api/entitlements/active-screens` are locked (`403 subscription_inactive`). After grace, `expired`. |
| Starter / Business / Multi | 1 / 3 / 5 active screens while the Stripe subscription is active. |
| Canceled at period end | Full access until the paid-through date, then restricted. |
| Payment failed (past_due) | 7-day grace from the first failure (playback only), then restricted. If Stripe ends the subscription after a failure, both SQL `account_entitlement` and JS `commercialEntitlement` cap playback at `least(grace_ends_at, current_period_end)`; the unpaid period is not given away. |
| unpaid, incomplete, incomplete_expired, paused, no status | Restricted. |
| Complimentary (`comp`) | Active, 5 screens, no expiry, no Stripe. Playback allowed. Only accounts explicitly set to `comp` (service-role `set_account_comp`). Billing reminders and billing emails skip these accounts. |
| grandfathered, any other plan | Restricted (no free plans). Move these orgs to `trial` before enforcing. Do not treat `comp` as restricted. |

Restricted means: screens show "This screen is paused" (the token is kept, so they resume once paid), no new pairings, the dashboard asks to choose a plan. Nothing is deleted.

Over the allowance: the most recently playing screens up to the limit keep playing; the owner picks which stay on in Billing (`POST /api/entitlements/active-screens`). Paused screens show an over-limit message and resume when selected. Pairing beyond the allowance is refused.

With BILLING_ENFORCE=1, write-gated routes fail closed with `503 plan_check_unavailable` (`Retry-After: 5`) if entitlement verification errors or returns no row; TV playback stays fail-open on DB read errors.

With BILLING_ENFORCE off, every rule above is skipped and the SQL row is used as before.
