# Pantalla mobile integration plan

Read-only audit for a native Flutter app (iOS and Android, genuine Flutter UI, no WebView and no Capacitor) that signs into the existing Supabase project and calls the existing Next.js API. The website and the TV player stay as they are.

| | |
| --- | --- |
| Base | `main` at `c64b8cc` (Phase 2C, merge of PR #5). Migrations `0001_init.sql`, `0002_playlists.sql`, `0003_video.sql`. No Phase 2C migration. |
| Production site | `https://pantalla-teamtegrate.vercel.app` |
| Supabase project | `iybmjtkjfxcqupvhoddh` |
| Live check | 2026-10-29. Policies, grants, functions, the `media` bucket, and the realtime publication were read from that project. They match the migrations. This document does not change them. |
| Contract | [docs/api/openapi.yaml](api/openapi.yaml) describes the HTTP API that already exists. |

A Flutter client can ship against this API with no server change. The writes it needs already accept a Supabase user JWT. The ranked list in section 7 is hardening and a few retry fixes, not a new backend.

## How a request works today

The dashboard signs in with the Supabase browser client (`lib/supabase-browser.ts`, `getSupabase`). Every product read and write goes through `/api/*`. `lib/api.ts` `api` and `uploadForm` send `Authorization: Bearer <access_token>`. There is no cookie session and no `middleware.ts`.

`requireAdmin` in `lib/server/auth.ts` reads that Bearer token, calls `db().auth.getUser(token)`, then `ensure_account`. `db()` in `lib/server/supabase.ts` is the service-role client. Routes then filter by `accountId` from that call. Postgres RLS is a second line of defense for a client that talks to PostgREST directly. It is not what the website uses for writes.

The TV is `public/player.html` (ES5, served at `/player` by the rewrite in `next.config.ts`). It never uses Supabase. It holds a display token in `localStorage` under `pantalla_display_token` and sends it as `X-Display-Token`.

One Supabase Auth user owns one row in `accounts` (`owner_user_id` is unique). There is no membership table and no second role. The Flutter user is that same owner.

## 1. What `supabase_flutter` can do with the anon key and a user JWT

Verified on the live project and in `tests/rls/isolation.test.ts`.

Grants for `anon` and `authenticated` were revoked on every `public` table, then `SELECT` was granted back only where the dashboard could need it. RLS is enabled on every `public` table and is not `FORCE`'d, so the service role (which the Next.js server uses) bypasses it. A user JWT does not.

Every `public` function is `SECURITY INVOKER` with `search_path` empty. `EXECUTE` is granted to `service_role` only. `has_function_privilege` for `anon` and `authenticated` is false on all twelve functions. The RLS test calls `player_state`, `player_playlist`, `claim_pairing`, `save_playlist`, and `rate_limit_hit` with a user JWT and expects an error.

`storage.objects` has RLS enabled and no policies. The `media` bucket is private (`public = false`), 52,428,800 bytes, MIME types `image/jpeg`, `image/png`, `image/webp`, `video/mp4`. The RLS test downloads an object with the owner's JWT and expects a failure. A signed URL created by the service role succeeds.

The `supabase_realtime` publication contains no tables.

### Auth (safe, and the only direct write)

GoTrue is not an RLS table. The same email and password the website uses work from `supabase_flutter`:

| Call | Safe with the anon key? |
| --- | --- |
| `signInWithPassword` | Yes. This is what `app/login/page.tsx` does. |
| `signUp` | Yes. The website passes `emailRedirectTo: ${origin}/dashboard`. See section 3. |
| `signOut` | Yes. Settings calls `auth.signOut()` (`app/dashboard/settings/page.tsx`). |
| Session restore, `getSession`, auto-refresh | Yes. The browser client sets `persistSession: true` and `autoRefreshToken: true`. |
| `updateUser` (change password while signed in) | Yes at GoTrue. The website has no screen for it. |
| `resetPasswordForEmail`, magic link, OAuth | GoTrue can do them. The website never calls them. Redirect URLs are not set up for a phone. See section 3. |

The publishable key (`sb_publishable_...`) or the legacy anon key is the key that belongs in the app. Both are public. `SUPABASE_SERVICE_ROLE_KEY` and `PAIRING_CODE_SECRET` stay on the server (`.env.example`, `SETUP.md`).

### Tables

A user JWT may `SELECT` its own rows. There is no `INSERT`, `UPDATE`, or `DELETE` policy on any table, and no write grant. An insert or update from the client affects zero rows (the RLS test asserts the service-role row is unchanged). Flutter must treat "zero rows" as failure. PostgREST often returns an empty array rather than an error for an RLS-filtered write.

`pairing_sessions` and `rate_limits` have RLS and no policies and no grants. The Supabase linter reports `rls_enabled_no_policy` on those two tables. That is intentional. A policy that lets the client read them would expose code hashes and rate-limit keys. Leave the lint.

| Table | Owner `SELECT` | Writes from the app | Notes for a client holding only the user JWT |
| --- | --- | --- | --- |
| `accounts` | Policy `accounts_owner_read`: `owner_user_id = auth.uid()`. All columns. | No | The row does not exist until the first successful `/api/*` call. `requireAdmin` creates it with `ensure_account`. A select right after sign-up, before any API call, is empty. |
| `locations` | Policy `locations_owner_read`, via the owner's account. All columns. | No | `ensure_account` inserts `Main location`. The UI never shows it. `claim_pairing` attaches the oldest location. Flutter can ignore the table. |
| `media` | Policy `media_owner_read`. All columns, including `storage_path` and `thumbnail_path`. | No | Paths are not URLs. The bucket rejects a direct download. Library bytes come from signed URLs on `GET /api/media`. |
| `displays` | Policy `displays_owner_read`. Column `SELECT` only. | No | Granted columns: `id`, `account_id`, `location_id`, `name`, `assigned_media_id`, `assigned_playlist_id`, `content_version`, `status`, `last_seen_at`, `created_at`, `player_error`, `player_error_at`. `token_hash` is not granted. `select=*` fails because PostgREST asks for every column. `tests/rls/isolation.test.ts` expects `select("token_hash")` to error. The API's `connected` flag is `!!token_hash` (`app/api/displays/route.ts`). A direct select cannot compute it. Revoked rows remain; the API hides them with `.eq("status", "active")`. |
| `playlists` | Policy `playlists_owner_read`. All columns. | No | Draft fields (`name`, `transition`, `default_duration_ms`, `updated_at`) and the published snapshot (`published_at`, `published_transition`, `revision`) are both readable. Saving still has to go through `save_playlist`. |
| `playlist_items` | Policy `playlist_items_owner_read`. All columns. | No | `kind` is `draft` or `published`. Both are visible. Replacing them is `save_playlist` / `publish_playlist`. |
| `pairing_sessions` | No grant, no policy. | No | Service role only. Holds `code_hash` and `session_secret_hash`. |
| `rate_limits` | No grant, no policy. | No | Service role only. |

Owner checks on `accounts` use `auth.uid()`. The other owner policies use `account_id in (select id from accounts where owner_user_id = auth.uid())`. `0002` wraps `auth.uid()` in a subselect; `0001` does not. Both are the current user. Neither trusts `user_metadata`.

### Storage

| Operation | User JWT |
| --- | --- |
| `download`, `list`, `upload`, `update`, `remove` | Denied. No storage policy. |
| `createSignedUrl` / `createSignedUploadUrl` | Denied. The server creates them with the service role. |
| `PUT` to a signed upload URL the server just issued | Allowed for that object, until the URL expires. The URL is a capability. The route that mints it is authenticated. |

Object layout, written only by the server:

- Image: `{accountId}/{mediaId}.{jpg|png|webp}` from `POST` in `app/api/media/route.ts`.
- Video: `{accountId}/{mediaId}.mp4` from `POST` in `app/api/media/upload/route.ts`.
- Thumbnail: `{accountId}/{mediaId}-thumb.jpg`, uploaded by `POST` in `app/api/media/upload/complete/route.ts`.

### Realtime

Do not subscribe to `displays`. The publication is empty today. Postgres changes send the row from the WAL. Column grants are a PostgREST rule, not a Realtime rule, so a subscription on `displays` would include `token_hash` for rows RLS lets the user see. The hash is not the bearer token (`player_state` compares `sha256(token)`), and it is still a secret the API never returns. Poll `GET /api/displays` the way the dashboard does (every 10 seconds, `useApi` in `app/dashboard/displays/page.tsx` and the overview).

## 2. What stays on the Next.js server

Anything that mutates data, mints a signed URL, checks bytes, or touches a display token runs in a route handler with the service role. `supabase_flutter` cannot replace these, because the user JWT cannot execute the functions and cannot write the tables.

### Bearer tokens, not cookies

`requireAdmin` accepts a token only from `Authorization`, and only when the value starts with `Bearer `. A missing or rejected token is HTTP 401 `{ "error": "Sign in to continue." }`. Cookies are never read. The website already speaks this way (`authToken` and `api` in `lib/api.ts`). Flutter calls the same paths with the access token from `supabase_flutter`. No new auth middleware is required.

Player routes do not use `requireAdmin`. They are unauthenticated (`POST /api/player/pair`, `POST /api/player/pair/status`) or authenticated with `X-Display-Token` (`GET` and `POST /api/player/state`). The mobile app does not call them.

There is no CORS middleware. `next.config.ts` sets `X-Content-Type-Options`, `Referrer-Policy`, and `X-Frame-Options` only. A native Dart HTTP client does not enforce browser CORS, so the production origin already accepts a Flutter `Authorization` header. A browser on another origin would not. Leave CORS closed. See section 7.

### Route catalog

All of these exist. Shapes, status codes, and error strings are in [docs/api/openapi.yaml](api/openapi.yaml).

| Need | Today | Why it cannot be a direct table write |
| --- | --- | --- |
| Create the account on first use | Any `requireAdmin` route. `GET /api/me` is the smallest. | `ensure_account` is service-role only. It keys off the user id inside the verified JWT, not a body field. |
| List library with URLs and playlist usage | `GET /api/media` | Signed URLs (`createSignedUrls`, 3600s). `usedIn` is computed in `usageByMedia` (`lib/server/media-usage.ts`). Phase 2C added `usedIn`. |
| Upload an image | `POST /api/media` multipart (`file`, `name`) | `checkImage` sniffs magic bytes and dimensions (`lib/server/images.ts`). The server uploads with the service role. Vercel rejects a body over about 4.5 MB, so the phone resizes first (`lib/prepare-image.ts`, output cap 4 MB). |
| Start a video upload | `POST /api/media/upload` `{ sizeBytes }` | `createSignedUploadUrl` needs the service role. Returns `mediaId`, `path`, `token`, `signedUrl`. The website uses `mediaId` and `signedUrl`. |
| Finish a video upload | `POST /api/media/upload/complete` | Downloads the object, runs `inspectMp4` and `enforceVideoLimits` (`lib/mp4.ts`), checks the JPEG thumbnail, writes the thumb, inserts the row. Client-supplied width and duration are a pre-check. The stored row uses the parsed MP4. A retry after the thumb or the row was stored returns the same `{ "id" }` and does not delete the objects. |
| Delete a file | `DELETE /api/media/:id` | `playlistsUsingMedia` returns 409 while any draft or published slide points at it. `delete_media` clears displays, bumps `content_version`, deletes the row, and the route removes the object and the thumb. |
| List screens | `GET /api/displays` | `connected`, `online`, nested media, and playlist thumbnails are computed. `token_hash` is read with the service role and never returned. |
| Rename | `PATCH /api/displays/:id` `{ name }` | Service-role update, active rows in this account only. |
| Assign or clear one image | `PATCH /api/displays/:id` `{ mediaId }` (`null` clears) | `assign_media` checks ownership, refuses `kind = video`, clears `assigned_playlist_id`, increments `content_version`. |
| Disconnect | `DELETE /api/displays/:id` | Sets `status = revoked` and `token_hash = null`. The TV's next poll is 401 and it drops the token. |
| Claim a pairing code | `POST /api/displays/pair` `{ code, name }` | `hashCode` uses `PAIRING_CODE_SECRET` (`lib/server/crypto.ts`). `claim_pairing` locks the pending row and inserts the display. Rate limits: `rate_limit_hit`. |
| List / create playlists | `GET` and `POST /api/playlists` | Create inserts a draft with `default_duration_ms` 10000 and `transition` `none`. `GET` adds `displayNames` and `thumbnailUrl` (first draft slide; a video uses its thumb). |
| Read one playlist | `GET /api/playlists/:id` | Draft items only, plus every active display and whether it is assigned. Signed URLs for slide files and thumbs. |
| Save a draft | `PATCH /api/playlists/:id` | `save_playlist` replaces draft items. It does not touch published items, `published_at`, `revision`, or any display. |
| Publish | `POST /api/playlists/:id/publish` `{ displayIds }` | `publish_playlist` copies the draft onto `kind = published`, assigns those displays, clears `assigned_media_id`, unassigns active displays that had this playlist and were left out, and bumps `content_version` on every display it changes. |
| Delete a playlist | `DELETE /api/playlists/:id` | `delete_playlist` clears the assignment and bumps version, then deletes. Items cascade. |
| Duplicate | No dedicated route | The UI `POST`s a new playlist, then `PATCH`es the draft (`components/playlist-list.tsx`). On `PATCH` failure it `DELETE`s the new row. |

Player routes, for the contract file only. The app must not call them:

| Route | Auth |
| --- | --- |
| `POST /api/player/pair` | None. Per-IP rate limit. Returns `code` and `secret` once. |
| `POST /api/player/pair/status` | Session id plus secret. Returns the display token once, then expires. |
| `GET /api/player/state` | `X-Display-Token`. Heartbeat and playback JSON. |
| `POST /api/player/state` | `X-Display-Token`. `report_player_error`. |

### Server rules a direct client would skip

These are why the API stays in front of the tables.

- Image bytes are identified by magic numbers, not `Content-Type` (`checkImage`). Edges over 7680 or pixel count over 7680×4320 are rejected (`MAX_EDGE`, `MAX_PIXELS` in `lib/server/limits.ts`).
- Video is accepted only as `avc1` or `avc3`, profile 66, 77, or 100, level 10 through 42, audio `mp4a` or none (`inspectMp4`, `allowedProfile`). Size ≤ 50 MB, duration 500 ms through 180000 ms, each edge ≤ 1920 (`enforceVideoLimits`). A failed check deletes the object.
- The thumbnail must be a JPEG (`FF D8 FF`) of at most 200000 bytes (`MAX_THUMB_BYTES`). The server does not decode the video to make one. There is no ffmpeg step.
- `delete_media` raises `media_in_playlist` when a slide still references the file (`0002_playlists.sql`). The route maps that to 409. The message names the playlists (`playlistDeleteMessage`).
- Pairing codes are HMAC-SHA256 with a server secret, not a plain hash (`hashCode`). Six digits would be guessable as a bare hash.
- Display tokens and session secrets are stored as SHA-256 only (`sha256` in `lib/server/crypto.ts`). The raw token is returned to the TV once.
- Account id on every mutation comes from the JWT, not from the body. `save_playlist` and `publish_playlist` also re-check that media and displays belong to that account.

### Retry behavior Flutter should copy

- Video `complete` returns 200 `{ "id" }` when the media row already exists, and 201 when it inserts. Safe to retry after a dropped response once the row exists.
- If `complete` stored the thumbnail and died before the insert, the next call keeps that thumbnail (`upsert` stays false; "already exists" is not a failure) and inserts the row. It does not delete the MP4. Two completes in flight return one 201 and one 200, one row, and both objects. A validation failure still deletes the MP4 and the thumbnail.
- A new call to `POST /api/media/upload` always mints a new `mediaId`. Retry `complete` with the original id while the object is still there. Mint a new URL only when `complete` says the upload did not arrive, or after a validation error (those delete the object).
- Image `POST /api/media` is not idempotent. A retried request creates a second library row.
- `save_playlist` replaces the whole draft. The last successful `PATCH` wins. There is no `If-Match` and no per-slide patch.

## 3. Signing in with the accounts that already exist

Existing users are Supabase Auth users. The Flutter app uses the same project URL and the same anon or publishable key as `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. `signInWithPassword({ email, password })` is the same call as `app/login/page.tsx`. No password migration, no linked IdP, no shadow user table.

After a session exists, call `GET /api/me` once. That runs `ensure_account`, which is what creates `accounts` and `locations` for a brand-new sign-up. The account name is the email local-part, control characters removed, trimmed, at most 80 characters, or `My business` (`requireAdmin`). There is no rename route. Settings only displays `accountName`.

### Session storage and refresh

`supabase_flutter` should persist the session and refresh it, matching `persistSession` and `autoRefreshToken` in `lib/supabase-browser.ts`. Store the session in encrypted platform storage (`flutter_secure_storage` or the SDK's secure-storage adapter). The access token is what `Authorization` carries. Read it from the SDK at request time so a refresh is picked up.

The website, on HTTP 401, signs out and sends the browser to `/login` (`lib/api.ts`). It does not retry. A request that races an expiry can log the user out. Flutter should refresh once and retry that request once, then sign out if it is still 401.

The website and the phone are two GoTrue sessions. Signing out of one does not have to sign out of the other (`signOut` defaults to the local session). Confirm the project's refresh-token reuse interval before assuming a restored backup of the secure store is safe. Reuse detection can revoke the family.

This audit did not read the Auth JWT expiry. The Supabase default is one hour. Confirm it in the Auth settings. The plan does not depend on a specific number as long as the SDK refreshes.

### Email confirmation, reset, and magic links

The login page supports two outcomes. A session means go to the dashboard. No session means "Check your email to confirm your account, then sign in." `SETUP.md` says Confirm email was turned off for the first TV test and may be turned back on. The live database does not store that toggle. Confirm it in the Auth dashboard before building sign-up.

The only redirect the app sets is `${location.origin}/dashboard` on `signUp`. `SETUP.md` documents the Site URL as the Vercel origin and redirect URLs as `http://localhost:3000/dashboard` and `https://YOUR-APP.vercel.app/dashboard`. Production's allowlist was not readable from Postgres.

The website has no reset-password screen, no magic-link screen, and no `/auth/callback` route. Password sign-in of an existing confirmed user needs no redirect change.

When a mobile flow needs a link (confirmation that should open the app, or a reset that does not exist yet):

- Add a redirect URL. Do not replace the Site URL. Replacing it would send website email links at the phone.
- Prefer a universal link or an Android App Link on `https://pantalla-teamtegrate.vercel.app/...` plus the custom scheme only as a fallback. The page or the OS hands the URL to the app. The website's `/dashboard` link can keep confirming email for browser users.
- `supabase_flutter` should use the PKCE flow for those links. Email-and-password sign-in does not go through that redirect.

Until that product decision is made, the mobile sign-up path matches the website: if confirmation is on, the user opens the email, lands on the website, and then signs in on the phone with the password.

The login form requires 8 characters (`minLength={8}`). GoTrue's own minimum is whatever the project settings say. The leaked-password check is off. See section 7.

## 4. Mobile flows

Base URL `https://pantalla-teamtegrate.vercel.app`. Header `Authorization: Bearer <access_token>` on every path in this section. JSON bodies use `Content-Type: application/json`. Error body is `{ "error": "<sentence>" }` with `Cache-Control: no-store`. Signed URLs inside JSON last 3600 seconds. Refetch the list on expiry or on a failed image load. Do not cache the API response itself.

### Media upload

Images and videos are different pipes. The UI queue in `components/uploads.tsx` runs one file at a time and warns before the page is destroyed. A killed app stops the upload. There is no pause/resume protocol.

**Image**

1. Accept JPEG, PNG, or WebP. Reject anything else. Reject a source over 15 MB (`MAX_UPLOAD_BYTES`, also checked in `uploadSizeError`).
2. Resize the way `prepareImage` does: long edge at most 1920, short edge at most 1080, JPEG, quality 0.9 then 0.8 then 0.65, output at most 4 MB. That stays under the Vercel body limit. The server still accepts a valid image up to 15 MB and 7680×4320, but a body over ~4.5 MB never reaches `checkImage`. The client maps HTTP 413 to "That image is too large to upload."
3. `POST /api/media` as `multipart/form-data`: field `file` (the JPEG), field `name` (the original file name). Progress is upload progress on that POST. `uploadForm` in `lib/api.ts` does this with `XMLHttpRequest`.
4. 201 `{ "id" }`. Refetch `GET /api/media`.

**Video**

1. Run the same checks as `prepareVideo` / `inspectMp4` before asking for a URL, so a bad file never touches storage. The server repeats them.
2. `POST /api/media/upload` with `{ "fileName", "sizeBytes" }`. `sizeBytes` must be a finite number from 1 through 52,428,800. 201 returns `mediaId`, `path`, `token`, and `signedUrl`. The route does not pass an expiry. `docs/PHASE_2B_PLAN.md` records the Supabase signed-upload default of 2 hours.
3. `PUT` the file to `signedUrl` the way `uploadToSignedUrl` does: header `x-upsert: false`, multipart body with a `cacheControl` field of `86400` and a file part whose name is empty and whose filename is `video.mp4`. Progress events from that PUT are the bar. Cap the displayed percent at 99 until `complete` returns, matching the helper.
4. Build a JPEG frame on device (the website seeks a `<video>` element and draws a canvas, max edge 480, quality 0.7). Send it as `thumbnailBase64` without the data-URL prefix, or with a `data:image/jpeg;base64,` prefix. The route strips that prefix. The decoded JPEG must be at most 200000 bytes and start with `FF D8 FF`.
5. `POST /api/media/upload/complete` with `mediaId`, `fileName`, `durationMs`, `width`, `height`, `thumbnailBase64`. Integers. The route rejects non-integers. Limits: duration ≤ 180000, each edge ≤ 1920. 201 `{ "id" }`, or 200 `{ "id" }` if the row was already written.
6. On 415 or 413 the server has deleted the object. Show `error` and start over with a new file or a re-export. The expected strings are `mp4ErrorMessage` in `lib/mp4.ts`.

Foreground upload is the path that matches the website. Background transfer is an open question in section 9. The signed URL is not a tus upload, and the PUT is multipart.

**Delete**

`GET /api/media` includes `usedIn: { id, name }[]` (draft or published). If that array is non-empty, do not call `DELETE`. The copy in `components/media-library.tsx` tells the user to remove the slide and publish again. If the UI is stale, `DELETE` returns 409 and the sentence names the playlists. A file that is only assigned to a screen is deleted; those screens go blank and their `content_version` increments.

### Playlists, draft, and publish

A playlist has two copies. `playlist_items.kind = draft` is the editor. `kind = published` is what a TV plays. `save_playlist` rewrites the draft and sets `updated_at`. It does not change a TV. `publish_playlist` is what screens see.

Limits, shared by `lib/server/validate.ts` and the SQL functions:

| Field | Rule |
| --- | --- |
| Name | 1–80 characters after control characters are stripped and the string is trimmed. Longer input is sliced to 80. |
| `defaultDurationMs` | Integer, 1000–600000. Create uses 10000. |
| `transition` | `none` or `fade`. |
| Items | Array, 0–40. Each `{ "mediaId", "durationMs" }`. `durationMs` null means "use the playlist default" at publish. An integer must be 1000–600000. |
| Video slides | The editor forces `durationMs` to null ("Plays until the end"). Send null. Do not send the file's duration as the slide duration. |
| Publish targets | 1–50 display ids, all active and in this account. The draft must contain at least one item. |

`publish_playlist` copies draft rows and stores `coalesce(duration_ms, default_duration_ms)` on the published rows. A video published this way still has a numeric `duration_ms` on the published row (the default). The TV does not use that number as the play length. `public/player.html` advances a video on the `ended` event, and loops a one-item video by seeking to 0. Image slides use `durationMs` as the timer and skip a slide under 1000 ms.

Unpublished-changes in the UI is derived, not a column (`components/playlist-list.tsx`): no `publishedAt` means "Draft"; `updatedAt` more than 1 second after `publishedAt` means "Unpublished changes"; otherwise it is published. `revision` increments only inside `publish_playlist`.

Duplicate is `POST /api/playlists` with `Copy of {name}` sliced to 80, then `PATCH` with the source draft items. It does not publish. If the `PATCH` fails, `DELETE` the new id.

Deleting a playlist unassigns every screen that was playing it and bumps those versions. The screens show "No content assigned" on the next poll.

### Screens

`GET /api/displays` is the list to render. Poll about every 10 seconds while the screen list is visible.

| Field | Meaning |
| --- | --- |
| `connected` | The TV has collected its token. False while the row exists and the TV has not finished pairing. |
| `online` | `connected` is not required by the formula, but a tokenless row has no heartbeat. `online` is `lastSeenAt` within 60000 ms (`ONLINE_MS`). |
| `lastSeenAt` | Last heartbeat, or null. |
| `media` | The single assigned image, with a signed URL. Null when a playlist is assigned or the screen is clear. |
| `playlist` | Assigned playlist id, name, and a signed URL for the first published slide (video uses the thumb). |
| `playerError` | Last note from the TV, or null. The TV sends it with `POST /api/player/state`. At most 180 characters. |

Rename: `PATCH` `{ "name" }`. The route trims and slices to 60. Empty is 400.

Disconnect: `DELETE`. Confirm in the UI. The TV returns to the pairing screen. The row stays in the database as `revoked` and drops off this list.

One image: `PATCH` `{ "mediaId": "<uuid>" }` or `{ "mediaId": null }` to clear. Videos are 400: "Publish a video from a playlist. A single screen assignment has to be an image." The displays UI filters `kind !== "video"` before offering files. The screen updates on the TV's next 10 second poll.

Many screens, one playlist: `POST /api/playlists/:id/publish` with every screen that should play the saved draft. Screens already on that playlist start checked. Unchecking one removes the playlist from that screen and clears it. The dialog in `components/displays-screen.tsx` says this. Publish the saved draft, not unsaved editor fields. The editor itself saves and then publishes.

Assigning a single image clears `assigned_playlist_id`. Publishing a playlist clears `assigned_media_id` on the chosen screens. A screen shows one of those, never both. `player_state` returns the image when `storage_path` is set, and only otherwise loads the playlist (`app/api/player/state/route.ts`).

## 5. Pairing, assignments, and playback stay on the TV

The mobile app never sees a display token, a pairing secret, or `token_hash`. It never writes `localStorage` on a TV. It never calls `/api/player/*`.

The flow that already ships:

1. The TV `POST`s `/api/player/pair`. The server stores `hashCode(code)` and `sha256(secret)` on `pairing_sessions`, status `pending`, TTL `PAIRING_TTL_SECONDS` (600). The response is the only place the raw code and secret exist. Rate limit: 30 creates per IP per hour (`PAIR_CREATE_MAX_PER_IP`).
2. The TV shows the 6 digits and polls `POST /api/player/pair/status` every 3 seconds with `sessionId` and `secret` (`PAIR_MS` in `public/player.html`).
3. The owner types the code and a name. Flutter `POST`s `/api/displays/pair`. The route keeps only digits, requires length 6, and normalizes the name to 1–60 characters. It counts the attempt (10 per user and 30 per IP per 15 minutes) and calls `claim_pairing`. That function locks the pending row (`FOR UPDATE SKIP LOCKED`), inserts the display with no token, and sets the session to `claimed`.
4. The TV's next status poll flips `claimed` to `completed` and sets `token_hash` to the SHA-256 of a new random token. The raw token is in that one response. The TV stores it under `pantalla_display_token`. A second poll is `expired`.
5. Playback is `GET /api/player/state` every 10 seconds (`STATE_MS`) with `X-Display-Token` and `?v=<content_version>`. `player_state` updates `last_seen_at` only when it is null or older than 30 seconds (`HEARTBEAT_SECONDS`). When `v` matches, the body is `{ version, unchanged: true }` and no new signed URL is minted. A playlist URL is refreshed about every 30 minutes (`urlRefreshAt` in the player) while the signature lasts 3600 seconds. The player keeps the previous URL string for an unchanged `mediaId` so a loop does not re-download.
6. Disconnect (`DELETE /api/displays/:id`) nulls `token_hash`. The next state poll is 401. The player clears the token and shows a new code.
7. Publish and single-image assign bump `content_version` in SQL. The following poll, within about 10 seconds, is how a TV changes picture. Draft saves do not bump it.

`connected` becomes true at step 4, not at step 3. The screen list can show a row that is not connected yet. That is the "waiting" state in `docs/PHASE_2C_PLAN.md`.

`player_playlist` returns slides only when the display is active, the token matches, and `assigned_media_id` is null. Media in the slide must belong to the same account as the display.

## 6. Contracts the Flutter team needs

[docs/api/openapi.yaml](api/openapi.yaml) is the HTTP contract: paths, bodies, status codes, and the `error` string. The sections below are the rules that do not fit a single response schema.

### Compatibility

There is no `/api/v1`. The website and `public/player.html` are clients of the paths that exist today.

- Adding a JSON field is compatible. Phase 2C added `usedIn` on media and `displayNames` / `thumbnailUrl` on playlist summaries. Older clients ignore them.
- Removing or renaming a field, or changing a status code the website or the player branches on, is not compatible.
- The player JSON (`unchanged`, `version`, `mediaId`, `url`, `playlist`) is frozen for `public/player.html`. A single assigned image must not grow a `playlist` object. `docs/PHASE_2A_PLAN.md` records that, and `GET` in `app/api/player/state/route.ts` still branches on `storage_path` first.
- Once a store build exists, a breaking change needs a new path. The unversioned path keeps serving the website and the TVs.
- Unknown request headers are ignored. A later `X-Pantalla-Client` header can be added without a server change.

### Enums and checks

| Value | Where |
| --- | --- |
| `displays.status` | `active`, `revoked` |
| `pairing_sessions.status` | `pending`, `claimed`, `completed`, `expired` |
| `playlist_items.kind` | `draft`, `published` |
| `playlists.transition`, `published_transition` | `none`, `fade` (`published_transition` may be null) |
| `media.kind` | `image`, `video`, or null. Null is an image (`coalesce` in `player_playlist`, and `kind === "video"` everywhere else). |
| `media.mime_type` | `image/jpeg`, `image/png`, `image/webp`, `video/mp4` |

Column checks live in the three migration files. `media.duration_ms` is 1–180000 when set. `media.width` and `height` are positive when set. `playlist_items.position` is 0–39. Display names are 1–60. Playlist names are 1–80. `player_error` is at most 180 characters.

### Validation limits (client and server)

| Limit | Value | Source |
| --- | --- | --- |
| Image source size | 15 MB | `MAX_UPLOAD_BYTES` |
| Image prepared body | 4 MB JPEG, edges 1920 and 1080 | `lib/prepare-image.ts` |
| Image server edges | 7680, and 7680×4320 pixels | `MAX_EDGE`, `MAX_PIXELS` |
| Video size | 50 MB | `MAX_VIDEO_BYTES`, bucket `file_size_limit` |
| Video duration | 500 ms–180000 ms | `enforceVideoLimits`, column check is 1–180000 |
| Video edges | 2–1920 each | `MAX_VIDEO_EDGE` |
| Video codec | H.264 Baseline / Main / High, level 1.0–4.2, AAC or silent | `allowedProfile`, `parseMoov` |
| Thumbnail | JPEG ≤ 200000 bytes | `decodeThumb` |
| Playlist length | 40 slides | `PLAYLIST_MAX_ITEMS`, `position < 40` |
| Slide and default duration | 1000–600000 ms | `PLAYLIST_MIN_DURATION_MS`, `PLAYLIST_MAX_DURATION_MS` |
| Publish fan-out | 1–50 displays | `publish_playlist` |
| Pairing TTL | 600 s | `PAIRING_TTL_SECONDS` |
| Signed read URL | 3600 s | `createSignedUrls` in the media, display, and playlist routes; `URL_TTL_SECONDS` in the player route |
| Online window | 60000 ms | `ONLINE_MS` |
| Heartbeat write interval | 30 s | `player_state`, `HEARTBEAT_SECONDS` |
| Player poll | 10 s | `STATE_MS` in `public/player.html` |
| Dashboard screen poll | 10 s | `useApi(..., 10_000)` |

`online` is true when `lastSeenAt` is non-null and `now - lastSeenAt < 60_000`. A TV that polls every 10 seconds and whose heartbeat is written at most every 30 seconds stays online. A TV that stops polling drops off within 60 seconds of the last write, which can be up to 30 seconds after the last poll that actually wrote. There is no separate presence service.

### Realtime

Not used. The publication is empty. Use the 10 second display poll. See section 1 before turning Realtime on.

### Schemas

The SQL in `supabase/migrations/` is the schema. The live project matches it. Flutter does not need a generated Dart client for writes. If it reads PostgREST at all, the column lists in section 1 are the allowlist, and `GET /api/*` remains the source of signed URLs and `connected`.

## 7. Pre-mobile changes, ranked

None of these are required for a first build that signs in and calls the existing Bearer routes. Each one is backward compatible with the website: the website keeps its paths, its session, and its player.

| Rank | Change | Effort | Risk to the website | Why it is on the list |
| --- | --- | --- | --- | --- |
| 1 | Turn on leaked-password protection in the Supabase Auth dashboard. Set the GoTrue minimum length to 8 so it matches `app/login/page.tsx`. | Dashboard toggles. No deploy. | Existing passwords keep working. New sign-ups and password changes that fail the HaveIBeenPwned check, or that are shorter than 8, are rejected. The website already shows GoTrue's error string on the login form. | The security advisor on `iybmjtkjfxcqupvhoddh` reports `auth_leaked_password_protection` (WARN): protection is disabled. [Remediation](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). |
| 2 | Make video `complete` safe to retry, and give that route enough time to re-download a 50 MB object. | Done in `app/api/media/upload/complete/route.ts`. An existing thumbnail is kept and the row is inserted. A duplicate insert (`23505`) returns 200 `{ "id" }` and does not delete the objects. `maxDuration` is 300, the Hobby Fluid ceiling (also the default). No migration. | The website's success path is unchanged (201 `{ "id" }` on the first insert, and `api()` accepts any 2xx). A retry that used to delete a good upload now succeeds. | A thumb uploaded just before a timeout used to be removed on the next `complete`, along with the MP4. Mobile networks hit that more often than the desktop dashboard. |
| 3 | Confirm the Auth URL allowlist. Add mobile redirect URLs only when reset or in-app confirmation is in scope. Do not change the Site URL. | Dashboard. No deploy. | An added redirect URL does not affect email links that already target `/dashboard`. Changing the Site URL would. | Password sign-in needs nothing. A reset or a magic link pointed at a scheme that is not listed fails in GoTrue. |
| 4 | Rate-limit the authenticated write routes with the existing `rate_limit_hit` helper (`allow` in `lib/server/http.ts`). Pairing is already limited. Uploads, playlist saves, and publish are not. | One check per route, keyed by `admin.userId`. Limits must sit above a sequential library import (the web queue uploads one file at a time, and a user can enqueue many). | A limit that is too low returns 429 to the website as well as the phone. Start high and log before tightening. | A phone that retries a 50 MB PUT in a loop can fill the bucket. The bucket cap is 50 MB per object, not per account. |
| 5 | Delete orphan objects: an `{accountId}/{uuid}.mp4` or `-thumb.jpg` with no `media` row, older than the signed-upload lifetime (2 hours plus a margin). | Extend `cleanup_stale` or a scheduled call that only the service role runs. | A window shorter than an in-flight upload would delete a file the user is still sending. Use a window longer than 2 hours. | Abandoned signed uploads are invisible in the library and still consume the storage quota. `docs/PHASE_2B_PLAN.md` notes that deleting a user does not delete objects. Account deletion is not a product feature. This job is about unfinished uploads. |
| 6 | Keep writes on the API. Do not add insert, update, or delete policies, and do not grant `EXECUTE` on the `public` functions to `authenticated`. | No code. Review rule. | A write policy would let a modified client skip codec checks, the pairing HMAC, and `content_version` bumps. The website would keep working, and the data rules would not. | The useful mobile path is already Bearer-on-`/api`. A storage or table policy is not a shortcut. It is a second writer. |
| 7 | Leave Realtime off for `displays`. If a live screen list is wanted later, publish a `security_invoker` view that omits `token_hash`, and subscribe to the view. | A later migration. Not this round. | Turning the table on without the view leaks `token_hash` to any client that can select the row. | Section 1. |
| 8 | Optional image signed-upload route, parallel to `POST /api/media`. | A new route pair, modeled on the video routes, with `checkImage` on the stored bytes before the row is inserted. Keep the multipart route. | None, if the old route stays. | Only if v1 must upload images in the background or send more than ~4.5 MB. The resized JPEG path already matches the website and reports progress. |
| 9 | Optional `/api/v1` aliases that call the same handlers. | Rewrites or re-exports. The unversioned paths stay. | None if the handlers are shared. | Useful once a store build must be pinned. Additive JSON on the current paths is enough until the first breaking change. |

### Security notes

- The Flutter binary gets the project URL and the anon or publishable key. It does not get `SUPABASE_SERVICE_ROLE_KEY` or `PAIRING_CODE_SECRET`. Those two bypass the product rules (RLS bypass for the service role; code HMAC for the pairing secret). `SETUP.md` already forbids `NEXT_PUBLIC_` on either.
- `requireAdmin` is the authorization check. RLS is what stops a curious client that talks to PostgREST anyway. Both have to stay. The service role is not `FORCE` RLS, which is what makes the current server functions work. Do not point the app at a key with `bypassrls`.
- Rate limits that exist today are pairing only: 30 code creates per IP per hour, 10 claim attempts per user per 15 minutes, 30 claim attempts per IP per 15 minutes. `clientIp` prefers `x-real-ip`, which Vercel sets, and otherwise the first `x-forwarded-for` hop (`lib/server/http.ts`).
- Leaked-password protection is off on the live project (advisor WARN, 2026-10-29).
- CORS is a browser rule. The native client does not need `Access-Control-Allow-Origin`. Do not add `*` on `/api/*`. Supabase's own APIs already answer browser preflights for the website. Dart ignores them.
- Versioning policy is in section 6. Player responses stay stable. Dashboard responses grow by new fields.
- Signed upload URLs and signed read URLs are bearer capabilities. Do not log them. Read URLs last one hour. Upload URLs last about two hours and can be used without the user JWT.
- `select=*` on `displays` is a footgun (it requests `token_hash` and fails, or would succeed if a future grant added the column). List columns, or call `GET /api/displays`.
- `media.storage_path` is readable and still not a download. Do not build a public object URL from it.
- The `rls_enabled_no_policy` lint on `pairing_sessions` and `rate_limits` is the locked-down state. [Linter reference](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy). Adding a policy to clear the lint would open those tables.
- `tests/rls/isolation.test.ts` is the regression suite for "a user JWT cannot read another account, cannot read `token_hash`, cannot write, cannot execute functions, and cannot download storage." Any later grant change has to keep that file green.

## Phased roadmap

The website keeps serving production through every phase. Each phase uses the routes above. No phase rewrites pairing or the player.

**Phase 0 — ops, no app binary.** Land this document. Do items 1 and 3 from section 7 (leaked passwords, confirm the redirect list without editing the Site URL). Item 2 (retry-safe video complete) is in `app/api/media/upload/complete/route.ts`.

**Phase 1 — sign in and read.** `supabase_flutter` email/password, secure session storage, `GET /api/me`, then `GET /api/media`, `GET /api/displays` on a 10 second poll, `GET /api/playlists`. Empty and error states match the `error` string. No uploads. This proves the Bearer path against production or a preview that points at the same Supabase project.

**Phase 2 — images and screens.** Prepared-JPEG `POST /api/media` with progress, delete with the `usedIn` / 409 rule, rename, disconnect, pair by the 6-digit code, assign or clear one image. The TV used for the test is a real `/player` page. The phone never holds its token.

**Phase 3 — video, foreground.** Local MP4 check, signed URL, multipart PUT, on-device JPEG thumb, `complete`, progress. Retry `complete` with the same `mediaId`. Item 2 from section 7 is in the complete route.

**Phase 4 — playlists.** Create, edit draft, save, the unpublished-changes rule, publish to one or many screens, duplicate via POST+PATCH, delete. Video slides send `durationMs: null`. Publish copy matches the displays dialog: unchecked screens lose this playlist.

**Phase 5 — store hardening.** Items 4 and 5 from section 7 (write rate limits, orphan cleanup). Background uploads only if the open question is answered yes. Password reset only if the product wants it, with an added redirect URL and a PKCE handler. Optional `/api/v1` when the first breaking change is actually needed.

## Open questions for the Flutter team

1. Confirm email, JWT expiry, minimum password length, and refresh-token reuse interval in the Auth dashboard. This audit could see the leaked-password advisor and could not see those toggles.
2. Which key is in production, the legacy anon key or `sb_publishable_...`? `supabase_flutter` has to accept that format. `SETUP.md` says both work with `createClient`.
3. Is password reset in v1? The website has no flow. Existing users can sign in without it. Building it means a new redirect URL and a decision about whether the link opens the app or the website.
4. Are v1 video uploads foreground-only? The current signed URL is a 2-hour multipart PUT, not tus. Background `URLSession` / WorkManager support for that body shape is the constraint. Item 8 in section 7 (a raw-body image URL, and a similar video variant) is the server change if the OS cannot send the multipart the website sends.
5. Conflict policy when the website and the phone save the same draft: last `PATCH` wins and replaces every slide. Is that acceptable, or do you want a `revision` check later? `revision` today counts publishes, not draft saves.
6. Staff accounts are a different product. The schema is one owner per account. The mobile app should not invent a second user on the same account.
7. Previewing videos in the phone spends Supabase egress, the same as a TV download. `docs/PHASE_2B_PLAN.md` is the cost note. Pin a signed URL to a `mediaId` until it fails, the way the player does, instead of refetching the list on a timer while a video is on screen.
8. Minimum OS versions have to decode H.264 for the thumbnail and, if you preview video, play it. The TV constraints (Baseline/Main/High, level ≤ 4.2, AAC) are the library rules even when the phone could play HEVC. The phone must not upload what the TV cannot play.
9. Associated domains for `pantalla-teamtegrate.vercel.app` if you add universal links. That is an entitlements and `assetlinks.json` change, later, and it must not take over `/player` or `/dashboard`.
10. Whether internal builds hit production or a Vercel preview. Either way the website origin stays up. Preview deployments need the Supabase redirect URL only if they perform sign-up from a browser. The player URL embedded in Settings is `location.origin/player` (`app/dashboard/settings/page.tsx`). A phone settings screen should show the production player URL, not a preview URL, when the TV is a production device.
