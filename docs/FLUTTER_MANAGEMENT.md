# Flutter management contract

This is the website and backend the phone app already uses as a controller. It is not a TV renderer. The television is `public/player.html`, served at `/player`. Flutter shows and copies that address. It does not call `/api/player/*`, and it does not paint boards, slides, or video.

Auth on every management route below is `Authorization: Bearer <Supabase access token>` (`lib/server/auth.ts` `requireAdmin`). A missing or rejected token is 401. The token's user is resolved to one account. Requests do not accept an account id.

Layout Studio is not part of this contract. It is experimental, flag-off, and listed at the end so it is not mistaken for a production route.

## Account

| Call | Behavior | Source |
| --- | --- | --- |
| `GET /api/me` | `{ email, accountName }` | `app/api/me/route.ts` |
| `PATCH /api/me` | `{ accountName }` renames the business, at most 80 characters | same |
| `GET /api/onboarding` | Setup progress derived from real data | `app/api/onboarding/route.ts` |
| `POST /api/onboarding` | `{ dismissed: boolean }` and/or `{ confirmBusiness: true }` | same |
| `GET /api/locations` | Locations for this account | `app/api/locations/route.ts` |
| `POST /api/locations` | Create one | same |
| `PATCH /api/locations/:id` | Rename or timezone | `app/api/locations/[id]/route.ts` |
| `DELETE /api/locations/:id` | Delete one | same |

## Screens, pairing, remote

Pairing is two steps. The TV creates a code. The phone submits that code. The phone never receives the display token.

| Call | Behavior | Source |
| --- | --- | --- |
| `POST /api/displays/pair` | Body `{ code, name }`. Claims the code for this account. 429 after too many tries. When billing enforcement is on, the database can reject with `screen_limit` or `subscription_inactive` | `app/api/displays/pair/route.ts` |
| `GET /api/displays` | Screens, assignment, online state, `playerError` | `app/api/displays/route.ts` |
| `PATCH /api/displays/:id` | `{ name }`, `{ locationId }` (null clears), or `{ mediaId }` for one image. A video is not assigned here | `app/api/displays/[id]/route.ts` |
| `DELETE /api/displays/:id` | Disconnect the screen | same |
| `GET /api/remote/screens` | Screens that can be controlled. `playback.slide` and `playback.count` are playlist slides. `index` and `total` are the same slide position. They are never zones | `lib/server/remote.ts` |
| `POST /api/remote/screens/:id/command` | `{ command: "next" \| "prev" }` | `app/api/remote/screens/[id]/command/route.ts` |
| `POST /api/remote/screens/:id/playback-mode` | `{ playbackMode: "auto" \| "manual" }` | `app/api/remote/screens/[id]/playback-mode/route.ts` |
| `GET /api/screen-groups` | Groups | `app/api/screen-groups/route.ts` |
| `POST /api/screen-groups` | Create | same |
| `PATCH /api/screen-groups/:id` | Update | `app/api/screen-groups/[id]/route.ts` |
| `DELETE /api/screen-groups/:id` | Delete | same |

`POST /api/player/pair` and `POST /api/player/pair/status` are the TV's unauthenticated code exchange. The phone does not call them.

### Screen row contract (build +10 and later)

`GET /api/displays` returns an array. `GET /api/displays/:id` returns that same object for one screen. One row with a wrong type fails the app's whole list, so these names and types stay:

| Field | Type |
| --- | --- |
| `id` | non-empty string |
| `name` | string |
| `connected` | boolean |
| `online` | boolean, computed on the server |
| `lastSeenAt` | ISO string or null |
| `playerError` | string or null |
| `media` | `{ id, fileName, url }` or null. `url` is a signed thumbnail or still, or null |
| `playlist` | `{ id, name, url }` or null. `url` is a signed thumbnail of the first published slide, or null |
| `location` | `{ id, name }` (timezone may also be present) or null |
| `currentSchedule` | object or null |
| `activeSchedules` | array |
| `entitled` | boolean. Anything other than `false` means the screen may play |

