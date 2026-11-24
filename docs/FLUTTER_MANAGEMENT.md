# Flutter management contract

This is the website and backend the phone app already uses as a controller. It is not a TV renderer. The television is `public/player.html`, served at `/player`. Flutter shows and copies that address. It does not call `/api/player/*`, and it does not paint boards, slides, or video.

Auth on every management route below is `Authorization: Bearer <Supabase access token>` (`lib/server/auth.ts` `requireAdmin`). A missing or rejected token is 401. The token's user is resolved to one account. Requests do not accept an account id.

**Status (updated 2026-11-20).** The menu designer catalog, preview and switch routes for Flutter parity are in **Menu designer API** below. The web menu designer is live for every customer: `LAYOUT_STUDIO=1` in production, and `MENU_TEMPLATES` / `UNIFIED_MENU_EDITOR` default to everyone (PR #153). Most new boards are therefore web-designer boards (`content.layoutVersion === 1`), which the classic menu routes refuse to edit (409). Create and edit those boards with `POST /api/layout-studio` (the phone has done this since Android +17). Read **Menu boards** below before touching menus. Changes the app must handle since Android +14 are listed in **Changes since +14**.

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
| `DELETE /api/displays/:id` | Remove the screen. No body. Bearer session. `{ ok: true }`. Revokes the device token, drops this screen's group membership, and leaves playlists, media, menus, and schedules | same |
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
| `GET /api/layout-studio/boards` | `{ boards: [{ id, name, template, thumbnailUrl }] }`. Live in production (404 only if `LAYOUT_STUDIO` is turned off). Thumbnail is a signed still |
| `POST /api/layout-studio/assign` | `{ menuId, displayId }`. Points that one screen at the board's playlist. Other screens stay. The board must already be published. Republishing the board still uses `menu_swap_media` |
| `GET /api/displays/:id/timeline` | `{ displayId, timezone, nextChange }` |
| `POST /api/displays/publish` | `{ playlistId, displayIds or groupId, commit, replace }`. The preview includes `willBeCleared`: screens already on this playlist that were not selected. They keep it unless `replace` is true. `commit: true` still calls `publish_playlist`, passing those screens as well when `replace` is false so the old function does not drop them. **This is the safe way to add screens.** `POST /api/playlists/:id/publish` is exact-set and clears (see **Screen assignment semantics**) |
| `GET /api/config` | Public. `{ appUrl, pairUrl, tvUrl }` on `https://pekkotv.com`. No Vercel hostname |

The studio deep link is `/dashboard/media/layout-studio?screen=<id>`. A signed-out visit goes to `/login?next=` that same path, then back to it.

## Uploads and media

Bytes are private. Clients receive a short-lived signed URL, not a public object path. Image bytes go through the function. Video and presentation bytes go to Storage with a signed upload URL, then a complete call checks the file.

| Call | Behavior | Source |
| --- | --- | --- |
| `GET /api/media` | This account's library. Optional list query | `app/api/media/route.ts` |
| `POST /api/media` | Multipart image. JPG, PNG, or WebP bytes only (magic-byte sniff). Returns `{ id }`. HEIC must be converted by the client first | same |
| `DELETE /api/media/:id` | Delete if this account owns it and nothing uses it. **409** when a playlist uses it (`error` names the playlists), or (PR #158) **409 `code: "media_in_use"`** when a menu board (item photo, classic side photo, layout image/video/logo), a promotion, or the Brand Kit logo uses it. `error` names them and is localized. Show it as-is | `app/api/media/[id]/route.ts`, `lib/server/media-references.ts` |
| `POST /api/media/upload` | `{ sizeBytes }` starts an MP4 upload. Returns `{ mediaId, path, token, signedUrl }` | `app/api/media/upload/route.ts` |
| `POST /api/media/upload/complete` | `{ mediaId, durationMs, width, height }` after the bytes are stored | `app/api/media/upload/complete/route.ts` |

Storage paths are `${accountId}/...` (`lib/server/supabase.ts` bucket `media`). A signed URL is the reference a client may fetch. It expires.


The production `media` bucket allows 500 MB (`file_size_limit` 524288000), matching `MAX_VIDEO_BYTES` on `POST /api/media/upload`. Its `allowed_mime_types` are `image/jpeg`, `image/png`, `image/webp`, `video/mp4`, `application/vnd.openxmlformats-officedocument.presentationml.presentation`, and `application/pdf`. Video uploads, including TUS, must use `contentType` `video/mp4` or Storage will reject the object.

### Supported media contract (Apple formats)

Written 20 November 2026 for the web/backend Apple media work. This is the contract Flutter should follow. It does not change the Android +14 release artifacts.

**1) Allowed `contentType` values (bucket unchanged)**

The production `media` bucket allow-list is unchanged: `image/jpeg`, `image/png`, `image/webp`, `video/mp4`, `application/vnd.openxmlformats-officedocument.presentationml.presentation`, `application/pdf`. Do not send `video/quicktime`, `video/x-m4v`, `image/heic`, or `image/heif` as the Storage `contentType`.

- Compatible `.mov`, `.MOV`, and `.m4v` files are accepted after content inspection. Upload the original bytes with TUS/PUT `contentType` `video/mp4`. The server always stores the object at `${accountId}/{mediaId}.mp4` with `mime_type: "video/mp4"`. The original filename may stay on the media row.
- HEIC/HEIF is **not** accepted raw by `POST /api/media` or by the bucket. The client must convert it to JPEG (orientation baked in) and upload `contentType` `image/jpeg` (filename `.jpg`). The original HEIC is not stored.

**2) Compatible MOV / M4V, and server codec checks**

A file is compatible when `inspectMp4` + `enforceVideoLimits` (`lib/mp4.ts`) succeed. The container brand is not used as a gate (`ftyp qt` and `M4V ` are fine). The server always re-checks on `POST /api/media/upload/complete` and discards the object if it fails. Client-side checks are helpful but not sufficient.

Accepted: H.264 (`avc1` / `avc3`) Baseline, Main, or High at level 4.2 or below; AAC audio (`mp4a`) or no audio; each edge ≤ 1920 px; duration 0.5 s–3 minutes; size ≤ 500 MB.

