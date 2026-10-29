# Phase 2D plan: schedules, locations, and screen groups

Scheduling on top of the dashboard that already ships. Authentication, login, account ownership, pairing tokens, and `public/player.html` stay as they are. Existing accounts, displays, media, playlists, assignments, and publish keep today's behavior when no schedule rule targets the screen. The saved assignment is the default: it plays whenever no rule is active.

Production is not modified by this work. Do not merge, do not promote a deployment, and do not apply `0004_scheduling.sql` until the owner reviews the pull request.

| | |
| --- | --- |
| Base | `main` at `9855107` |
| Migration | `supabase/migrations/0004_scheduling.sql` (not applied) |
| Rollback | `supabase/rollback/0004_scheduling.sql` |
| Production site | `https://pantalla-teamtegrate.vercel.app` |
| Supabase project | `iybmjtkjfxcqupvhoddh` (migrations 0001–0003 only) |

## What this adds

- **Locations.** The `locations` table already exists. `ensure_account` still inserts `Main location`. Each location has an IANA timezone (existing rows become `UTC` when the migration runs). The dashboard can create, rename, set the timezone, and delete a location that has no active screens. Displays move between locations with `PATCH /api/displays/:id` `{ locationId }`.
- **Screen groups.** A named set of displays in one account. A display can be in more than one group. A playlist schedule can target a group.
- **Schedules.** A rule is "playlist X on these weekdays, from this local time to that local time", optionally between two dates. The clock is the **screen's location timezone**, so one group rule is 11:00–14:00 at each screen, not one UTC instant. The TV player is unchanged. Each poll resolves the winner on the server.

## Player, without changing player.html

`public/player.html` still polls `GET /api/player/state` every 10 seconds and treats a matching `version` as "keep what is on screen". The route now resolves schedules before it answers.

- No enabled rule targets the display: the JSON is the same as today. `version` is `content_version`. A single assigned image still has no `playlist` object. Draft saves still do not change a TV.
- Rules exist but none match this instant: `version` stays `content_version`, so the saved assignment plays. `nextTransitionAt` may be added.
- A rule matches: the response is that playlist's **published** slides, even if the screen's everyday assignment is a single image. `version` is a stable integer derived from the rule id, the playlist id, and the published revision (`playbackVersion` in `lib/server/schedule.ts`). It is not `content_version`. It stays the same while that rule keeps winning, and it changes when a different rule wins or the playlist is published again. The player's next poll, within about 10 seconds, sees a new version and swaps without a reload.

`nextTransitionAt` is an ISO timestamp, included only when a rule targets the screen and the winner changes within 8 days. The current player ignores unknown fields. The poll still re-resolves every time, so a missed field does not delay a transition past one cycle.

An active rule with no published slides shows an empty screen until the window ends. It does not fall through to the default. The API refuses to create a rule for a playlist that has never been published, so this is the case where the published snapshot was removed later.

## Conflict resolution

Among enabled rules whose window matches the instant and whose target includes the screen:

1. A rule on **this display** beats a rule on a **group**, even when the group rule has a higher priority.
2. Higher `priority` wins. The default is 0. The range is -1000 to 1000.
3. The most recently updated rule wins.
4. The lowest id wins, so a tie is deterministic.

`GET /api/schedules/preview?displayId=&days=7` returns that sentence and the timeline. `days` is 1–14.

## Time zones, midnight, and DST

Weekdays are ISO: 1 Monday through 7 Sunday. A window is `[start, end)` in local minutes. `24:00` is the end of the local day (`end_minute` 1440). If the end is earlier than the start, the window crosses midnight: it **starts** on a selected weekday and continues into the next morning even when that morning's weekday is not selected. `startsOn` / `endsOn` are inclusive local dates of the day the window started (the previous local date for the after-midnight part).

Resolution uses `Intl` with the location's IANA name. There is no fixed offset and no new dependency.

- **Spring forward** (America/Los_Angeles, 2026-03-08, 02:00 becomes 03:00). A civil time that does not exist never matches. A window that sits entirely inside the gap (02:15–02:45) plays nothing that day. A window that covers the gap (01:30–03:30) stays active on the instants that exist on either side. The missing hour is not played.
- **Fall back** (2026-11-01, 02:00 becomes 01:00). Both occurrences of a repeated clock time match when that clock time is inside the window, so 01:15–01:45 plays twice. The same local lunch hour is a different UTC hour before and after the change. Tests cover the week of that transition and the week of the spring change: Friday 11:00 local and the following Monday 11:00 local both match a weekday rule, and 11:00 UTC does not.

