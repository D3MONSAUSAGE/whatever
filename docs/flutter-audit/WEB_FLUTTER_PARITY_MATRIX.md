# Web ↔ Flutter parity matrix and compatibility review

Audit date: 2026-11-20. Web at `398ec74` (= production).

**The Flutter source was not available** (see `FLUTTER_FEATURE_AUDIT.md`). The Flutter column says what the backend proves about the app (**Evidenced**) or is marked **Unverified**. Parity status values: Complete / Partial / Missing / Incompatible / Web-only / Unverified. A status other than Unverified is used only where backend evidence supports it.

## 1. Parity matrix

| # | Feature | Web (current) | Flutter (known) | Parity | What Flutter needs | Prio | Complexity | Data risk | Sources |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Sign up / sign in / reset / global sign-out | Supabase; new sign-up design; email confirm off | Supabase Flutter; reset deep link `seemple://`; +13 sign-up redirect evidenced | Unverified (likely Complete) | Verify flows against production; no API change in Claude era | P1 | S | None | `docs/ACCOUNT_AND_AUTH.md`, `lib/auth-confirm.ts` |
| 2 | Setup tracker | 8 steps; step 8 sticky after TV confirmation (#147) | Shared `/api/onboarding` | Complete if wired (gets the fix automatically) | None, or remove any client-side "online now" logic for step 8 | P2 | S | None | `lib/server/onboarding.ts` |
| 3 | Pair a TV | Code + name; `nameWarning` | Documented contract | Unverified | Handle `nameWarning` / `suggestedName`, 429, `screen_limit`, `subscription_inactive` | P1 | S | None | `app/api/displays/pair` |
| 4 | Screen list | Status, content, thumbnail, sync, search/filter at 4+ | Strict row parsing (+10) | Partial (search/filter is web-only today) | Add search and status filter; tolerate additive fields | P2 | S | List fails on a bad type | `GET /api/displays`, `lib/screen-filter.ts` |
| 5 | Screen detail / change content / reconnect / remove | Panels; timeline; reconnect | Contract documented | Unverified | Verify; add reconnect (`POST /api/displays/:id/reconnect`) if missing | P1 | M | None | `components/my-screens.tsx`, `components/screen-actions.tsx` |
| 6 | Publish with `replace` / `willBeCleared` | Preview then commit | Listed as "app addition" | Unverified | Must use `/api/displays/publish` preview → commit; never the legacy clearing path by accident | P1 | M | Clearing screens unintentionally | `docs/FLUTTER_MANAGEMENT.md` |
| 7 | Screen groups, locations | Full CRUD | Contract documented | Unverified | Verify | P2 | S | None | `/api/screen-groups`, `/api/locations` |
| 8 | Remote (manual slideshow) | No web UI | API built for the phone | App-only (likely) | Keep | — | — | None | `docs/REMOTE_CONTROL_API.md` |
| 9 | Media upload (image / MP4 / presentation) | All three | Unverified | Unverified | Verify image + MP4 signed-upload flow; presentation optional | P1 | M | None | `/api/media*` |
| 10 | Media delete | Refuses only when in a playlist | Unverified | — | Warn before deleting a photo used in menus (until the backend check exists, R4) | P1 | S | **Silent loss of item photos / logo** | `app/api/media/[id]/route.ts` |
| 11 | Playlists (draft/publish, durations, manual mode) | Full | Unverified | Unverified | Verify | P1 | M | None | `/api/playlists*` |
| 12 | Schedules / day parts | Full | Unverified | Unverified | Verify | P2 | M | None | `/api/schedules*` |
| 13 | **Menu board list** | All 3 kinds; raw `content`; draft boards have `playlistId: null` | Evidenced: edits classic menus | **Incompatible risk** (unverified parse) | Tolerant model; branch on `content.layoutVersion === 1`; accept null `playlistId` / `mediaId` / `imageUrl` | **P0** | S | Whole menu list may fail | `GET /api/menus`, `lib/server/menus.ts` `menuView` |
| 14 | **Edit classic board** | Unified editor; item photos; hide photos; fonts | Evidenced: edits text/prices; omits font and photo keys | Partial | Preserve unknown keys on round-trip (`imageMediaId`, `itemPhotos`, fonts); don't rely on name matching | **P0** | M | Photo lost on item rename (R3) | `lib/menu-templates.ts` `keepStoredItemPhotos` |
| 15 | **Edit template / layout board** | Guided editor (Business, Menu, Photos, Look, Advanced), draft + publish | Server refuses (409) | **Missing** (safe) | Short term: show read-only + "Edit on the web", allow rename and assign. Long term: edit text/prices/photos through `POST /api/layout-studio` | **P0** (read-only) / P1 (edit) | S / L | None (server-guarded) | `app/api/menus/[id]/route.ts` (409), `lib/server/layout-boards.ts` |
| 16 | Create board from template gallery | 22 templates + 7 layouts + classic | Classic only (evidenced via `POST /api/menus`) | Missing | Gallery with server-rendered thumbnails; create through `POST /api/layout-studio {mode}` | P1 | L | None | `lib/menu-designs.ts`, `/api/layout-studio` |
| 17 | Food-item photos | Upload / pick / replace / remove; show or hide | None (keys omitted) | Missing | Per-item photo control (reuse media upload); send `imageMediaId` / `null` explicitly | P1 | M | None if the key is sent explicitly | `lib/menu-item-photos.ts`, `components/menu-templates.tsx` |
| 18 | Board preview | Exact TV SVG/PNG | Shows `imageUrl` (signed PNG), likely | Partial | Show `imageUrl`; mark never-published boards as "Draft" (`playlistId == null`) | P2 | S | Showing a draft as if live | `menuView` |
| 19 | Show board on screens | `POST /api/layout-studio/assign` (layout) / `displayIds` on menus | Rename + assign allowed on web boards | Unverified | Use `/api/layout-studio/assign` for layout boards; `PATCH /api/menus/:id {displayIds}` also works | P1 | S | None | both routes |
| 20 | Brand Kit | Identity, colors, logo, fonts; apply (classic only) | Evidenced: PUT colors + logo | Partial | Keep the 3-key PUT; explain that "Apply" updates classic boards only | P2 | S | None (merge-safe PUT) | `app/api/brand`, `lib/brand-kit.ts` |
| 21 | Alerts / notification center | Bell + list + preferences | Push evidenced; in-app list unverified | Partial | In-app alert list (`/api/alerts`, `/read`), match web wording | P2 | M | None | `/api/alerts*` |
| 22 | Push notifications | n/a | Evidenced | App-only | Keep | — | — | None | `docs/PUSH.md` |
| 23 | Plan / trial status | Billing page, chip, warnings | Status-only copy evidenced (+14) | Complete (policy) | Keep status-only; show `warning.message` as-is | P2 | S | None | `/api/entitlements`, `android-status-copy.ts` |
| 24 | Purchase / portal | Stripe | Not in app (policy) | Web-only | — | — | — | — | `docs/billing/entitlement-api.md` §8 |
| 25 | Over-limit screen selection | `/api/entitlements/active-screens` | Mapped from `warning.action = select_screens` | Unverified | Verify | P2 | S | Pausing wrong screens | same |
| 26 | Account deletion | Settings → delete (flagged) | Contract documented | Unverified | Verify (store-policy requirement) | P1 | S | None | `/api/account/deletion` |
| 27 | Analytics (screen reliability) | Analytics page | Unverified | Unverified | Optional summary | P3 | M | None | `/api/analytics/*` |
| 28 | Spanish | Full EN/ES | Unverified | Unverified | Match web terms (`lib/i18n/es.ts`) | P2 | M | None | `lib/i18n` |
| 29 | Marketing, SEO, funnel, developer console | Yes | n/a | Web-only | — | — | — | — | — |

## 2. Backend and data compatibility (Part 5)

**No API was removed or renamed in the Claude era.** The Claude-era backend changes are:
- additive JSON fields in `menus.content`;
- one new read endpoint (`/api/menu-templates`);
- analytics-only migrations 0031/0032 and routes;
- `/api/health` gaining `commit`;
- new guards in `PATCH /api/menus/:id` and `POST /api/brand/apply`.

TV, pairing, playlists, scheduling, screen groups, media upload, billing, push and deletion contracts are unchanged. An older app build keeps working for everything except editing web-designer boards, which the server refuses safely.

### Risk register

| ID | Scenario | Severity | Status today | Safeguard |
| --- | --- | --- | --- | --- |
| R1 | The app opens a template/layout board in its classic editor (the content shape is similar) and saves | High (UX) | **Guarded**: 409 "This menu board was made in the web editor. Edit it at pekkotv.com." No data change. Before #149 this overwrote the board. | App: detect `content.layoutVersion === 1` → read-only view with rename and assign. Optional backend: additive `kind` field on menu rows |
| R2 | `GET /api/menus` contains boards with `playlistId: null` (draft never published), `design` / `stockPhoto` / `logoMediaId` keys, and items with `stockPhoto` | High (availability), **unverified** | Common since #153 (designer for everyone) | App: tolerant JSON model (nullable ids, ignore unknown keys). Test against a fixture from every board kind |
| R3 | The app renames an item, or two items share a name, on a classic board with item photos | Medium (data) | Partially guarded: a photo is kept only for an item with the same name in the same section | App: round-trip each item's raw JSON and send `imageMediaId` back. Backend option: match by item id (would need ids, a schema change) |
| R4 | Web or app deletes a media file used as an item photo, a Brand Kit logo or a layout image | Medium (data, both platforms) | **Not guarded**: delete only checks playlists. The TV image stays until the next save, then the photo is silently dropped (`keepOwnItemPhotos`) | Backend: extend the in-use check to `menus.content` item photos / `imageMediaId` / `logoMediaId` and `brand_kits.logo_media_id`. App: confirm dialog meanwhile |
| R5 | The app edits a classic board without font, `itemPhotos` or photo keys | Low | **Guarded** (`keepStoredFonts`, `keepStoredItemPhotos`, tests) | Keep sending absent keys only when unknown; send explicit `null` to clear |
| R6 | The app runs Brand "Apply to all menus" | Low | Web boards skipped by design | App copy: "Updates classic menus. Boards made in the web designer use the Look step." |
| R7 | The owner switches a classic board to a layout on the web | Low | By design it becomes a layout board, and the app becomes read-only for it | Same handling as R1 |
| R8 | The app shows a layout board's draft preview as if it were on screen | Low | `imageUrl` is the latest saved still (draft or published) | App: label "Draft" when `playlistId == null`. Backend option: `publishedMediaId` / `hasDraft` fields |
| R9 | The app adds a custom User-Agent | Low | Status-only copy keys on the default `Dart/` UA (Android and iOS Flutter builds both send it) or `X-Pekko-Client: android/...` | If the UA changes, send `X-Pekko-Client: android/<version>`. An `ios/...` value is not matched today (`isAndroidAppRequest`); it needs a backend update before iOS uses a custom header |
| R10 | The Flutter bot follows the outdated `docs/FLUTTER_MANAGEMENT.md` (says Layout Studio is flag-off / experimental) | Medium (process) | Doc is stale: `LAYOUT_STUDIO` is on and web boards are the default | Update the doc (web change, separate PR) before Flutter work starts |
| R11 | Strict parsing of `GET /api/displays` | Medium | No Claude-era change to this contract | Keep tolerant parsing; additive fields only |

### Authentication and authorization
Unchanged: Bearer Supabase access token; one account per user; owner-only for deletion. Claude added no new authenticated mutation used by the app.

### Subscription limits
Unchanged logic. `enforced` depends on `BILLING_ENFORCE`; the production value was not verified in this audit. Pairing can return `screen_limit` / `subscription_inactive` when enforcement is on.

### Error handling to support
- 409 on board edit (R1).
- 409 on media delete (in a playlist).
- 429 (rate limits on uploads/publish/pairing).
- 503 `MENUS_UNAVAILABLE` / push unavailable.
- Status-only rewritten billing messages.
- Localized `error` text: the server localizes for `es`.