Rejected without conversion (intentional, TV safety): ProRes, PCM/LPCM audio, VP9, AV1, and files with no `ftyp`+`moov`. HEVC/H.265, and some otherwise-incompatible H.264 such as 4K or High 10, still within 500 MB and 3 minutes, are accepted for automatic conversion (item 4). Direct playback still requires H.264 High ≤ 4.2, AAC or silent, and each edge ≤ 1920 px.

**3) HEIC conversion**

The web client converts HEIC/HEIF to JPEG in the browser, bakes in EXIF orientation (`createImageBitmap` with `imageOrientation: "from-image"` where available, then canvas), preserves proportions, and resizes to the existing 1920×1080 (or 1080×1920) JPEG-on-black pipeline. Native decode works in Safari and on iPhone. There is **no server-side HEIC fallback**: Vercel’s Sharp/libvips build does not include HEIF, the bucket rejects `image/heic`, and `sniffImage` only accepts JPEG, PNG, and WebP magic bytes. Flutter should convert on-device with the platform codec (no new paid dependency) and upload JPEG.

**4) HEVC processing state (live as of 21 November 2026)**

**Live in production as of 21 November 2026, 9:39 AM PT (America/Los_Angeles).** `HEVC_CONVERSION_ENABLED=1` and `NEXT_PUBLIC_HEVC_CONVERSION_ENABLED=1` are set for Production only. Pipeline: PRs #170, #171, and #172. Current production is merge commit `23f3f39` (PR #172), deployment `dpl_CfsVxRkZkRitPcPcrXkXZDiniYeK` on pekkotv.com. Flag-off rollback: set both flags to `0` or delete them and redeploy; the last flag-off production build is `dpl_4AnTC1PHfuPoLEwtaWi28fTBdzux` (`e2240f6`). Google Play / +14 releases are unchanged.

Convertible uploads (HEVC/H.265 in MOV/MP4/M4V, and some otherwise-incompatible H.264 such as 4K or High 10, still within 500 MB and 3 minutes) now go through automatic conversion to TV-compatible H.264/AAC 1080p:

- Return **201** `{ id, processingStatus: "processing" }` from `POST /api/media/upload/complete`. The Storage `contentType` is still `video/mp4`.
- Poll **`GET /api/media`** (existing library list). Each video may include:
  - `processingStatus`: `null` or omitted (treat as **ready**, including all existing media), `processing`, `ready`, or `failed`
  - `processingError`: a short code on failure (`conversion_failed`, `conversion_invalid_output`, `conversion_budget`, `conversion_provider`) or `null`
- There is no separate conversion poll endpoint.
- Editors must not add `processing` or `failed` videos to playlists, boards, or published shows. The server rejects those saves and publishes with **409** `video_not_ready`.
- TVs never receive processing or failed media: `player_playlist` / player-state omit them. Existing media with `processingStatus` null keeps playing.
- While `processing`, `url` is omitted so the unconverted original is not handed to a player or editor preview. A thumbnail may still be present.
- After `ready`, `url` is a signed URL for the converted H.264/AAC MP4 (validated with `inspectMp4`: High ≤ 4.2, AAC or silent, each edge ≤ 1920 px).
- Monthly conversion budget is $15 (Coconut, billed only for successful conversions). Exhaustion returns **429** and `code` may be `conversion_budget`; the object is not kept. Ask the user to export as H.264 (Most Compatible) or retry next month.
- Non-convertible files (ProRes, VP9, AV1, and similar) are still rejected immediately with **415** and the existing `video_codec` / `video_profile` / related codes.
- Flutter may now ship the processing/ready/failed path. Do not change a locked Play release solely for this; coordinate the app update in the usual way.

Other video failures use `video_type`, `video_profile`, `video_duration`, `video_dimensions`, `video_size` (413), `video_metadata`, or `video_unreadable`, all similarly catalogued in `lib/i18n/en.ts` / `es.ts` as `apiError.video_*`.

**5) Live status**

