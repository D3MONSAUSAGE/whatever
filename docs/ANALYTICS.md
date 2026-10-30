# Analytics and onboarding (M8): privacy, retention, cost

## What is collected
All data is per account and only about the business's own screens and content. Nothing is collected about the people who walk past a screen. There are no cookies, no device fingerprints, and no third-party analytics.

| Data | Where it comes from | Table |
|---|---|---|
| Online seconds per screen per hour | Existing TV heartbeats (`last_seen_at`, written at most every 30 s). A gap of 90 s or less counts as online. | `display_uptime_hourly` (one row per screen per hour, only while online) |
| Offline periods | A heartbeat gap over 90 s. Starts 90 s after the last heartbeat. | `display_offline_periods` |
| TV-confirmed playback | The TV posts `{playing:{version}}` once after it actually paints new content | `displays.confirmed_version/confirmed_at`, `playback_events` (one row per content change) |
| Activity | Database triggers on publish, screen content change, pair/remove, schedule create/change/delete, media upload/delete | `activity_events` |
| Setup state | Derived from existing rows; only "hidden" and "business confirmed" are stored | `accounts.onboarding_dismissed_at`, `accounts.business_confirmed_at` |

The new tables have row-level security on with no policies, and are revoked from `anon` and `authenticated`. Only the server (service role) reads them, always filtered by the signed-in owner's account.

## Verified vs. not verified
"Confirmed by the TV" means the TV reported painting exactly the version the server expects, and it is online. Published or scheduled content the TV has not confirmed is shown as "Published, not confirmed" and is never counted as verified. TVs running an older cached player page will not confirm until reloaded.

Uptime is only measured from the M8 release (`coverageFrom`). Earlier time is not counted, and uptime is blank until there are 10 minutes of coverage.

Bandwidth is not shown: it cannot be measured per account accurately (Supabase Storage egress is project-wide, and TVs cache media). Storage is the exact sum of uploaded file sizes.

## Retention
Analytics rows older than 90 days are deleted by the existing daily cron (`/api/cron/orphan-uploads`) through `analytics_purge(90, dryRun)`. A dry run reports counts without deleting. Deleting an account deletes all of its analytics rows (cascade).

## Cost
- About 1 small row per online screen per hour (≈ 720 rows/screen/month), plus a handful of activity rows per change. At 90-day retention, 100 screens is roughly 220k rows (tens of MB), well inside the Supabase free/pro database limits.
- No extra HTTP requests from TVs except one POST per content change.
- The dashboard Analytics page polls every 30–60 s only while the tab is visible.
- The heartbeat trigger is wrapped in an exception handler so analytics can never break a TV's heartbeat.