Additive fields. Old app builds ignore them. They are never a replacement for `connected` or `online`.

| Field | Type | Meaning |
| --- | --- | --- |
| `reportedState` | `assigned` \| `acknowledged` \| `playing` \| `pending` \| `unknown` | `assigned` until the TV accepts the version, then `acknowledged`, then `playing`. No assignment stays `unknown` |
| `contentVersion` | number or null | The version the dashboard has assigned |
| `acknowledgedAt` | ISO string or null | When the TV reported that version. Null until a player reports it |
| `playingAt` | ISO string or null | When the TV reported that version on screen. Null until a player reports it |
| `nextChange` | `{ at, label, kind }` or null | Next time the winner changes. `kind` is `schedule` or `assignment`. Same object as `GET /api/displays/:id/timeline` |
| `boardPreviewUrl` | string or null | Signed still of the layout board on this screen's playlist. Save Draft redraws this still without moving screens. Publish still assigns the screen. Does not replace `media.url` or `playlist.url` |

`GET /api/overview` stays `{ screens, online, offline, media, playlists, activeSchedules }`, all numbers.

`POST /api/displays/pair` stays `{ code, name }` and still returns `{ id }`. It may also return `nameWarning` and `suggestedName` when another screen already uses that name, ignoring case and extra spaces. Pairing is never refused for a duplicate name. `PATCH /api/displays/:id` with `{ name }` may return the same warning. `DELETE /api/displays/:id` is unchanged. `GET /api/screen-groups` stays `{ id, name, displayIds, updatedAt }`.

After a publish, `GET /api/player/state` adds `catchupMs: 2500` and `catchupForMs: 120000` until the TV reports the version, and for two minutes after that. `pollMs` stays the normal interval. The player posts `{ acknowledged: { version } }` when it accepts the version and `{ playing: { version } }` when the picture is on screen.

### App additions

| Call | Body / response |
| --- | --- |
| `GET /api/layout-studio/boards` | `{ boards: [{ id, name, template, thumbnailUrl }] }`. 404 when Layout Studio is off. Thumbnail is a signed still |
| `POST /api/layout-studio/assign` | `{ menuId, displayId }`. Points that one screen at the board's playlist. Other screens stay. The board must already be published. Republishing the board still uses `menu_swap_media` |
| `GET /api/displays/:id/timeline` | `{ displayId, timezone, nextChange }` |
| `POST /api/displays/publish` | `{ playlistId, displayIds or groupId, commit, replace }`. The preview includes `willBeCleared`: screens already on this playlist that were not selected. They keep it unless `replace` is true. `commit: true` still calls `publish_playlist`, passing those screens as well when `replace` is false so the old function does not drop them. `POST /api/playlists/:id/publish` is unchanged and can still clear |
| `GET /api/config` | Public. `{ appUrl, pairUrl, tvUrl }` on `https://pekkotv.com`. No Vercel hostname |

The studio deep link is `/dashboard/media/layout-studio?screen=<id>`. A signed-out visit goes to `/login?next=` that same path, then back to it.

## Uploads and media

Bytes are private. Clients receive a short-lived signed URL, not a public object path. Image bytes go through the function. Video and presentation bytes go to Storage with a signed upload URL, then a complete call checks the file.

| Call | Behavior | Source |
| --- | --- | --- |
| `GET /api/media` | This account's library. Optional list query | `app/api/media/route.ts` |
| `POST /api/media` | Multipart image. JPG, PNG, or WebP. Returns `{ id }` | same |
| `DELETE /api/media/:id` | Delete if this account owns it and it is not in use | `app/api/media/[id]/route.ts` |
| `POST /api/media/upload` | `{ sizeBytes }` starts an MP4 upload. Returns `{ mediaId, path, token, signedUrl }` | `app/api/media/upload/route.ts` |
| `POST /api/media/upload/complete` | `{ mediaId, durationMs, width, height }` after the bytes are stored | `app/api/media/upload/complete/route.ts` |