**Apple media (compatible MOV/M4V and HEIC→JPEG)** has been live since 20 November 2026, 9:39 PM PT (America/Los_Angeles). Merge commit `9500dd3` (PR #168), production deployment `dpl_9oRQyHErgSX8qhAM4KWUeJg8z8fa`.

**Automatic HEVC conversion is live as of 21 November 2026, 9:39 AM PT (America/Los_Angeles).** Merge commit `23f3f39` (PR #172, on top of #170 and #171), production deployment `dpl_CfsVxRkZkRitPcPcrXkXZDiniYeK` on pekkotv.com (health `commit` 23f3f39). Flutter can now rely on: compatible MOV/M4V bytes uploaded as `video/mp4`; client-side HEIC→JPEG; HEVC (and some other convertible video) returning `processingStatus` `processing` then `ready` or `failed`; 409 `video_not_ready` for unready playlist/publish; and 429 `conversion_budget` if the $15 month cap is reserved. The bucket allow-list is unchanged.

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

A playlist reaches a screen through a publish. `PATCH /api/displays/:id` assigns one image, not a video. The phone does not expand a playlist into slides.

### Screen assignment semantics

The database function `publish_playlist` assigns the screens it is given **and clears every other screen showing that playlist**. What each route sends it:

| Route | Semantics | Use it to |
| --- | --- | --- |
| `POST /api/playlists/:id/publish {displayIds}` | **Exact set**: screens on the playlist that are not listed are cleared | Publish from a playlist editor that shows every screen with the current ones pre-selected |
| `POST /api/displays/publish {playlistId, displayIds or groupId, commit: true, replace: false}` | **Additive**: listed screens are added, others keep it. `replace: true` = exact set | Add screens ("Show on screens") |
| `PATCH /api/menus/:id {displayIds}` | **Additive since PR #157**: the screens already showing the board stay on it. Optional `replace: true` = exact set (old behaviour). More than 50 screens in total → 400 before anything is saved | Show a menu board on more screens, with or without an edit |
| `POST /api/menus {displayIds}` | New board, new playlist: the listed screens | Create and show |
| `POST /api/layout-studio/assign {menuId, displayId}` | One screen added; others stay. Board must be published (`playlistId` not null) | Show a web-designer board on a screen |

Before PR #157, `PATCH /api/menus/:id {displayIds}` was exact-set: sending only a newly ticked screen took the board off every other TV. Builds that relied on that to *remove* screens must now send `replace: true`.

## Menus and presentations

Menus are still images on the TV. The server renders a 1920×1080 PNG and stores a normal media row; every board owns one playlist.

### Menu boards: three formats in `menus.content`

`GET /api/menus` → `{ menus: [...], available }`; each row (and `GET /api/menus/:id`) is `{ id, name, template, content, mediaId, playlistId, imageUrl, createdAt, updatedAt }` with the **raw** `content`.

| Kind | How to tell | `content` | Edited by | Phone |
| --- | --- | --- | --- | --- |
| Classic full-screen | `content.layoutVersion` absent | `MenuContent` (`lib/menu-templates.ts`): `title, subtitle, footer, sections[{ name, items[{ name, price, description, imageMediaId? }] }], photoMediaId?, useBrand?, headingFont?, bodyFont?, itemPhotos?` | `POST /api/menus`, `PATCH /api/menus/:id` (re-render, swap image on its screens; no draft) | Create, edit, rename, assign |
| Original layout (7) | `content.layoutVersion === 1`, no `design` | `LayoutDocument` (`lib/layout-studio.ts`): `layoutVersion: 1, template ∈ {two-column, menu-promo-67, two-menu-promo, triple-column, split-50, menu-banner, signature}, split, title, subtitle, footer, sections, imageMediaId, videoMediaId, palette, primaryColor, accentColor, typeScale, font, bodyFont?, textColor, backgroundColor, featureTitle, featureDetail, columnWidths, imageFit, imageAnchor`; items may have `imageMediaId` | `POST /api/layout-studio {mode: "draft"\|"publish", menuId, name, document}` | Create, edit, rename, assign via `POST /api/layout-studio` (phone since Android +17). `PATCH /api/menus/:id` with `content` or `template` is still 409 |
| Professional template (38) | `content.layoutVersion === 1` **and** `content.design` | `LayoutDocument` + `design` (template id), `variant`, `stockPhoto?`, `logoMediaId?`, deprecated `photoStyle?`; items may have `imageMediaId` and `stockPhoto` (item photos auto-display whenever present) | same as layouts | same as layouts |

Rules for clients:

1. **Branch on `content.layoutVersion === 1`, never on `template`.** For web-designer boards `menus.template` holds the palette (`classic` / `fresh` / `bold`), so it looks like a classic board.
2. **409 protection.** `PATCH /api/menus/:id` with `content` or `template` on a `layoutVersion: 1` board returns **409** "This menu board was made in the web editor. Edit it at pekkotv.com." Nothing is written. Edit the document with `POST /api/layout-studio` instead. `name` and `displayIds` still work (`displayIds` is additive, see above). `POST /api/brand/apply` skips these boards.
3. **Nullable ids.** A web-designer board saved as a draft and never published has **`playlistId: null`**; its `mediaId` / `imageUrl` are the draft preview still (not on any screen) or null. Published boards always have both. Treat all three as nullable; label `playlistId == null` as "Draft" and don't offer screen assignment until it is published.
4. **Unknown keys.** Parse tolerantly. New optional keys are additive.
5. **Lossless classic edits.** The server keeps what an older client omits: `headingFont` / `bodyFont` and `itemPhotos` when the key is absent, and an item's `imageMediaId` when the item is sent without that key (matched by section name or position, then item **name**, first match). An explicit `null` clears. Renaming an item on a client that omits `imageMediaId` therefore loses that item's photo: send `imageMediaId` back unchanged (keep each item's raw JSON).
6. **Item photos** must be this account's own JPEG/PNG/WebP (`media` ids); others are dropped on save. Limits: 4 sections, 12 items per section, 24 items in total for classic boards.

Template ids (`lib/menu-designs.ts`): `modern-restaurant, trattoria, cocktail-lounge, coffee-shop, bakery, brunch-house, espresso-bar, bold-fast-casual, pizza-night, smokehouse-bbq, happy-hour, morning-rush, taqueria, diner-classics, chalkboard-bistro, juice-bar, ice-cream-parlor, boba-tea, photo-menu-grid, cafe-favorites, taqueria-specials, featured-dishes`, then the 16 non-food templates `salon-maison, barber-blade, beauty-glow, nails-polished, retail-sale, retail-offers, retail-boutique, fitness-timetable, fitness-join, fitness-motivate, office-welcome, office-rooms, office-kudos, pets-groom, pets-treats, pets-care` (see `docs/MENU_TEMPLATES.md`). Don't hard-code this list; read the catalog. Fonts (`lib/board-fonts.ts`): `inter, noto-serif, oswald, montserrat, bebas-neue, lobster`. `GET /api/menu-templates` → `{ enabled, unified }` says whether the account has the designer (true for everyone today).

Publishing a web-designer board (PR #159) swaps the board's own image on its playlist. Promotion items attached to the same playlist are no longer at risk of being replaced.

| Call | Behavior | Source |
| --- | --- | --- |
| `GET /api/menus` | This account's menus | `app/api/menus/route.ts` |
| `POST /api/menus` | Render, create a playlist, optional screen assignment | same |
| `GET /api/menus/:id` | One menu | `app/api/menus/[id]/route.ts` |
| `PATCH /api/menus/:id` | Classic: re-render and swap the image. Web-designer boards: rename / `displayIds` only, content → 409. `displayIds` is additive; `replace: true` for an exact set | same |
| `DELETE /api/menus/:id` | Delete | same |
| `POST /api/menus/preview` | Preview PNG, not saved | `app/api/menus/preview/route.ts` |
| `GET /api/brand` | Brand colors and logo | `app/api/brand/route.ts` |
| `PUT /api/brand` | Save the brand | same |
| `POST /api/brand/apply` | Re-render classic menus that use the brand (web-designer boards are skipped) | `app/api/brand/apply/route.ts` |
| `POST /api/media/presentation` | `{ fileName, sizeBytes }` signed upload for pptx or PDF | `app/api/media/presentation/route.ts` |
| `POST /api/media/presentation/complete` | Finish the upload | `app/api/media/presentation/complete/route.ts` |
| `GET /api/media/presentation/:id` | Group detail and slides | `app/api/media/presentation/[id]/route.ts` |
| `PATCH /api/media/presentation/:id` | Name or per-slide duration | same |
| `POST /api/media/presentation/:id/playlist` | Add the group to a playlist as one item | `app/api/media/presentation/[id]/playlist/route.ts` |

The player receives expanded image slides. `groupIndex` and `groupCount` are slide counters inside that group. See `docs/PRESENTATION_GROUPS.md`.

## Menu designer API (Flutter parity)

Everything the web gallery and guided editor use, exposed so the app never keeps its own copy of the templates. The catalog is built from the web's own source of truth (`lib/menu-designer.ts` `galleryEntries`, `lib/menu-designs.ts`, `lib/layout-studio.ts`) by `lib/menu-catalog.ts`; a template added or changed on the web appears here with a new `version`. All routes are additive. Android +14/+15 never call them and nothing they use changed.

| Call | Auth | Purpose | Source |
| --- | --- | --- | --- |
| `GET /api/menu-templates/catalog` | Bearer | Gallery: filters, 46 entries, seeds | `app/api/menu-templates/catalog/route.ts` |
| `GET /api/menu-templates/thumbnail/:id` | **Public** | 16:9 PNG of an entry's sample board | `app/api/menu-templates/thumbnail/[id]/route.ts` |
| `POST /api/menu-templates/switch` | Bearer | Change template / variant / layout, keeping content | `app/api/menu-templates/switch/route.ts` |
| `POST /api/layout-studio/preview` | Bearer | Exact publish PNG, or fit report only; saves nothing | `app/api/layout-studio/preview/route.ts` |
| `GET /api/layout-studio` | Bearer | Existing: boards (full `document`) + media library with signed URLs | unchanged |
| `POST /api/layout-studio` | Bearer | Existing: save draft / publish | unchanged |

`switch` and `preview` return 404 before any database call when `LAYOUT_STUDIO` is not `1` (like the other layout-studio routes; it is `1` in production). The catalog always answers and says `layoutStudio: true|false`.

### `GET /api/menu-templates/catalog`

`200`, `Cache-Control: private, no-cache`. About 70 KB. Shape (`MenuCatalog` in `lib/menu-catalog.ts`):

```jsonc
{
  "schema": 1,                       // bumps only on a breaking change; new optional fields keep 1
  "version": "1.1.fc897e0b",         // changes when any template, name, seed or the renderer revision changes
  "layoutStudio": true,
  "filters": {
    "business":  [{ "id": "all", "name": { "en": "All", "es": "Todos" } }, ... "restaurant", "cafe", "fast", "bar", "sweets", "salon", "retail", "fitness", "office", "pets"],
    "style":     [ "all", "dark", "light", "bold" ],             // same {id, name{en,es}} objects
    "structure": [ "all", "single", "columns", "media", "cards" ]
  },
  "fonts": ["inter", "noto-serif", "oswald", "montserrat", "bebas-neue", "lobster"],
  "entries": [
    {
      "id": "modern-restaurant",       // stable; also the value of content.design on saved boards
      "kind": "template",              // "template" (38) | "classic" (1, id "full-screen") | "layout" (7)
      "name": { "en": "Modern Restaurant", "es": "Restaurante moderno" },
      "description": { "en": "...", "es": "..." },
      "business": "restaurant",        // "any" on layouts and classic: matches every business filter
      "style": "dark",
      "structure": "media",
      "photos": false,                 // "Built around photos" filter
      "thumbnailPath": "/api/menu-templates/thumbnail/modern-restaurant?v=1.1.fc897e0b&w=640",
      "boardName": "Casa Verde",       // Brand Kit business name, or null → use name[lang]
      "variants": [{ "id": "brass", "name": { "en": "Charcoal & brass", "es": "Carbón y latón" },
                     "colors": { "paper": "#131416", "ink": "#f3eee5", "muted": "#a89f92", "accent": "#c9a46a", "panel": "#1b1c1f", "tag": "#c9a46a" } }],
      "create": { "route": "POST /api/layout-studio", "document": { "layoutVersion": 1, "design": "modern-restaurant", "variant": "brass", ... } }
    },
    { "id": "full-screen", "kind": "classic", ..., "variants": [],
      "create": { "route": "POST /api/menus", "template": "classic", "content": { "title": "...", "sections": [...] } } },
    { "id": "two-column", "kind": "layout", ..., "variants": [], "create": { "route": "POST /api/layout-studio", "document": { ... } } }
  ],
  "scratch": { "create": { "route": "POST /api/layout-studio", "document": { ... } } }   // "Start from scratch"
}
```

- **Order** is the web gallery's: 38 templates, the classic board, then 7 layouts. Filter exactly like the web: business `all` or equal or entry `any`; style `all` or equal; structure `all` or equal; photos toggle → `photos === true`.
- **Names** are both languages in every response; pick by the app language. `Accept-Language` doesn't change the body.
- **Seeds are per account, like the web.** Layout and classic seeds carry this account's Brand Kit (colours, fonts, business name, footer contact); templates take only the kit's business name as `title`. No other account data is included: no ids, emails, media ids or logo.
- **Create a board:** `POST /api/layout-studio { mode: "draft" | "publish", menuId: null, name, document: entry.create.document }`, or for `kind: "classic"` `POST /api/menus { name, template: "classic", content }` (existing contract). Use `boardName ?? name[lang]` for `name`. To pick a variant other than the first, set `document.variant` to its id (or use `switch`).
- **Cache** by `version`. Unknown `kind` values or extra fields may appear later; skip entries you don't understand.

### `GET /api/menu-templates/thumbnail/:id`

Public (no token: sample content and bundled stock photos only). Query: `v` (catalog version), `w` (width in px; snaps up to 320, 640, 960, 1280 or 1920; default 640), `variant` (template variant id; omit for the first). Height is `w × 9/16`.

- `200 image/png`, `Cache-Control: public, max-age=86400, s-maxage=31536000, immutable`. Drawn by the same renderer as published boards.
- Any non-canonical URL (old `v`, unsnapped `w`, first variant spelled out, unknown params) → **308** to the canonical URL. Follow redirects.
- Unknown id, or an unknown variant (or any variant on a layout/classic) → 404.
- Build URLs from `thumbnailPath`: append `&variant=<id>`, or replace `w=640` with the size you need. Prefix the API origin (`https://pekkotv.com`).

Item stock photos used by templates are public files at `https://pekkotv.com/menu-templates/<stockPhoto>.jpg`.

### `POST /api/menu-templates/switch`

Body `{ document, to, variant? }`: `document` is a `LayoutDocument` (a template or layout board); `to` is a catalog `template` or `layout` id; `variant` is optional and only for templates. Runs the web editor's own `switchDesign` / `switchToLayout`: sections, items, item photos, title, photo and video stay; template-only settings are removed when moving to a layout.

`200 { document, fit }` (see `fit` below). Errors: 400 "Choose a template or layout from the catalog." / "Choose one of this template's colour styles." / any `parseLayout` message; Spanish for `Accept-Language: es`. Saves nothing. To switch a board to the classic format, create a classic board instead (the web does not convert in place either).

### `POST /api/layout-studio/preview`

Body `{ document, width?: 480 | 960 | 1920, format?: "png" | "fit" }` (`width` snaps up; default 960).

- `format: "png"` (default): `200 image/png`, `Cache-Control: no-store`, the same PNG `POST /api/layout-studio` would publish. Headers: `X-Board-Can-Publish: true|false`, `X-Board-Dropped-Items`, `X-Board-Hidden-Sections`, `X-Board-Hidden-Items`, `X-Board-Clipped-Names` (counts). Rate limit 60/min per user, shared with `POST /api/menus/preview` → 429 `preview_rate_limited` with `Retry-After`.
- `format: "fit"`: `200 { fit }` with no rendering; 240/min per user. Cheap enough to call after each edit (debounce ~300 ms).
- Only this account's own JPEG/PNG/WebP files are drawn (photo, logo, item photos); another account's id or a deleted file is simply not drawn. The video box draws as its poster, as on the TV still.
- Errors: 400 with the `parseLayout` message (localized), 401, 404 when `LAYOUT_STUDIO` is off.

`fit` (`BoardFit` in `lib/board-fit.ts`, the same checks publish enforces):

```jsonc
{
  "canPublish": false,     // false only when a template drops items; POST /api/layout-studio {mode:"publish"} would return 400
  "droppedItems": 3,       // templates: items not drawn
  "hiddenSections": 0,     // layouts: sections past the layout's columns (not drawn; publish still allowed)
  "hiddenItems": 0,
  "clippedNames": [],      // layouts: item names shortened with "…"
  "suggestions": { "roomierTemplate": "diner-classics", "canMergeSections": false },   // the web editor's fix buttons
  // Additive Guided Customization fields (unchanged): canvasWidth, canvasHeight, videoBox, regions,
  // overflowReasons, safeAction, custom.
  "photosSuppressed": false  // additive: true when item photos were omitted so items that fit as text stay on the board
}
```

`photosSuppressed` is additive. It is `true` when even compact item-photo thumbnails would drop items that fit as text-only; the renderer then draws the board as text (no empty placeholders, no silent photo-only drops) and `canPublish` stays `true` as long as those items fit. Show the localized `tpl.photosDontFit` copy in the editor (Menu and Look) when it is true. On `featured-dishes`, `photosSuppressed` hides only the left-list thumbnails; spotlight panel photos still draw. `overflowReasons`, `safeAction`, `custom`, `regions`, `videoBox`, `canvasWidth` and `canvasHeight` are unchanged.

### Editing flow for the app

1. `GET /api/layout-studio` → `boards[]` (`id, name, document, mediaId, playlistId, updatedAt`) and `library[]` (`id, name, kind, mime, url, sizeBytes`; `url` is a 1-hour signed URL). Upload new images with the existing media upload routes.
2. Edit the document locally. Keep every field you don't edit untouched (send the whole document back). Limits: 4 sections, 12 items per section, 24 items; text limits in `MENU_LIMITS` (`lib/menu-templates.ts`).
3. `preview {format: "fit"}` while editing; `preview` PNG on demand; `switch` for "Change design".
4. Save with `POST /api/layout-studio {mode: "draft"}`; publish with `{mode: "publish", menuId}`. Publishing a template that drops items returns 400 ("N items don't fit on the screen…"); check `fit.canPublish` first.
5. Assign screens with `PATCH /api/menus/:id { displayIds }` (additive) or `POST /api/layout-studio/assign { menuId, displayId }` after the first publish.

## Billing status, read only

`GET /api/entitlements` is the authoritative status read (`lib/server/entitlements.ts` `toResponse` / `buildEntitlementsResponse`). `enforced` is true only when `BILLING_ENFORCE` is exactly `1`. A dashboard or app read does not start the existing-customer clock and never charges anyone.

Existing fields are unchanged: `account_id`, `state`, `plan`, `plan_name`, `screen_limit`, `active_screens`, `total_screens`, `can_add_screen`, `playback_allowed`, `trial`, `subscription`, `grace_ends_at`, `suspend_at`, `features_locked`, `warning`, `rollout_notice`, `transition_ends_at`, `enforced`, `billing_url`, `server_time`.

Older app versions can ignore the additive fields below. Treat them as optional.

### Additive `GET /api/entitlements` fields (exact shapes)

```json
{
  "has_payment_method": false,
  "payment_method": { "brand": "visa", "last4": "4242" },
  "is_owner": true,
  "billing_starts_at": "2026-11-26T03:31:28.000Z",
  "next_billing_at": "2026-11-26T03:31:28.000Z",
  "checkout_pending": { "plan": "multi", "expires_at": "2026-11-22T20:28:20.000Z" },
  "status_detail": { "kind": "trialing", "message": "You're on a trial. Your payment method (visa •••• 4242) is on file; billing starts on Nov 26, 2026 (UTC)." },
  "portal_available": false
}
```

- `has_payment_method` (boolean): true only when a card brand/last4 is cached from Stripe. An open unpaid Checkout session is never a payment method.
- `payment_method`: `{ "brand": string, "last4": string }` when `has_payment_method` is true; otherwise `null`. Brand is a Stripe card brand such as `visa`. Last4 is four digits only.
- `is_owner` (boolean): true when the bearer token's user is `accounts.owner_user_id`.
- `billing_starts_at`: ISO-8601 timestamp or `null`. Set when a no-card Pekko trial has a card on file (`trial.ends_at`) or when Stripe `subscription.status` is `"trialing"` (`subscription.current_period_end`, which equals Stripe `trial_end`).
- `next_billing_at`: ISO-8601 timestamp or `null`. Set for Stripe `active`, `trialing`, or `past_due` from `current_period_end`.
- `checkout_pending`: `{ "plan": "starter" | "business" | "multi", "expires_at": string }` or `null`. No Checkout URL is returned on this endpoint.
- `status_detail`: `{ "kind": string, "message": string }` or `null`. Informational (active paid, complimentary, Stripe-trialing, cancel-at-period-end, early trial with a card). It is omitted from being a `warning`. A genuine paid or Stripe-trialing subscription never gets `warning.kind` `"trial_ending"` or `"expired"`.
- `portal_available` (boolean): true only when `is_owner` is true and the org has a stored `stripe_customer_id`. **Play builds must ignore this field and must not call the portal**, even if it is true. Private test APKs may use it behind a compile-time flag that is off by default.

`warning` keeps its existing shape `{ kind, message, action }` and existing kind values: `trial_ending`, `trial_ended`, `payment_failed`, `over_limit`, `expired`, `canceled`. `trial_ending` copy now distinguishes card-on-file vs no card.

Stripe `subscription.status` `"trialing"` still maps to entitlements `state: "active"` and `trial: null`. `current_period_end` is Stripe `trial_end`. No `trial_ending` or `expired` warning fires in that case; use `status_detail.kind` `"trialing"`.

### Option B checkout and the 3-day playback grace (no new fields)

Flutter +27 can keep using the existing values and fields. This change does not add a state, `status_detail.kind`, `warning.kind`, or date field.

- Choosing a plan during the 14-day no-card trial, with at least 48 hours remaining, creates a Stripe Checkout subscription whose `trial_end` is the original Pekko trial end (capped at 14 days from start). The first charge is on that date; the trial is not extended. After Checkout completes, entitlements are a paid plan (`starter` | `business` | `multi`), `state: "active"`, `subscription.status: "trialing"`, `status_detail.kind: "trialing"`, `has_payment_method: true`, `billing_starts_at` and `next_billing_at` equal to Stripe `trial_end`, `trial: null`, and no `trial_ending` warning.
- If fewer than 48 hours remain (Stripe Checkout's minimum `trial_end`), or the trial has ended, Checkout charges the first month today. The billing page and Stripe submit message disclose that clearly.
- Resume only reuses a stored session when its charge mode still matches: a deferred session must have `amount_total === 0`; an immediate-charge session must have `amount_total > 0`. Only an org-tracked `checkout_session_id` may be expired. Untracked sessions are never looked up or expired.
- If a Stripe-trialing Option B subscription sets `cancel_at_period_end: true`, `status_detail.kind` is `"canceling"` and `billing_starts_at` is `null` (billing will not start) while full access continues through Stripe `trial_end`.
- After the no-card trial ends without a paid (or Stripe-trialing) subscription—including when a scheduled Option B subscription is canceled before its first charge (`trial_canceled_before_charge`)—`state` is `"trial_grace"` for 3 days (`trial` stays populated with the original 14-day `ends_at`). `warning.kind` is `"trial_ended"`. `suspend_at` is `trial.ends_at` + 3 days (also during the 14-day trial, because `playback_ends_at` is that grace end). `grace_ends_at` remains payment-failure only and stays `null` during trial and `trial_grace`. `playback_allowed` is true; `can_add_screen` is false; `features_locked` stays `[]`. Editing, publishing, uploads, pairing, and `POST /api/entitlements/active-screens` are refused with 403 `subscription_inactive`, while already-entitled TVs keep playing. After the grace window, the existing `expired` rules apply (`playback_allowed` false). Paid subscriptions that completed at least one paid cycle and later cancel never enter `trial_grace`.
- Expired and canceled orgs are also write-locked (same 403 code, including `POST /api/entitlements/active-screens`), so waiting out the grace period cannot unlock editing or screen changes.
- Fail-closed entitlement verification (no Flutter rebuild needed): when `BILLING_ENFORCE=1` and entitlement verification fails or returns no row, every write-gated route (content/media/displays/playlists/pairing/`active-screens`) now denies the mutation with `503 { "error": "Couldn't check your plan. Try again.", "code": "plan_check_unavailable" }` and `Retry-After: 5` (never fail-open, never mislabeled as `403 subscription_inactive`). Already-authorized TV playback (`GET /api/player/state`, `GET /api/displays`) stays fail-open on DB read errors. Flutter `+27` already maps `plan_check_unavailable` (`ApiErrorCodes.planCheckUnavailable`) and parses `Retry-After` on HTTP `503`.
- Paused & incomplete initial payment safeguards (no new enum states, warning kinds, or error codes):
  - **Incomplete first payment (`subscription.status` `"incomplete"` / `"incomplete_expired"`):** a failed or incomplete initial payment attempt never ends an otherwise valid 14-day free trial early (`plan` stays `"trial"`, original `trial` end and 3-day `trial_grace` are preserved) and never grants paid entitlements or `past_due` grace until payment succeeds (`"active"` or `"trialing"`). While `plan === "trial"` with a pending/failed/ended subscription (`"incomplete"`, `"incomplete_expired"`, `"paused"`, `"canceled"`), `billing_starts_at` and `status_detail` stay `null`. On a paid plan (`starter` | `business` | `multi`), `incomplete` / `incomplete_expired` / `paused` all evaluate to `state: "canceled"`, `warning.kind: "canceled"`, `playback_allowed: false`, `screen_limit: 0`, and write-locked (`403 subscription_inactive`).
  - **Paused & incomplete duplicate-checkout block (`POST /api/billing/checkout`):** while `subscription.status` is `"paused"` or `"incomplete"` (whether read from DB or refreshed from Stripe on an existing subscription), `POST /api/billing/checkout` blocks duplicate subscription creation. Non-owners still receive `403 { "error": "Only the account owner can change the plan.", "code": "not_owner" }`. Owners receive the existing `409 { "error": "Use Manage billing to change this plan.", "code": "subscription_exists", "action": "portal" }` (Play `+14` rewrites this via `android-status-copy.ts`), directing eligible owners to `POST /api/billing/portal` (still owner-only `403 not_owner`, tenant-isolated, never auto-resumes, changes prices, or charges). Once `"incomplete"` expires (`"incomplete_expired"`) or is canceled (`"canceled"`), `POST /api/billing/checkout` allows starting a fresh Checkout session again.
- Play builds stay status-only and must not open Checkout or the portal. Private test APKs may prototype the portal only behind a compile-time flag that is off by default.


### Localization

Warning and `status_detail` messages are localized on the server. Precedence is:

1. The account's saved locale (`accounts.locale`)
2. The `Accept-Language` request header
3. English

There is no `locale` query or body parameter. If one is sent, it is ignored. Support `Accept-Language` at minimum (`es` or `en`; see `localeFromAcceptLanguage`). HTTP 4xx/5xx `error` text uses the same precedence (`withLocalizedErrors`).

### Android / Dart User-Agent (status-only)

Requests whose User-Agent starts with `Dart/` (case-insensitive) or that send `X-Pekko-Client: android/...` get status-only wording: `error` (when `code` is present), `warning.message`, `status_detail.message`, and `rollout_notice` are rewritten to remove purchase or web-steering language (`lib/server/android-status-copy.ts`). `code`, `kind`, `action`, `plan_name`, `billing_url`, and structured fields are not rewritten. Web responses are unchanged. This path is unchanged in intent; `store_policy_test` is not modified. Play builds remain status-only.

### `POST /api/billing/portal`

This endpoint accepts the app's bearer token. Auth is `requireAdmin` in `lib/server/auth.ts`: `Authorization: Bearer <access token>`. The body is ignored and a customer id in the body is not honored. The customer comes only from the stored `accounts.stripe_customer_id` for the signed-in org.

Returns:

- `200 { "url": string }` — Stripe Customer Portal session URL. `return_url` is `{origin}/dashboard/account`, where origin is the allowlisted request origin (production customers land on `https://pekkotv.com/dashboard/account`). The app cannot set `return_url`.
- `200 { "action": "plans" }` — owner, but no Stripe customer yet (show the plan picker; no portal session).
- `403 { "error": "Only the account owner can manage billing.", "code": "not_owner" }` — **stable shape**. Status is always 403 and `code` is always `"not_owner"`. This billing route is not passed through `withLocalizedErrors`, so `error` stays this English sentence for web and Dart/Android callers alike. Tests cover the bearer-token path and this 403 body.
- `401` if the bearer token is missing or invalid; `503 { "error", "code": "billing_unavailable" }` if Stripe is not configured.

Play builds must not call this endpoint. Private test APKs may prototype it only behind a compile-time flag that is off by default.

`GET /api/billing/checkout` returns `{ available }` and no secrets. `POST /api/billing/checkout` starts or resumes a Stripe Checkout session (`{ plan, replace?: boolean }` → `{ url, resumed?: true }`). During an eligible trial it sets Stripe `subscription_data.trial_end` to the original trial end; otherwise the first charge is today. Resume returns the existing unpaid session for the same plan and charge mode instead of opening a second one; `replace: true` expires only that org's stored session and creates a new one. It never charges automatically and never expires an untracked session. `POST /api/billing/webhook` is Stripe's. None of these are status reads. Play builds must not call checkout.

`GET /api/entitlements/active-screens` and `POST /api/entitlements/active-screens` choose which screens stay on when a plan is over its limit. That writes (`POST` is allowed during `active`, `trial`, `past_due`, and `grandfathered`, and refused with `403 subscription_inactive` during `trial_grace`, `expired`, and `canceled`, or `503 plan_check_unavailable` if entitlement verification fails). A status display does not need it.

## Deletion

`GET /api/account/deletion` returns `{ enabled, delayDays, request }`. `enabled` is true only when `ACCOUNT_DELETION` is exactly `1`. The delay is 7 days (`lib/server/account-deletion.ts`). `POST` with `{ confirm: "DELETE", password }` schedules deletion. `DELETE` cancels a pending request. While the flag is off, `POST` returns 503 `disabled`. Only the account owner can call these.

## Errors and offline

The TV reports a playback error with `POST /api/player/state` and header `X-Display-Token`. The phone does not send that. `GET /api/displays` returns `playerError` for the owner.

Offline playback is inside the TV page: Cache Storage `seemple-media-v1`, last saved playlist, images only (`public/player.html` `playSaved`, `public/player-sw.js`). There is no management API for an offline pack. A phone that cannot reach the API shows its own network error. It does not cache the screen's media as a second player.

## Vertical (9:16) menu boards

Full contract: [`docs/vertical/API_CONTRACT.md`](vertical/API_CONTRACT.md). What the app must know:

- **Capability header.** Send `X-Pekko-Client-Caps: orientation` only from the build that can show and keep vertical boards. It is the only signal (not the User-Agent, not `X-Pekko-Client`). Without it the app is treated as an older client.
- **Board orientation** is `orientation: "portrait"` inside the board document (`LayoutDocument` / `MenuContent`). Absent means horizontal. Keep the key when re-saving; omitting it on an existing board keeps the stored value. Unknown values are ignored (never a 400). Sending `"landscape"` from a capable build turns a vertical board horizontal, so only send it when the owner chose that.
- **Changing orientation is for capable clients only.** New boards from older builds are always horizontal. Content saves from older builds to a vertical board (`POST /api/layout-studio` draft or publish with that `menuId`, classic `PATCH /api/menus/:id` with `content` or `template`) return **409** and change nothing, so no board is ever silently made horizontal:
  - `{ "error": "This menu board is vertical. Edit it at pekkotv.com, or update the app to change it here.", "code": "orientation_unsupported" }`
  - ES: `Este menú es vertical. Edítelo en pekkotv.com, o actualice la aplicación para cambiarlo aquí.`
  - Rename, screen assignment (`displayIds`, `POST /api/layout-studio/assign`), delete and previews never return this 409.
- **Catalog seeds stay horizontal.** `fit` from `POST /api/menu-templates/switch` adds `canvasWidth`/`canvasHeight` (1920×1080 or 1080×1920).
- **Media sizes are accurate.** A rendered vertical board is stored as a 1080×1920 image (`media.width/height`). Previews keep `w` as the PNG width (portrait `w=960` → 960×1707).
- **Screens.** The screen row adds `orientation` (`"landscape"` | `"portrait"`) and `reportedViewport` (`{ width, height, at }` or null). `PATCH /api/displays/:id` with `{ orientation }` alone is valid and partial; invalid values are 400. `POST /api/displays/pair` stays `{ code, name }` (horizontal by default) and accepts an optional `orientation`. Reconnecting never resets it. Copy must make clear the owner rotates/mounts the TV; Pekko can't rotate it.
- **Mismatch.** Assigning a vertical board to a horizontal screen (or the reverse) is allowed. Show a non-blocking warning; the TV letterboxes, never stretches.
- **Vertical drawing (PR B).** Every existing template and layout draws on 1080×1920 (photo/video areas become a bottom band, columns stack). Horizontal boards draw exactly as before. Catalog thumbnails: add `orientation=portrait` to a thumbnail path for the 9:16 sample (widths 320/640/960/1080). `orientation=landscape` is a harmless no-op that redirects to the normal landscape thumbnail; other values 404. The catalog `version` changed with this release (`CATALOG_RENDER_REVISION` 2), so cached thumbnail URLs redirect once.

## Changes since Android +14 (web PRs #148–#163)

| Change | What the app sees | PR |
| --- | --- | --- |
| Web menu designer for everyone; most new boards are `layoutVersion: 1` | New board kinds in `GET /api/menus`, content edits 409, draft boards with `playlistId: null` | #148, #151, #153 |
| Item photos on every board kind | Optional `imageMediaId` on items auto-displays in preview/TV; legacy `itemPhotos`/`photoStyle` accepted on input and ignored at render time | #149, #151, Fix 1 |
| `PATCH /api/menus/:id {displayIds}` is additive | Existing screens are no longer removed; `replace: true` for the old behaviour | #157 |
| `DELETE /api/media/:id` checks menus, promotions, Brand Kit logo | New 409 `media_in_use` | #158 |
| Web-designer board publish swaps the right image | No contract change | #159 |
| Setup step 8 stays done after a TV confirmed content | Same `GET /api/onboarding` shape | #147 |
| `GET /api/health` returns `commit` | Additive | #153 |
| Menu designer API: catalog, public thumbnails, switch, preview + fit | New routes only | #162 |
| 16 non-food templates and five business filters (`salon`, `retail`, `fitness`, `office`, `pets`) | More catalog entries (`kind: "template"`, existing shape) and more `filters.business` objects, each with its own `{en, es}` name. Boards made from them are ordinary `layoutVersion: 1` + `design` boards. No field, route or kind is new; render filter chips from `filters.business` rather than a fixed list | non-food templates PR |
| Additive `playerBuild` on `GET /api/player/state` | Current value `2026-11-22.1` (was `2026-11-20.2`). Older clients can ignore it. The phone does not call this route | #163 |

No route was removed or renamed, and no response field was removed. `GET /api/player/state` now includes an additive `playerBuild` field (PR #163; current value `2026-11-22.1`). Older clients can ignore it. The phone does not call `/api/player/*`.

## Flags in production

These flags are off unless the value is exactly `1`:

| Flag | Effect when not exactly `1` | Source |
| --- | --- | --- |
| `BILLING_ENFORCE` | Entitlement reads still work. Screens are not paused for billing | `lib/server/entitlements.ts` |
| `BILLING_REMINDERS` | The reminder job sends nothing | `app/api/cron/billing-reminders/route.ts` |
| `ACCOUNT_DELETION` | Status can be read. Scheduling deletion returns 503 | `lib/server/account-deletion.ts` |
| `LAYOUT_STUDIO` | **On (`1`) in production.** If turned off: no composition on the player, and `GET` / `POST /api/layout-studio`, `/boards`, `/assign`, `/preview` and `POST /api/menu-templates/switch` return 404 before a database call | `lib/layout-studio.ts`, `app/api/layout-studio/route.ts` |
| `HEVC_CONVERSION_ENABLED` | **On (`1`) in Production only, as of 21 November 2026.** If not exactly `1`: HEVC and other convertible video is rejected immediately with 415 `video_codec`. Rollback: set to `0` or delete and redeploy | `lib/server/video-conversion.ts` |
| `NEXT_PUBLIC_HEVC_CONVERSION_ENABLED` | **On (`1`) in Production only, as of 21 November 2026.** Must match the server flag. If not exactly `1`: the web client rejects HEVC before upload. Rollback: set to `0` or delete and redeploy | `lib/prepare-video.ts` |

`MENU_TEMPLATES` and `UNIFIED_MENU_EDITOR`: unset = everyone (current production), `developers`, a list of emails/account ids, `all`, or `off` (`lib/menu-templates-flag.ts`).

Web-designer internals. The phone has created and edited these boards with `POST /api/layout-studio` since Android +17:

| Piece | What it is | Source |
| --- | --- | --- |
| `GET /api/layout-studio` | Signed-in boards and library for the web editor | `app/api/layout-studio/route.ts` |
| `POST /api/layout-studio` | `{ mode: "draft" \| "publish", menuId, name, document }`. Draft does not move screens. Publish swaps the board's own PNG through `menu_swap_media` (`boardItemMedia`). A client that edits these boards must send the whole document back with every field it didn't change untouched | `lib/server/layout-boards.ts` |
| `composition` on a player item | One optional video box. Absent means the PNG only. The phone does not read or render it | `lib/server/layout-player.ts` |
| `/layout-studio` | Browser preview. Production returns 404 | `lib/layout-studio.ts` `layoutStudioPreviewOpen` |

No database table is specific to Studio. A board is `menus.content` with `layoutVersion: 1`. The rendered file is a normal `media` row. `menus.template` stays `classic`, `fresh`, or `bold` for every board kind.

## Isolated backend for a second tester

What exists, and what it cannot do:

- This repository's tests create a local Postgres database and drop it. It listens on the machine's peer socket only. It is not reachable from another person, and it is not Supabase Auth.
- The Vercel preview of this branch serves `/layout-studio` and returns 404 for every other path, including `/api`. It shares the production Supabase project, so it must not be used as a writable QA backend.
- No disposable hosted organization is provisioned here. Creating a Supabase project, a Stripe account, or a Vercel project would be new spend and a new credential. That was not done.
- A second person can review source and the public layout preview. They cannot sign in to a private copy of auth, storage, and billing without a separate project that does not use production keys. This document does not include a URL, a key, or a test user.
