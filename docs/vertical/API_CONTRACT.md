# Vertical (9:16) menu boards — API contract

Status: PR A (contract/backend). Web editor + renderers: PR B. TV player: PR C. Approved by Francisco (t413u); reviewed by Gother (GO-with-notes, CONTRACT_REVIEW).
Source of truth in code: `lib/board-orientation.ts`. Tests: `tests/api/vertical-orientation.test.ts`.

## Principles
- Existing boards, templates, screens and player payloads are unchanged. Nothing is migrated in `menus`.
- Pekko never rotates a TV. A screen's orientation is what the owner says about how it is mounted/set up; it drives guidance and warnings only.
- Orientation mismatches never block publishing or playback and never stretch content.
- Changing a board's orientation is for **capable clients only**; older clients can never silently turn a vertical board horizontal (no silent data loss).

## Board orientation (in `menus.content`)
- `LayoutDocument.orientation?: "portrait"` and `MenuContent.orientation?: "portrait"`. Absent = landscape. Only `"portrait"` is ever stored; an explicit `"landscape"` is canonicalized to absent, so landscape documents keep their exact shape.
- Canvas: landscape 1920×1080, portrait 1080×1920.
- Parsers keep the key when it is `"portrait"`. Unknown values (`"sideways"`, numbers…) count as omitted — never a 400.
- Catalog seeds (`GET /api/menu-templates/catalog`, `create` bodies) stay landscape (no `orientation` key).
- `POST /api/menu-templates/switch` and `switchDesign`/`switchToLayout` keep `orientation`. `fit` (BoardFit) adds `canvasWidth`/`canvasHeight`.

## Client capability: `X-Pekko-Client-Caps: orientation`
- The **only** signal. Comma-separated, case-insensitive (`X-Pekko-Client-Caps: foo, orientation`). A missing header means not capable. User-Agent and `X-Pekko-Client` are never used.
- The web app sends it on every `api()` call (`lib/api.ts`), shipped with this PR.
- Android/Flutter: send it only from the build that can show and keep vertical boards.

## Saving content
Applies to `POST /api/layout-studio` (draft and publish, with or without `menuId`), `POST /api/menus` and `PATCH /api/menus/:id`.

| Case | Result |
|---|---|
| New board, capable client sends `"portrait"` | Vertical board |
| New board, anything else (older client, omitted, unknown) | Landscape (200/201 as today) |
| Existing board, capable client omits the key / sends unknown | Stored orientation kept (preserve on omit) |
| Existing board, capable client sends `"landscape"` | Board becomes horizontal (explicit reset) |
| Existing **landscape** board, older client | Saved as today, stays landscape |
| Existing **portrait** board, older client: layout-studio draft/publish, classic `content` or `template` PATCH | **409**, nothing written |
| Rename (`{name}`), screen assignment (`displayIds`, `POST /api/layout-studio/assign`), delete, previews | Never 409, never need the capability; orientation untouched |

409 body:
```json
{ "error": "This menu board is vertical. Edit it at pekkotv.com, or update the app to change it here.", "code": "orientation_unsupported" }
```
Spanish (`Accept-Language: es` or the account locale):
`"Este menú es vertical. Edítelo en pekkotv.com, o actualice la aplicación para cambiarlo aquí."`

## Rendered media
- Board renders are stored with their real PNG size in `media.width/height` (1920×1080 or 1080×1920).
- `POST /api/layout-studio/preview` / `/api/menus/preview`: `w` stays the PNG **width**; height follows the board's aspect (portrait `w=960` → 960×1707; `w>=1080` → native 1080×1920). Portrait drawing shipped in PR B.
- `GET /api/menu-templates/thumbnail/:id?orientation=portrait` (PR B): 9:16 sample, widths 320|640|960|1080; `orientation=landscape` is a no-op (redirects to the normal landscape URL); any other value is 404; ships with the portrait renderer and a `CATALOG_RENDER_REVISION` bump (thumbnails are CDN-cached immutably for a year, so the parameter must not exist before portrait drawing does).

## Screens (`displays.orientation`, migration 0037)
- `GET /api/displays` and `GET /api/displays/:id` add `orientation: "landscape" | "portrait"` and `reportedViewport: { width, height, at } | null` (the TV browser's last reported CSS viewport).
- `PATCH /api/displays/:id` stays partial. `{ orientation }` alone is valid and touches nothing else. `{ name }` alone never touches orientation. Invalid values → 400 `Choose horizontal or vertical.` Before 0037 is applied → 503 `Screen orientation isn't available yet. Try again after the next update.`
- `POST /api/displays/pair` `{ code, name }` stays valid and defaults to landscape. Optional `orientation: "portrait"`. Invalid values → 400 (before a code attempt is counted).
- Reconnect never resets the column.
- UI copy must say the owner sets the TV itself; Pekko can't rotate it.

## Mismatch warning
Assigning a vertical board to a horizontal screen (or the reverse) is allowed. Clients show a **non-blocking** warning (EN/ES); the board is letterboxed/pillarboxed, never stretched or cropped.

## Player (`GET/POST /api/player/state`)
- `displayOrientation: "portrait"` is added only for screens set up as vertical; landscape payloads are byte-identical to before.
- Playlist item `composition` adds `canvasWidth`/`canvasHeight` (1920×1080 or 1080×1920); older players ignore them.
- `POST { viewport: { width, height } }` (integers 1..20000) records the viewport. Informational only; never blocks playback. Before 0037 it is accepted and ignored. Invalid → 400 `bad viewport`.