Storage paths are `${accountId}/...` (`lib/server/supabase.ts` bucket `media`). A signed URL is the reference a client may fetch. It expires.

## Playlists, assignment, scheduling

| Call | Behavior | Source |
| --- | --- | --- |
| `GET /api/playlists` | Summaries | `app/api/playlists/route.ts` |
| `POST /api/playlists` | Create | same |
| `GET /api/playlists/:id` | Draft items and assigned screens | `app/api/playlists/[id]/route.ts` |
| `PATCH /api/playlists/:id` | Save the draft | same |
| `DELETE /api/playlists/:id` | Delete | same |
| `POST /api/playlists/:id/publish` | Publish the draft onto screens | `app/api/playlists/[id]/publish/route.ts` |
| `POST /api/playlists/:id/snapshot` | Snapshot | `app/api/playlists/[id]/snapshot/route.ts` |
| `GET /api/schedules` | Windows. Response uses `playlistId`, `displayId` or `groupId`, `weekdays`, `startTime`, `endTime`, `startsOn`, `endsOn`, `priority`, `enabled` | `app/api/schedules/route.ts` |
| `POST /api/schedules` | Same fields. One of display or group, not both | `lib/server/schedule.ts` `parseScheduleBody` |
| `PATCH /api/schedules/:id` | Update | `app/api/schedules/[id]/route.ts` |
| `DELETE /api/schedules/:id` | Delete | same |
| `GET /api/schedules/preview` | What a screen will play | `app/api/schedules/preview/route.ts` |
| `POST /api/schedules/day-parts` | Create a set of day parts | `app/api/schedules/day-parts/route.ts` |

A playlist reaches a screen through `POST /api/playlists/:id/publish`. `PATCH /api/displays/:id` assigns one image, not a video. The phone does not expand a playlist into slides.

## Menus and presentations

Menus are still images. The server renders a PNG and stores a normal media row. Limits are 4 sections, 12 items in a section, 24 items total (`lib/menu-templates.ts`).

| Call | Behavior | Source |
| --- | --- | --- |
| `GET /api/menus` | This account's menus | `app/api/menus/route.ts` |
| `POST /api/menus` | Render, create a playlist, optional screen assignment | same |
| `GET /api/menus/:id` | One menu | `app/api/menus/[id]/route.ts` |
| `PATCH /api/menus/:id` | Re-render and swap the image | same |
| `DELETE /api/menus/:id` | Delete | same |
| `POST /api/menus/preview` | Preview PNG, not saved | `app/api/menus/preview/route.ts` |
| `GET /api/brand` | Brand colors and logo | `app/api/brand/route.ts` |
| `PUT /api/brand` | Save the brand | same |
| `POST /api/brand/apply` | Re-render menus that use the brand | `app/api/brand/apply/route.ts` |
| `POST /api/media/presentation` | `{ fileName, sizeBytes }` signed upload for pptx or PDF | `app/api/media/presentation/route.ts` |
| `POST /api/media/presentation/complete` | Finish the upload | `app/api/media/presentation/complete/route.ts` |
| `GET /api/media/presentation/:id` | Group detail and slides | `app/api/media/presentation/[id]/route.ts` |
| `PATCH /api/media/presentation/:id` | Name or per-slide duration | same |
| `POST /api/media/presentation/:id/playlist` | Add the group to a playlist as one item | `app/api/media/presentation/[id]/playlist/route.ts` |

The player receives expanded image slides. `groupIndex` and `groupCount` are slide counters inside that group. See `docs/PRESENTATION_GROUPS.md`.

## Billing status, read only

