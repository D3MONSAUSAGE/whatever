# Hardening 1

Additive changes on top of Phase 2D (`b143ce6`). Auth, pairing, `public/player.html`, and existing success fields are unchanged. A body the route already rejects does not consume a rate limit.

## Clear a screen's location

`PATCH /api/displays/:id` with `{ "locationId": null }` sets `location_id` to null. The screen then uses UTC, the same fallback `loadRulesForDisplay` already uses when a screen has no location. `{ "locationId": "<uuid>" }` still moves the screen. A body that contains `mediaId` still assigns or clears an image and ignores `name` and `locationId`. The response is still `{ "ok": true }`.

## Rate limits

Fixed window via the existing `rate_limit_hit` helper (`allow` / `enforceLimit` in `lib/server/http.ts`). Thresholds live in `lib/server/limits.ts`. Each route has its own counter, keyed by `admin.userId`, so a video retry cannot spend the image budget. A full window returns **429** `{ "error": "<message>" }` and `Retry-After` (seconds left in that window).

| Route | Key | Limit |
| --- | --- | --- |
| `POST /api/media` | `upload-image:{userId}` | 60 / 15 min, after the file passes the image check |
| `POST /api/media/upload` | `upload-init:{userId}` | 60 / 15 min, after `sizeBytes` is accepted |
| `POST /api/media/upload/complete` | `upload-complete:{userId}` | 60 / 15 min, after `mediaId` and the dimension pre-check |
| `POST /api/playlists/:id/publish` | `publish:{userId}` | 60 / 15 min, after `displayIds` is 1–50 uuids |
| `POST /api/playlists/:id/snapshot` | `snapshot:{userId}` | 60 / 15 min, after the playlist id is a uuid |
| `POST /api/locations` | `create-location:{userId}` | 80 / 15 min (account cap is 50) |
| `POST /api/screen-groups` | `create-group:{userId}` | 150 / 15 min (account cap is 100) |
| `POST /api/schedules` | `create-schedule:{userId}` | 240 / 15 min (account cap is 200) |

Create limits sit above the account caps, so filling locations, groups, or schedules does not 429. Pairing limits are unchanged.

## Orphaned uploads

`GET /api/cron/orphan-uploads` deletes Storage objects in the `media` bucket that have no matching `media` row and are older than 24 hours (`ORPHAN_MIN_AGE_MS`). That is a signed upload that never completed, and a thumbnail left without a row. A path equal to any row's `storage_path` or `thumbnail_path` is never deleted. A missing or unparseable `created_at` is kept. If listing or reading `media` fails, nothing is deleted.

`?dryRun=1` or `?dryRun=true` logs `orphan-uploads dry-run: would delete <path>` and deletes nothing.

Vercel Cron (Hobby, once a day) is `0 7 * * *` in `vercel.json`. The platform sends `Authorization: Bearer <CRON_SECRET>`.

## Overview

`GET /api/overview` returns counts for the caller's account:

```json
{ "screens": 0, "online": 0, "offline": 0, "media": 0, "playlists": 0, "activeSchedules": 0 }
```

`screens` is active displays (revoked screens are omitted), the same set as `GET /api/displays`. `online` uses the same 60 second `last_seen_at` window. `offline` is `screens - online`, including screens that have never polled. `activeSchedules` counts enabled rules only. `playlists` counts every playlist.

## Env vars

| Name | Required | Notes |
| --- | --- | --- |
| `CRON_SECRET` | Only for the cleanup job | Server only. `openssl rand -hex 32`. If unset, the cron route returns **503** `{ "error": "Cleanup isn't configured." }` and deletes nothing. |

No other new env var. `CRON_SECRET` is also listed in `.env.example` and `SETUP.md`.

## Mobile API changes

- `GET /api/overview` with the same `Authorization: Bearer <Supabase access token>` as the other admin routes. Use it for the home counts instead of downloading every screen, file, and playlist. `online + offline` equals `screens`.
- `PATCH /api/displays/:id` accepts `{ "locationId": null }` to detach a screen from its location. The screen then follows UTC. Sending a location uuid is unchanged. Do not send `mediaId` in that request; `mediaId` still wins and ignores location.
- Uploads, playlist publish, playlist snapshot, and creates of locations, groups, and schedules can return **429** with `Retry-After`. Wait that many seconds, then retry the same request. Success bodies are unchanged. A 400 or 415 for a bad body does not use up the budget.
- Image upload, video init, and video complete are limited separately at 60 per 15 minutes, so a library import and a video retry do not share one bucket. Publish and snapshot are separate too.
- Pairing routes, player routes, and `public/player.html` are unchanged. Do not call `GET /api/cron/orphan-uploads` and do not ship `CRON_SECRET` in the app.
