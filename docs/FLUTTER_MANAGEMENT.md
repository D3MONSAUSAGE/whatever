# Flutter management contract

This is the website and backend the phone app already uses as a controller. It is not a TV renderer. The television is `public/player.html`, served at `/player`. Flutter shows and copies that address. It does not call `/api/player/*`, and it does not paint boards, slides, or video.

Auth on every management route below is `Authorization: Bearer <Supabase access token>` (`lib/server/auth.ts` `requireAdmin`). A missing or rejected token is 401. The token's user is resolved to one account. Requests do not accept an account id.

**Status (updated 2026-11-20, web at PR #162).** The menu designer catalog, preview and switch routes for Flutter parity are in **Menu designer API** below. The web menu designer is live for every customer: `LAYOUT_STUDIO=1` in production, and `MENU_TEMPLATES` / `UNIFIED_MENU_EDITOR` default to everyone (PR #153). Most new boards are therefore web-designer boards (`content.layoutVersion === 1`), which the classic menu routes refuse to edit (409). Read **Menu boards** below before touching menus. Changes the app must handle since Android +14 are listed in **Changes since +14**.

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
| `POST /api/media` | Multipart image. JPG, PNG, or WebP. Returns `{ id }` | same |
| `DELETE /api/media/:id` | Delete if this account owns it and nothing uses it. **409** when a playlist uses it (`error` names the playlists), or (PR #158) **409 `code: "media_in_use"`** when a menu board (item photo, classic side photo, layout image/video/logo), a promotion, or the Brand Kit logo uses it. `error` names them and is localized. Show it as-is | `app/api/media/[id]/route.ts`, `lib/server/media-references.ts` |
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
| Original layout (7) | `content.layoutVersion === 1`, no `design` | `LayoutDocument` (`lib/layout-studio.ts`): `layoutVersion: 1, template ∈ {two-column, menu-promo-67, two-menu-promo, triple-column, split-50, menu-banner, signature}, split, title, subtitle, footer, sections, imageMediaId, videoMediaId, palette, primaryColor, accentColor, typeScale, font, bodyFont?, textColor, backgroundColor, featureTitle, featureDetail, columnWidths, imageFit, imageAnchor`; items may have `imageMediaId` | `POST /api/layout-studio {mode: "draft"\|"publish", menuId, name, document}` | Rename, assign. **Content edits refused (409)** |
| Professional template (22) | `content.layoutVersion === 1` **and** `content.design` | `LayoutDocument` + `design` (template id), `variant`, `stockPhoto?`, `logoMediaId?`, `photoStyle?: "thumbs"\|"text"`; items may have `imageMediaId` and `stockPhoto` | same as layouts | same as layouts |

Rules for clients:

1. **Branch on `content.layoutVersion === 1`, never on `template`.** For web-designer boards `menus.template` holds the palette (`classic` / `fresh` / `bold`), so it looks like a classic board.
2. **409 protection.** `PATCH /api/menus/:id` with `content` or `template` on a `layoutVersion: 1` board returns **409** "This menu board was made in the web editor. Edit it at pekkotv.com." Nothing is written. `name` and `displayIds` still work (`displayIds` is additive, see above). `POST /api/brand/apply` skips these boards.
3. **Nullable ids.** A web-designer board saved as a draft and never published has **`playlistId: null`**; its `mediaId` / `imageUrl` are the draft preview still (not on any screen) or null. Published boards always have both. Treat all three as nullable; label `playlistId == null` as "Draft" and don't offer screen assignment until it is published.
4. **Unknown keys.** Parse tolerantly. New optional keys are additive.
5. **Lossless classic edits.** The server keeps what an older client omits: `headingFont` / `bodyFont` and `itemPhotos` when the key is absent, and an item's `imageMediaId` when the item is sent without that key (matched by section name or position, then item **name**, first match). An explicit `null` clears. Renaming an item on a client that omits `imageMediaId` therefore loses that item's photo: send `imageMediaId` back unchanged (keep each item's raw JSON).
6. **Item photos** must be this account's own JPEG/PNG/WebP (`media` ids); others are dropped on save. Limits: 4 sections, 12 items per section, 24 items in total for classic boards.

Template ids (`lib/menu-designs.ts`): `modern-restaurant, trattoria, cocktail-lounge, coffee-shop, bakery, brunch-house, espresso-bar, bold-fast-casual, pizza-night, smokehouse-bbq, happy-hour, morning-rush, taqueria, diner-classics, chalkboard-bistro, juice-bar, ice-cream-parlor, boba-tea, photo-menu-grid, cafe-favorites, taqueria-specials, featured-dishes`. Fonts (`lib/board-fonts.ts`): `inter, noto-serif, oswald, montserrat, bebas-neue, lobster`. `GET /api/menu-templates` → `{ enabled, unified }` says whether the account has the designer (true for everyone today).

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
| `GET /api/menu-templates/catalog` | Bearer | Gallery: filters, 30 entries, seeds | `app/api/menu-templates/catalog/route.ts` |
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
    "business":  [{ "id": "all", "name": { "en": "All", "es": "Todos" } }, ... "restaurant", "cafe", "fast", "bar", "sweets"],
    "style":     [ "all", "dark", "light", "bold" ],             // same {id, name{en,es}} objects
    "structure": [ "all", "single", "columns", "media", "cards" ]
  },
  "fonts": ["inter", "noto-serif", "oswald", "montserrat", "bebas-neue", "lobster"],
  "entries": [
    {
      "id": "modern-restaurant",       // stable; also the value of content.design on saved boards
      "kind": "template",              // "template" (22) | "classic" (1, id "full-screen") | "layout" (7)
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

- **Order** is the web gallery's: 22 templates, the classic board, then 7 layouts. Filter exactly like the web: business `all` or equal or entry `any`; style `all` or equal; structure `all` or equal; photos toggle → `photos === true`.
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
  "suggestions": { "roomierTemplate": "diner-classics", "canMergeSections": false }   // the web editor's fix buttons
}
```

### Editing flow for the app

1. `GET /api/layout-studio` → `boards[]` (`id, name, document, mediaId, playlistId, updatedAt`) and `library[]` (`id, name, kind, mime, url, sizeBytes`; `url` is a 1-hour signed URL). Upload new images with the existing media upload routes.
2. Edit the document locally. Keep every field you don't edit untouched (send the whole document back). Limits: 4 sections, 12 items per section, 24 items; text limits in `MENU_LIMITS` (`lib/menu-templates.ts`).
3. `preview {format: "fit"}` while editing; `preview` PNG on demand; `switch` for "Change design".
4. Save with `POST /api/layout-studio {mode: "draft"}`; publish with `{mode: "publish", menuId}`. Publishing a template that drops items returns 400 ("N items don't fit on the screen…"); check `fit.canPublish` first.
5. Assign screens with `PATCH /api/menus/:id { displayIds }` (additive) or `POST /api/layout-studio/assign { menuId, displayId }` after the first publish.

## Billing status, read only

`GET /api/entitlements` is the status read (`lib/server/entitlements.ts` `toResponse`). Fields include `state`, `plan`, `plan_name`, `screen_limit`, `active_screens`, `total_screens`, `can_add_screen`, `playback_allowed`, `trial`, `subscription`, `grace_ends_at`, `suspend_at`, `warning`, `enforced`, `server_time`. `enforced` is true only when `BILLING_ENFORCE` is exactly `1`. A dashboard read does not start the existing-customer clock.

`GET /api/billing/checkout` returns `{ available }` and no secrets. `POST /api/billing/checkout` starts a Stripe session for the website. `POST /api/billing/webhook` is Stripe's. Neither is a status read.

`GET /api/entitlements/active-screens` and `POST /api/entitlements/active-screens` choose which screens stay on when a plan is over its limit. That writes. A status display does not need it.

## Deletion

`GET /api/account/deletion` returns `{ enabled, delayDays, request }`. `enabled` is true only when `ACCOUNT_DELETION` is exactly `1`. The delay is 7 days (`lib/server/account-deletion.ts`). `POST` with `{ confirm: "DELETE", password }` schedules deletion. `DELETE` cancels a pending request. While the flag is off, `POST` returns 503 `disabled`. Only the account owner can call these.

## Errors and offline

The TV reports a playback error with `POST /api/player/state` and header `X-Display-Token`. The phone does not send that. `GET /api/displays` returns `playerError` for the owner.

Offline playback is inside the TV page: Cache Storage `seemple-media-v1`, last saved playlist, images only (`public/player.html` `playSaved`, `public/player-sw.js`). There is no management API for an offline pack. A phone that cannot reach the API shows its own network error. It does not cache the screen's media as a second player.

## Changes since Android +14 (web PRs #148–#162)

| Change | What the app sees | PR |
| --- | --- | --- |
| Web menu designer for everyone; most new boards are `layoutVersion: 1` | New board kinds in `GET /api/menus`, content edits 409, draft boards with `playlistId: null` | #148, #151, #153 |
| Item photos on every board kind | Optional `imageMediaId` on items, `itemPhotos: false`, `photoStyle`; kept when omitted | #149, #151 |
| `PATCH /api/menus/:id {displayIds}` is additive | Existing screens are no longer removed; `replace: true` for the old behaviour | #157 |
| `DELETE /api/media/:id` checks menus, promotions, Brand Kit logo | New 409 `media_in_use` | #158 |
| Web-designer board publish swaps the right image | No contract change | #159 |
| Setup step 8 stays done after a TV confirmed content | Same `GET /api/onboarding` shape | #147 |
| `GET /api/health` returns `commit` | Additive | #153 |
| Menu designer API: catalog, public thumbnails, switch, preview + fit | New routes only | #162 |

No route was removed or renamed, no response field was removed, and the TV player and `/api/player/*` are unchanged.

## Flags in production

These flags are off unless the value is exactly `1`:

| Flag | Effect when not exactly `1` | Source |
| --- | --- | --- |
| `BILLING_ENFORCE` | Entitlement reads still work. Screens are not paused for billing | `lib/server/entitlements.ts` |
| `BILLING_REMINDERS` | The reminder job sends nothing | `app/api/cron/billing-reminders/route.ts` |
| `ACCOUNT_DELETION` | Status can be read. Scheduling deletion returns 503 | `lib/server/account-deletion.ts` |
| `LAYOUT_STUDIO` | **On (`1`) in production.** If turned off: no composition on the player, and `GET` / `POST /api/layout-studio`, `/boards`, `/assign`, `/preview` and `POST /api/menu-templates/switch` return 404 before a database call | `lib/layout-studio.ts`, `app/api/layout-studio/route.ts` |

`MENU_TEMPLATES` and `UNIFIED_MENU_EDITOR`: unset = everyone (current production), `developers`, a list of emails/account ids, `all`, or `off` (`lib/menu-templates-flag.ts`).

Web-designer internals (the phone does not need these to assign or rename boards):

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