`GET /api/entitlements` is the status read (`lib/server/entitlements.ts` `toResponse`). Fields include `state`, `plan`, `plan_name`, `screen_limit`, `active_screens`, `total_screens`, `can_add_screen`, `playback_allowed`, `trial`, `subscription`, `grace_ends_at`, `suspend_at`, `warning`, `enforced`, `server_time`. `enforced` is true only when `BILLING_ENFORCE` is exactly `1`. A dashboard read does not start the existing-customer clock.

`GET /api/billing/checkout` returns `{ available }` and no secrets. `POST /api/billing/checkout` starts a Stripe session for the website. `POST /api/billing/webhook` is Stripe's. Neither is a status read.

`GET /api/entitlements/active-screens` and `POST /api/entitlements/active-screens` choose which screens stay on when a plan is over its limit. That writes. A status display does not need it.

## Deletion

`GET /api/account/deletion` returns `{ enabled, delayDays, request }`. `enabled` is true only when `ACCOUNT_DELETION` is exactly `1`. The delay is 7 days (`lib/server/account-deletion.ts`). `POST` with `{ confirm: "DELETE", password }` schedules deletion. `DELETE` cancels a pending request. While the flag is off, `POST` returns 503 `disabled`. Only the account owner can call these.

## Errors and offline

The TV reports a playback error with `POST /api/player/state` and header `X-Display-Token`. The phone does not send that. `GET /api/displays` returns `playerError` for the owner.

Offline playback is inside the TV page: Cache Storage `seemple-media-v1`, last saved playlist, images only (`public/player.html` `playSaved`, `public/player-sw.js`). There is no management API for an offline pack. A phone that cannot reach the API shows its own network error. It does not cache the screen's media as a second player.

## Stable production and experimental Studio

Production behavior is the table above. These flags are off unless the value is exactly `1`:

| Flag | Effect when not exactly `1` | Source |
| --- | --- | --- |
| `BILLING_ENFORCE` | Entitlement reads still work. Screens are not paused for billing | `lib/server/entitlements.ts` |
| `BILLING_REMINDERS` | The reminder job sends nothing | `app/api/cron/billing-reminders/route.ts` |
| `ACCOUNT_DELETION` | Status can be read. Scheduling deletion returns 503 | `lib/server/account-deletion.ts` |
| `LAYOUT_STUDIO` | No composition on the player. `GET` and `POST /api/layout-studio` return 404 before a database call | `lib/layout-studio.ts`, `app/api/layout-studio/route.ts` |

Experimental, not a phone feature:

| Piece | What it is | Source |
| --- | --- | --- |
| `GET /api/layout-studio` | Signed-in boards and library. 404 while the flag is off | `app/api/layout-studio/route.ts` |
| `POST /api/layout-studio` | `{ mode: "draft" \| "publish", menuId, name, document }`. Draft does not move screens. Publish swaps a PNG through `menu_swap_media` | `lib/server/layout-boards.ts` |
| `composition` on a player item | One optional video box. Absent means the PNG only. The phone does not read or render it | `lib/server/layout-player.ts` |
| `/layout-studio` | Browser preview. Production returns 404 | `lib/layout-studio.ts` `layoutStudioPreviewOpen` |

No new database table is required for Studio. A board is `menus.content` with `layoutVersion: 1`. The rendered file is a normal `media` row. `menus.template` stays `classic`, `fresh`, or `bold`.

## Isolated backend for a second tester

What exists, and what it cannot do:

- This repository's tests create a local Postgres database and drop it. It listens on the machine's peer socket only. It is not reachable from another person, and it is not Supabase Auth.
- The Vercel preview of this branch serves `/layout-studio` and returns 404 for every other path, including `/api`. It shares the production Supabase project, so it must not be used as a writable QA backend.
- No disposable hosted organization is provisioned here. Creating a Supabase project, a Stripe account, or a Vercel project would be new spend and a new credential. That was not done.
- A second person can review source and the public layout preview. They cannot sign in to a private copy of auth, storage, and billing without a separate project that does not use production keys. This document does not include a URL, a key, or a test user.
