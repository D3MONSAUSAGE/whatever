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

- Auth: `Authorization: Bearer <CRON_SECRET>`, the same secret as the other cron routes. Missing secret is 503. Wrong secret is 401. The handler does not log or return that header.
- A request that passes the gate includes `"cronAuth": "accepted"`. That field is not a secret. It only tells the scheduler check that this app accepted the bearer token.
- `BILLING_REMINDERS` unset or not `1`: `{ "enabled": false }` and no account reads, no claims, no stamps, no email.
- `?dryRun=1` with the flag on: returns planned kinds per org id. It does not send or stamp.
- A live run sends at most 40 orgs. Each org's error stays on that org. The JSON has account ids, kinds, and status codes. It does not include email addresses, message bodies, or secrets.
- The existing-customer row `billing_transition_started_at` is written only after that org's notice send returns success, and only if it is still null.
- The same claim key is not sent twice. A failed send is not claimed, so the next run retries it and still does not start the clock.

The daily Hobby cron (`/api/cron/orphan-uploads`, already in `vercel.json`) calls the same function as a backup. That does not add a second Vercel cron. Hobby cannot add a faster schedule without a paid plan, so do not add one.

## Free scheduler (Supabase pg_cron + pg_net)

These extensions, and Vault secret `seemple_cron_secret`, are already used by alert delivery. No upgrade. Do not rotate that secret, do not create a second one, and do not edit the `pekko-alert-delivery` job.

`private.dispatch_billing_reminders(boolean)` is `security definer` with `search_path` locked empty. It lives in schema `private`, which is not a Data API schema. `anon`, `authenticated`, and `service_role` have no `USAGE` on that schema and no `EXECUTE` on the function. The only explicit execute grant is to `postgres`, the role pg_cron uses on Supabase. The function takes no URL and no secret. It reads `seemple_cron_secret` inside the database, builds `Authorization` there, and returns only `status`, `request_id`, and `dry_run`. Failures return `dispatch_failed` with no error text. `private.billing_reminders_auth_check(bigint)` returns HTTP status and the `ok` / `enabled` / `dryRun` / `cronAuth` flags for a request this dispatcher queued. It does not return headers, the body, `error_msg`, or any other pg_net row.

Do not add `private` to Exposed schemas. Do not `select` from `vault.decrypted_secrets` or `net.http_request_queue` (the queue holds the bearer token until pg_net sends it). Do not `select content, headers` from `net._http_response`.

### Install

Do this only after the production deployment includes `"cronAuth": "accepted"` on this route. Leave `BILLING_REMINDERS`, `BILLING_ENFORCE`, and `STRIPE_LIVE_ENABLED` unset. Apply the migration once, in the Supabase SQL editor:

`supabase/migrations/0022_billing_reminders_cron.sql`

That installs the functions and, because production has `pg_cron`, schedules `pekko-billing-reminders` at `0 15 * * *` (15:00 UTC, once a day) as `select private.dispatch_billing_reminders(false)`. The command text contains no secret. Once a day stays under Resend's free quota (100 emails/day, 3,000/month). The app also caps a run at 40 orgs. Do not change the schedule to every minute and do not upgrade Resend. If `seemple_cron_secret` is missing, the job returns `no_secret` and does not call the app. Optional existing Vault secret `pekko_app_origin` is used only when it is `https://` plus a host. Otherwise the origin stays `https://pantalla-chi.vercel.app`.

The daily call uses `false`, so a later `BILLING_REMINDERS=1` does not need a new schedule. Until that flag is exactly `1`, the app still returns `enabled: false` and changes nothing. Merging this file does not apply it.

### Safe disabled-mode check

Run this in the SQL editor after the migration. It does not print the Vault secret. `true` forces `?dryRun=1`, so this call does not send or stamp even if the flag were on.

```sql
select private.dispatch_billing_reminders(true);
```

Expected: `{"status":"dispatched","request_id":<n>,"dry_run":true}`. `no_secret` means the existing Vault secret is missing; stop, and do not create one from this procedure. Wait a few seconds, then pass that request id:

```sql
select private.billing_reminders_auth_check(<n>);
```

Expected while the flags are unset and the Vault secret matches `CRON_SECRET`:

```json
{"status":"checked","http_status":200,"timed_out":false,"ok":true,"enabled":false,"dry_run":true,"cron_auth":"accepted","auth":"aligned"}
```

`auth` is `aligned` only for HTTP 200, `cronAuth` exactly `accepted`, and `enabled` false. `rejected` (401) means the app did not accept the bearer token. `app_unconfigured` (503) means the app has no `CRON_SECRET`. `pending` means pg_net has not stored the response yet; run only the check again. `flag_on` means `BILLING_REMINDERS` is on; this dry run did not send, and the daily `false` call must stay unrun until that is intentional. `unexpected` means the deployed route does not return `cronAuth` yet, or the response was not this route.

Rollback, leaving secrets and the alert job in place: `supabase/rollback/0022_billing_reminders_cron.sql`. Account rows stay as they are.
