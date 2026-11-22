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
| `first_menu` | yes | saved board with ≥1 named item or featured photo/video (draft OK), or a ready top-level upload. Not `(menu).png`/`(promo).png` stills, slides, converting or failed files |
| `preview_menu` | yes | client `recordStep` (open a saved board / tap Preview), or the PNG preview API |
| `customize_menu` | no (optional) | board has custom look settings, or `recordStep` |
| `screen` | yes | a TV paired (any time, even first) |
| `show_on_tv` | yes | content published to a TV |
| `first_update` | yes | the same TV received a second content change |
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
