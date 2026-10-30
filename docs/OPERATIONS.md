# Pekko operations: monitoring, alerts, security, backups (Milestone A)

## 1. Error monitoring (free, live)
- **Server errors:** `instrumentation.ts` writes one JSON line per unhandled error to the Vercel runtime logs: `{"level":"error","event":"request_error",…}`. It records the method, path (no query string), route, digest and a 300-character message. Headers, cookies and bodies are never logged.
  - To find them: Vercel → pantalla → Logs → search `request_error`.
  - Hobby plan logs are kept for about 1 hour.
- **Page errors:** `app/error.tsx` and `app/global-error.tsx` show a branded "Something went wrong" page with a Try again button and a short code (the digest). That code matches the `digest` in the logs.
- **TV errors:** players already report playback errors (`report_player_error`). They show on the screen card and in `GET /api/displays` as `playerError`.
- **Health:** `GET /api/health` returns `200 {ok:true,database:"ok",ms,time}`, or `503` if the database can't be reached. It's public and reveals nothing about accounts.

## 2. Alerts: owner action (free options, needs an account)
| What | How | Cost |
| --- | --- | --- |
| Site or database down | UptimeRobot (or Better Stack) free monitor on `https://pantalla-chi.vercel.app/api/health`, every 5 min, alerting to the owner's email or phone | Free |
| Failed deploys | Vercel → Settings → Notifications (email on failed production deploy) | Free |
| Supabase incidents and usage | Supabase → Organization → enable usage/billing emails; subscribe at status.supabase.com | Free |
| Error spikes (later) | Sentry free developer tier (5k errors/mo). Needs a DSN env var; not added yet | Free tier, needs account |
| Screen offline emails to customers (later) | Needs a custom SMTP or email API key. Today, the dashboard shows offline screens instead | Provider free tiers exist |

Vercel log drains and alerting rules need a paid Vercel plan, so they're not used.

## 3. Offline screens (live)
- A screen is **online** if its player sent a heartbeat in the last 90 s. The player polls about every 30 s (`PLAYER_POLL_MS`; older cached players every 10 s), so a published change reaches a TV within about 30 s.
- Overview and Displays refresh every 10 s. They show a red "N screens are offline" box naming each screen and how long it has been silent, and put "(N offline)" in the browser tab title. Each offline badge reads "Offline · 19 h".
- Screens still waiting to pair aren't counted as offline. This changes only the dashboard Offline tile; `/api/overview` is unchanged.

## 4. Security / account isolation audit (Oct 29, 2026)
**Production database (read-only checks):**
- Every `public` table has RLS on. Customer tables have only "owner can read own account's rows" policies.
- `pairing_sessions` and `rate_limits` have no policies, so only the server can reach them. Supabase's advisor flags this as INFO, and it is intended.
- No anon or authenticated INSERT/UPDATE/DELETE policies exist. All writes go through server routes that check the account.
- All 12 `public` functions are not executable by `anon` or `authenticated`.
- The `media` bucket is private, with a 50 MB limit and no storage policies. Files are served only through signed URLs (1 h for the dashboard; the player 1 h too).

**Tests:**
- `tests/rls/isolation.test.ts`: real Supabase, two users, tables, storage and functions.
- `tests/api/cross-tenant.test.ts` (new) covers every id-taking route (displays, media, playlists, publish, snapshot, locations, groups, schedules, preview). It also checks A's ids hidden inside B's own requests (assigning A's media, playlist or location; adding A's media to B's playlist; publishing to A's screens; grouping or scheduling A's screens; scheduling A's playlist or group).
  - Every case is refused, A's rows stay byte-identical, and lists never contain A's ids.
- **Result:** no cross-account access found.

**Owner action (free on Pro):** Supabase → Authentication → Passwords → turn on **Leaked password protection**. This is the advisor's one WARN.

## 5. Backups and recovery
- **Today (Pro plan):** automatic daily database backups, kept 7 days, restorable from Supabase → Database → Backups. Point-in-time recovery is a paid add-on and is not enabled. It isn't needed at this size.
- **Not covered by database backups:** the media *files* in Storage. Uploads are stored durably, but a file deleted in the app can't be restored from a database backup. Mitigation (owner decision, free): a weekly copy of the `media` bucket to another location (e.g. a local `supabase storage` download script). The script can be added on request.
- **Schema:** all of it is in `supabase/migrations` (additive only), so a fresh project can be rebuilt with `supabase db push`.
- **App rollback:** every release records the previous Vercel deployment id. Rollback means promoting it (Vercel → Deployments → Promote, or `vercel rollback <id>`), which takes about 1 minute and needs no database change.
- **Recovery runbook:**
  1. Decide whether it's an app problem (roll back the deploy) or a data problem.
  2. For data, prefer a targeted fix by SQL from the backup. A full restore replaces the whole database with that day's copy and loses newer changes.
  3. A full restore from Supabase → Database → Backups needs the owner's approval.
  4. Afterwards, check counts (users, accounts, displays, media, playlists) and confirm one TV heartbeats.
- Practice a restore into a new or branch project before launch. This costs money (branch compute), so it needs the owner's OK.

## 6. Media delivery and playback reliability (status)
Already in place and covered by `npm run test:player` plus the e2e TV tests:
- signed media URLs refreshed with each state poll;
- an unchanged poll returns a tiny `{unchanged:true}` response;
- a broken video is skipped without stretching or blanking the neighbouring images;
- a video playlist survives a dropped connection;
- player errors are reported to the dashboard.

Media is not yet kept on the TV across restarts, and full offline play isn't there yet. Both are part of Milestone B (persistent cache, incremental downloads).

## 7. Legal pages
`/terms` and `/privacy` are **drafts** with a red "not yet reviewed by a lawyer" notice and [bracketed] gaps (pricing, liability, governing law, contact, retention timelines). They're linked from the sign-in pages and Settings. They need legal review before launch.
