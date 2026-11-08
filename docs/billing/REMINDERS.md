# Unattended billing reminders

Merging this code sends no email and starts no existing-customer clock. Both stay off until `BILLING_REMINDERS` is exactly `1`. `BILLING_ENFORCE` and `STRIPE_LIVE_ENABLED` are separate and stay unset.

## Durations

| Clock | Length | Starts | What it is |
| --- | --- | --- | --- |
| Trial | 14 days from organization creation | Account insert (`trial_ends_at` default) | The free trial. Not extended by the playback grace. |
| Playback grace | 3 days after `trial_ends_at` | Automatically in `account_entitlement` | State `trial_grace`. Screens keep playing. This is not a longer trial. |
| Failed-payment grace | 7 days from the first `past_due` | Stripe webhook, once | Screens keep playing until `grace_ends_at`. A repeat failure does not move it. |
| Existing-customer notice | 14 days of continued full access | Only after the reminder email is successfully sent | Not started by a dashboard visit. No suspension is turned on by the send. |

The dispatcher does not set `BILLING_ENFORCE`. Grandfathered playback in migration `0013` is unchanged, so the notice cannot cut screens off.

## Route

`GET /api/cron/billing-reminders`

- Auth: `Authorization: Bearer <CRON_SECRET>`, the same secret as the other cron routes. Missing secret is 503. Wrong secret is 401.
- `BILLING_REMINDERS` unset or not `1`: `{ "enabled": false }` and no account reads, no claims, no stamps, no email.
- `?dryRun=1` with the flag on: returns planned kinds per org id. It does not send or stamp.
- A live run sends at most 40 orgs. Each org's error stays on that org. The JSON has account ids, kinds, and status codes. It does not include email addresses, message bodies, or secrets.
- The existing-customer row `billing_transition_started_at` is written only after that org's notice send returns success, and only if it is still null.
- The same claim key is not sent twice. A failed send is not claimed, so the next run retries it and still does not start the clock.

The daily Hobby cron (`/api/cron/orphan-uploads`, already in `vercel.json`) calls the same function as a backup. That does not add a second Vercel cron. Hobby cannot add a faster schedule without a paid plan, so do not add one.

## Free scheduler (Supabase pg_cron + pg_net)

These extensions are already used by alert delivery. No upgrade.

Apply `supabase/migrations/0022_billing_reminders_cron.sql` only when you want the daily job installed. It does not email anyone until both of these exist:

1. Vault secret `seemple_cron_secret` (the same value as `CRON_SECRET`). If it is missing, the job returns `no_secret` and does not call the app.
2. `BILLING_REMINDERS=1` on the Vercel Production environment. Leave it unset until the notice copy is accepted.

Optional Vault secret `pekko_app_origin` overrides the app origin. The default is `https://pantalla-chi.vercel.app`.

Schedule: `0 15 * * *` (15:00 UTC, once a day). Once a day is enough for "3 days" and "1 day" reminders, and it stays under Resend's free quota (100 emails/day, 3,000/month). The dispatcher also caps a run at 40 orgs. Do not change the schedule to every minute and do not upgrade Resend for this.

Dry run, after the route is deployed and `CRON_SECRET` is set, still with `BILLING_REMINDERS` unset:

```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  "https://pantalla-chi.vercel.app/api/cron/billing-reminders?dryRun=1"
```

Expected while the flag is unset: `{"ok":true,"enabled":false,...}` and no mail. Turn the flag on only for a QA project first, call the same URL with `dryRun=1`, and read `orgs[].kinds` before any live run.

Rollback of the job only: `select cron.unschedule('pekko-billing-reminders');` Account rows are left as they are.
