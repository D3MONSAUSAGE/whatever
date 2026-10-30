# Offline alerts (M9)

## How it works
- TVs check in every ~30 s (`last_seen_at`). A Postgres job (`pg_cron`, job `seemple-offline-alerts`, every minute) runs `public.check_offline_alerts()`.
- **Offline alert**: an active, paired screen whose last check-in is older than the account's threshold (default 10 min, 2–1440) and less than 1 day old. One alert per outage: the screen is flagged (`displays.offline_alerted_at`) in the same statement, rows are locked with `skip locked`, and a unique index on `(display_id, kind, offline_since)` backs it up.
- **Recovery alert**: the next check-in after an offline alert. Includes how long the screen was offline. Removed screens and accounts with alerts turned off are cleared without a recovery alert.
- Screens that never connected, or were already offline for more than a day when checked, are not alerted (no storm on first run).
- Why pg_cron: Vercel Hobby crons run at most once a day. pg_cron is included free with Supabase and costs one small query a minute. The daily Vercel cron (`/api/cron/orphan-uploads`) also runs the check as a safety net.

## In the app
- Banner on every dashboard page while there are unread alerts; `/dashboard/alerts` lists all; Settings → "Screen alerts" for on/off, minutes, and email.
- Stored in `public.alerts` (RLS on, no policies; server-only). Deleted after 90 days by the daily cron (`alerts_purge`).

## Email (inactive until configured)
Pluggable provider in `lib/server/email.ts`. Nothing is sent until these Vercel env vars are set (Production):

| Var | Example |
|---|---|
| `EMAIL_PROVIDER` | `resend` |
| `RESEND_API_KEY` | from the Resend dashboard |
| `ALERT_EMAIL_FROM` | `Pekko <alerts@your-verified-domain>` |

- Emails go to the account owner's sign-in email when the account has email alerts on (default on).
- While no provider is configured, pending emails are marked `skipped`, so switching email on later never sends a backlog. Alerts older than 6 h are never emailed.
- Each alert is claimed before sending (attempt counter) so parallel runs can't send twice; it's marked `failed` after 3 attempts.
- Delivery runs from `GET /api/cron/alert-emails` (Bearer `CRON_SECRET`; `?dryRun=1` changes nothing) and once a day from the existing cron.

### Minute-by-minute email (optional, after Resend is set up)
The daily cron alone would make emails up to a day late. To send within a minute, run once in the Supabase SQL editor (stores the cron secret in Supabase Vault, encrypted):

```sql
create extension if not exists pg_net;
select vault.create_secret('<CRON_SECRET value>', 'seemple_cron_secret');
select cron.schedule('seemple-alert-emails', '* * * * *', $job$
  select net.http_get(
    url := 'https://pantalla-chi.vercel.app/api/cron/alert-emails',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'seemple_cron_secret')))
  where exists (select 1 from public.alerts where email_status = 'pending');
$job$);
```
It only calls Vercel when an email is waiting, so it adds almost no function invocations.

## Cost
- One `check_offline_alerts()` query a minute (indexed, a few ms).
- One alert row per outage and per recovery. Kept 90 days.
- Email: Resend's free tier (3,000/month) covers typical use; Francisco decides.

## Rollback
`select cron.unschedule('seemple-offline-alerts');` stops new alerts. Code rollback leaves the new tables and columns unused; nothing needs deleting.
