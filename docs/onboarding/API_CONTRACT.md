# Onboarding API contract (menu-first v2)

`GET /api/onboarding` (no query) is **v1**, unchanged for Android +17..+31: eight ids
`account, business, location, screen, media, playlist, publish, playing` and fields
`steps, completed, total, nextStep, dismissed, finished, show, firstLocationId`.
Only behaviour change: an account that finished v2 (`onboarding_completed_at` set) also reads `finished: true, show: false` in v1.

`GET /api/onboarding?v=2` is **v2**:

| field | type | notes |
|---|---|---|
| `version` | `2` | |
| `steps` | `{ id, done, required, optional, doneAt, confirmed? }[]` | 8 steps in this order; `doneAt` ISO (UTC, `Z`) or null; `confirmed` only on `show_on_tv` (a TV reported painting it) |
| `completed`, `total` | number | all 8 steps |
| `requiredCompleted`, `requiredTotal` | number | progress to show ("1 of 5 steps done") |
| `nextStep` | step id or null | first required step not done. Advisory only, never forced |
| `dismissed` | boolean | checklist hidden by the owner (same flag as v1) |
| `finished` | boolean | 5 required done, or `completedAt`, or finished under v1 rules |
| `completedAt` | ISO or null | stamped once |
| `show` | boolean | `!dismissed && !finished` |
| `showFirstSuccess` | boolean | show "Your first menu is ready!" once |
| `previewTarget` | `{kind:"menu_board",menuId}` \| `{kind:"upload",mediaId}` \| null | what "Preview menu" opens |

Step ids, in order:

| id | required | how it is earned |
|---|---|---|
| `first_menu` | yes | saved board with ≥1 non-blank item name (`sections[].items[].name`) or featured image/video (`imageMediaId`, `videoMediaId`, `photoMediaId`; drafts OK), or a ready top-level upload (`source_media_id is null` and `processing_status is null or 'ready'`). `stockPhoto` and `logoMediaId` alone do **not** count (they are template defaults), nor do `(menu).png`/`(promo).png` stills, slides, converting or failed files |
| `preview_menu` | yes | explicit `POST { recordStep: "preview_menu" }` (required for classic boards and uploaded media previews; web also calls it when opening a saved board), or a Layout Studio PNG preview (`POST /api/layout-studio/preview` when not `format: "fit"`), which stamps `preview_menu` server-side |
| `customize_menu` | no (optional) | board has custom look settings (`custom` keys other than `v`, or any of `primaryColor`, `accentColor`, `textColor`, `backgroundColor`), or `recordStep` |
| `screen` | yes | a TV paired (any time, even first) |
| `show_on_tv` | yes | content published to a TV |
| `first_update` | yes | server-derived only (not accepted by `recordStep`): `trg_displays_analytics` logs `screen.content_changed` in `activity_events` each time `displays.content_version` changes; `first_update` is earned when the **same screen** (`subject_id` non-null) has at least **2** `screen.content_changed` events (initial publish/assignment plus a later content change to that same TV). Publishing once to two different TVs does not earn `first_update` |
| `playlists` | no (optional) | an owner-made playlist with items (not a board's auto playlist), or `recordStep` |
| `schedules` | no (optional) | an enabled schedule, or `recordStep` |

Milestones are durable: once stamped they are never removed, even if the content is deleted.

`POST /api/onboarding[?v=2]` (response shape follows `?v`). Existing keys unchanged:
`{ dismissed: boolean }`, `{ confirmBusiness: true }`. New, additive:

- `{ dismissFirstSuccess: true }` → hides the success card on every device (first close time kept).
- `{ recordStep: "preview_menu" | "customize_menu" | "playlists" | "schedules" }` → stamps that step.
  Other ids → 400. Before migration 0036 → 503 "Setup progress isn't available yet."
- Body with none of the keys → 400 "Nothing to update."

Send `X-Pekko-Client: android` (or the Dart user agent) so first-party analytics tag the source as `android`.

## Pre-0036, Legacy Builds, and Rollback Behaviour

- **Before migration 0036 is applied:** `GET /api/onboarding?v=2` returns HTTP `200` with a usable derived payload (never 500): steps are derived live from existing tables, `doneAt` is `null`, `preview_menu` is derived from `first_menu` so callers are never blocked, `completedAt` is `null`, and `showFirstSuccess` is `false`. `POST { recordStep }` and `POST { dismissFirstSuccess }` return `503` `"Setup progress isn't available yet."`.
- **Legacy Android (+17..+31):** `GET /api/onboarding` (v1) sets `finished: true, show: false` for v2-finished accounts, hiding the Overview card. `More → Setup guide` on +17..+31 can still open the old wizard on an incomplete v1 step (such as `business`); this is accepted legacy behaviour for old builds.
- **Rollback caveat:** rolling back `0036_onboarding_milestones` drops `onboarding_milestones`, `onboarding_completed_at`, and `first_menu_celebrated_at`. Accounts that finished only the 5 v2 steps without completing all 8 v1 steps (for example `business` or `location`) would revert to v1 derivation and could see the old v1 setup card again until 0036 is re-applied or dismissed.