A screen with no location, or a timezone `Intl` rejects, uses `UTC`.

## Data

`0004_scheduling.sql` is additive:

- `locations.timezone text not null default 'UTC'`
- `screen_groups`, `screen_group_members`, `schedules`
- `snapshot_playlist(account_id, playlist_id)`, service role only

RLS on the three new tables matches playlists: `SELECT` for `authenticated` where `account_id` belongs to `auth.uid()`, no insert, update, or delete policy, and `SELECT` granted back after `REVOKE ALL`. Writes go through service-role routes that filter on the account from the JWT. `snapshot_playlist` is not executable by `anon` or `authenticated`.

`snapshot_playlist` copies the draft into the published slides and increments `revision`. It does not assign or clear screens. Displays that already use that playlist as their everyday assignment get a `content_version` bump so they reload. `publish_playlist` is not modified.

Deleting a location is refused while an active display still points at it. Revoked displays are detached (`location_id` null) and then the location row is deleted. Disconnecting a screen still only revokes the token.

## Rollback

Run `supabase/rollback/0004_scheduling.sql` by hand. It is not a migration. It drops `snapshot_playlist`, `schedules`, `screen_group_members`, `screen_groups`, and the `timezone` column. It does not update or delete rows in `accounts`, `displays`, `media`, `playlists`, `playlist_items`, `pairing_sessions`, or `rate_limits`. Location rows stay. Assignments, tokens, and published playlists stay. `content_version` values that `snapshot_playlist` already incremented are not rewound.

```sql
drop function if exists public.snapshot_playlist(uuid, uuid);
drop table if exists public.schedules;
drop table if exists public.screen_group_members;
drop table if exists public.screen_groups;
alter table public.locations drop constraint if exists locations_timezone_len;
alter table public.locations drop column if exists timezone;
```

If the new routes are deployed before the migration, schedule and group routes return 503 with the migration sentence, and the player keeps today's payload because a missing `schedules` table is treated as "no rules".

## API

Shapes are in [docs/api/openapi.yaml](api/openapi.yaml). Existing fields are unchanged.

| Method | Path | What it does |
| --- | --- | --- |
| GET, POST | `/api/locations` | List, including `displayCount` and `timezone`. Create. |
| PATCH, DELETE | `/api/locations/:id` | Rename and set timezone. Delete only when no active screen remains. |
| PATCH | `/api/displays/:id` | `{ locationId }` moves the screen. `{ mediaId }` still wins and ignores name and location. |
| GET | `/api/displays` | Adds `location: { id, name, timezone } \| null`. |
| GET, POST | `/api/screen-groups` | List and create. `displayIds` replaces membership on update. |
| PATCH, DELETE | `/api/screen-groups/:id` | Rename, replace members, delete. Deleting the group deletes schedules that target it. |
| GET, POST | `/api/schedules` | List and create. The playlist must have published slides. |
| PATCH, DELETE | `/api/schedules/:id` | Update, pause (`enabled: false`), or delete. |
| GET | `/api/schedules/preview?displayId&days` | Next 1–14 days for one screen. |
| POST | `/api/playlists/:id/snapshot` | Publish slides without assigning screens. |
| GET | `/api/player/state` | Same JSON when nothing is scheduled. Otherwise the resolved playlist and, when useful, `nextTransitionAt`. |

`POST /api/playlists/:id/publish` still assigns the screens in `displayIds` and clears the playlist from screens that were left out.

## Mobile API changes

The Flutter app keeps signing in with Supabase and calling `/api` with `Authorization: Bearer`. It still must not call `/api/player/*` or store a display token. Pairing, assignments, and playback stay on the TV. Nothing in auth, login, or the pairing-token design changed.

Additive, safe to ignore until the schedule screens are built:

- `GET /api/displays` adds `location`. A missing location is `null`. `connected`, `online`, `media`, and `playlist` mean the same thing. `playlist` is still the **saved** assignment, not whatever a schedule is playing right now. Use the preview route for "what is on screen at this minute".
- `GET /api/player/state` may add `nextTransitionAt` and may return a `version` other than `content_version` while a rule is active. The phone does not call this route. A TV build of `player.html` from before this phase keeps working because extra fields are ignored and, with no rules stored, the body does not gain fields.

New calls, all scoped to the owner's account by the JWT:

1. `GET /api/me` once after sign-in, as today. That still creates `Main location`.
2. `GET /api/locations`. Show the name and timezone. `POST` `{ name, timezone }` to add one. `PATCH` to rename or set an IANA timezone (`America/Los_Angeles`, not `PST`). `DELETE` returns 409 with `That location still has screens. Move them first.` while an active screen is there.
3. `PATCH /api/displays/:id` `{ locationId }` to move a screen. Do not send `mediaId` in that body. A body that contains `mediaId` still assigns or clears an image and ignores the location.
4. `GET/POST/PATCH/DELETE /api/screen-groups`. Names are unique per account, case-insensitive, 1–80 characters. `displayIds` must be active screens in this account, at most 100.
5. Publish the playlist's slides before creating a rule. `POST /api/playlists/:id/snapshot` updates the published snapshot and does **not** change which screens use it all day. `POST /api/playlists/:id/publish` is the existing assign-and-publish. A rule returns 400 until published slides exist. The TV plays those published slides, not the draft. Unpublished edits do not reach a screen until snapshot or publish.
6. `POST /api/schedules` with `name`, `playlistId`, exactly one of `displayId` or `groupId`, `weekdays` (integers 1–7), `startTime`, `endTime` (`HH:MM`, or `24:00` as an end), optional `startsOn` and `endsOn` (`YYYY-MM-DD`), optional `priority` and `enabled`. A smaller end than start crosses midnight.
7. `GET /api/schedules/preview?displayId=<uuid>&days=7` for the timeline. `source` is `schedule` or `default`. `default` is the saved assignment. Segments are in real UTC instants; `date` is the local calendar date. Bars in the website use real elapsed time, so a spring-forward morning is shorter than the clock labels suggest.

Paused rules (`enabled: false`) stay in `GET /api/schedules` and do not play. Deleting a playlist deletes rules that point at it and, as today, clears screens that were assigned that playlist.

Limits: 50 locations, 100 groups, 200 schedules, 100 screens in one group. Priority -1000 to 1000.

## Dashboard

`/dashboard/schedule` uses the Phase 2C shell, cards, buttons, and confirm dialog. The bottom nav gains Schedule and is six columns under the `md` breakpoint. Locations, groups, rules, and a 7-day preview for one screen are on that page. Displays gain a location menu. Rename, disconnect, publish, and pairing are unchanged.

`/preview?screen=schedule` still 404s unless `PANTALLA_UI_PREVIEW=1`. It is the screenshot harness, not a linked page.

## Tests

- Unit (`tests/unit/schedule.test.ts`): weekday windows, `Asia/Kolkata` as a non-hour offset, midnight-spanning windows, date ranges, the America/Los_Angeles fall-back week and spring-forward week, a gap that never matches, a window that covers the gap, both fall-back occurrences, conflict order, default fallback, playback versions, and a 7-day timeline.
- API (`tests/api/schedules.test.ts`): locations, the unchanged player payload when nothing is scheduled, a rule overriding an image and then returning to it, a display rule beating a higher-priority group rule, a Friday 22:00–02:00 window, preview, and the other account.
- RLS (`tests/rls/isolation.test.ts`): owner `SELECT` on the new tables, the other account sees nothing, owner updates and the other account's inserts affect zero rows, and `snapshot_playlist` is not executable with a user JWT. The test skips, and is not a pass, when 0004 is not applied. On Node 20, set `NODE_OPTIONS=--experimental-websocket` before this file or the Playwright cleanup client. The Supabase client opens Realtime, and that flag is built into Node 22.
- Player simulation: `public/player.html` is unchanged. `npm run test:player` still runs it.
- Playwright (`tests/e2e/schedule.spec.ts`) at 1440 and 390: create and rename a location, set a timezone, move a screen, publish slides, create a group, add a weekday rule, read the preview, refuse to delete a location that has a screen, delete an empty one, and a second account that cannot see the first. It skips unless `BASE_URL` is set, and skips (not a pass) when 0004 is not on that database. Existing `phone-and-tv` and `dashboard-ui` specs are unchanged.

## Limitations

- The TV notices a transition on the next poll, about 10 seconds, not at the exact second. `nextTransitionAt` does not make the current player poll early.
- Starting or ending a window reloads playback even when the scheduled playlist is the same as the default, because the version changes. The loop starts again.
- The playback version mixes the rule and playlist into one million buckets plus the revision. Two different pairs that land in the same bucket with the same revision would not change `version`. Publishing again, or any real edit that changes the revision or the playlist, separates them.
- Group rules follow each screen's timezone. They do not share one clock.
- `snapshot_playlist` does not rewind `content_version` on rollback.
- There is no staff role. One owner per account, as in the mobile plan.
- No new paid service and no new runtime dependency. Time zones are `Intl` in Node.
