# Flutter catch-up roadmap

Audit date: 2026-11-20. Web at `398ec74`.

**Step 0 for the Flutter bot:** this roadmap was written without access to the Dart source (`FLUTTER_FEATURE_AUDIT.md`). Before starting, inventory the app and mark each task below as *already done* / *partial* / *todo*. "Likely affected components" are not given because they couldn't be verified; name them in that inventory.

Ground rules (from the web side):
- Never call `/api/player/*` and never store a display token.
- Never send a field you don't understand back as a different value. Omit it, or round-trip it untouched.
- `content.layoutVersion === 1` means a web-designer board. `menus.template` does **not** tell board kinds apart.
- All endpoints are on `https://pekkotv.com` (`GET /api/config`).
- Billing stays status-only in the app.

## P0: Compatibility and data safety

### P0-1 · Tolerant menu-board model
- **Behavior:** `GET /api/menus` and `GET /api/menus/:id` parse every board the web can create without failing the list:
  - classic `MenuContent`;
  - layout `LayoutDocument` (`layoutVersion: 1`, any of the 7 `template` ids);
  - template boards (extra `design`, `variant`, `stockPhoto`, `logoMediaId`, `photoStyle`; items with `imageMediaId` / `stockPhoto`).
  - `mediaId`, `playlistId` and `imageUrl` may each be null (a draft board that was never published has `playlistId: null`).
- **Web reference:** `lib/server/menus.ts` `menuView`; `lib/menu-templates.ts` (`MenuContent`); `lib/layout-studio.ts` (`LayoutDocument`); `lib/menu-board-unify.ts` `classifyBoardContent`.
- **API:** unchanged.
- **Acceptance:** a list containing one board of each kind (including a never-published draft) renders; no exception; each board shows its name and image (or a placeholder when `imageUrl` is null).
- **Regression tests:** JSON fixtures for classic, classic with item photos and `itemPhotos:false`, each layout template, a template board with photos and a logo, and a draft with null ids. Captured from production via `GET /api/menus` on a test account.
- **Complexity:** S.

### P0-2 · Web-designer boards are read-only in the app
- **Behavior:** a board with `content.layoutVersion === 1` opens a read-only view: preview image, "Edit on pekkotv.com" message, Rename, and Show on screens. The classic editor is never offered for it.
- **Web reference:** `app/api/menus/[id]/route.ts` (409 branch; rename and `displayIds` still allowed); `POST /api/layout-studio/assign`.
- **API:** `PATCH /api/menus/:id {name}`; `PATCH /api/menus/:id {displayIds}` or `POST /api/layout-studio/assign {menuId, displayId}`.
- **Acceptance:** the app can't send `content` / `template` for these boards. Rename and assign succeed. If a 409 still arrives (old build path), it shows the server message and keeps local edits uncommitted.
- **Tests:** a widget test for routing by `layoutVersion`; an integration test proving no `PATCH` with `content` is sent for a layout board.
- **Complexity:** S.

### P0-3 · Lossless classic-board editing
- **Behavior:** editing a classic board preserves everything the app doesn't edit: `headingFont`, `bodyFont`, `itemPhotos`, `photoMediaId`, `useBrand`, and each item's `imageMediaId`, even when the user renames or reorders items or sections.
- **Implementation hint:** keep each item's original JSON map and merge edited fields into it. Don't rebuild items from a narrow model.
- **Web reference:** server-side guards `keepStoredFonts`, `keepStoredItemPhotos` (match by section, then item name, so a rename on the phone currently loses the photo), `keepOwnItemPhotos`.
- **API:** `PATCH /api/menus/:id {content}`.
- **Acceptance:** for a classic board created on the web with fonts, two item photos and hidden photos, editing on the phone with a price change, an item rename and an item move keeps all photos on the right items, the fonts and the hide setting (check `GET /api/menus/:id` afterwards).
- **Tests:** a round-trip unit test on the model; an API test against staging (or a local backend) mirroring `tests/api/unified-editor-flows.test.ts` › "an Android edit keeps the photos".
- **Complexity:** M.

### P0-4 · Safe media delete
- **Behavior:** before deleting an image, warn when it may be used as a menu item photo or the logo, because the server doesn't block that today. Show 409 playlist messages as sent.
- **Web reference:** `app/api/media/[id]/route.ts` (playlist check only).
- **API:** `DELETE /api/media/:id`. Recommended web/backend follow-up, outside Flutter scope: extend the in-use check to menu content and the brand logo (risk R4).
- **Acceptance:** a delete confirmation explains the risk; a 409 shows the server text.
- **Complexity:** S.

### P0-5 · Contract hygiene
- **Behavior:**
  - Tolerant parsing of `GET /api/displays` (additive fields: `reportedState`, `contentVersion`, `acknowledgedAt`, `playingAt`, `nextChange`, `boardPreviewUrl`).
  - Keep the default Dio User-Agent, or add `X-Pekko-Client: android/<version>`, so status-only billing text keeps working.
  - Show `warning.message` and `error` text as returned (they are localized server-side).
- **Acceptance:** fixture tests with every additive field present and absent.
- **Complexity:** S.

**Dependency for the web team before P0 starts:** update `docs/FLUTTER_MANAGEMENT.md`, which still calls Layout Studio flag-off and experimental. In production, `LAYOUT_STUDIO` is on and the web designer is the default for every customer.

## P1: Essential parity

### P1-1 · Show boards on screens, and publish correctly
- **Behavior:** assign any board (classic or web) to screens; for playlists use the preview → commit flow with `replace` and show `willBeCleared`.
- **API:** `POST /api/layout-studio/assign`, `POST /api/displays/publish {playlistId, displayIds|groupId, commit, replace}`.
- **Acceptance:** assigning one screen never removes other screens from the same playlist unless the user chose "replace".
- **Complexity:** M.

### P1-2 · Food-item photos on classic boards (phone editing)
- **Behavior:** per item: add a photo (camera or gallery → `POST /api/media`), choose from the library, replace, remove (send `imageMediaId: null`), and a show/hide toggle (`itemPhotos`).
- **Web reference:** `lib/menu-item-photos.ts`, item photo control in `components/menu-templates.tsx`.
- **Acceptance:** the photo shows on the TV image after save (`imageUrl` refreshes); hiding keeps the photos.
- **Complexity:** M.

### P1-3 · Edit text, prices and photos of web-designer boards (replaces P0-2's read-only view)
- **Behavior:** edit the business name, section names, items (name, price, description, photo) of layout and template boards; Save draft / Publish.
- **Constraint:** send back the whole `LayoutDocument` with every field the app didn't change untouched; never drop `design` / `variant` / colours / fonts / `columnWidths` etc.
- **API:** `POST /api/layout-studio {mode: "draft"|"publish", menuId, name, document}`. The server renders the PNG and enforces ownership and "fits" rules. Errors: 400 with a message (show it).
- **Reference:** `lib/server/layout-boards.ts`, `lib/menu-designer.ts`, `components/menu-templates.tsx` `TemplateEditor`.
- **Acceptance:** edit on the phone, reopen on the web: identical except the edited fields; the TV updates after Publish.
- **Complexity:** L. Gate it behind an app flag until verified.

### P1-4 · Create from the template gallery
- **Behavior:** pick from the 22 templates (filters by business type and style), seeded with the template's sample content; then P1-3 editing.
- **Implementation note:** the document seed lives in the web code (`lib/menu-designs.ts` `designDocument`). The app either mirrors it or uses a new server endpoint (recommended, web follow-up: `GET /api/menu-templates/catalog` with thumbnails and seed documents) so templates are never duplicated in Dart.
- **Acceptance:** a board created on the phone looks identical on the TV to one created on the web from the same template.
- **Complexity:** L (M once a catalog endpoint exists).

### P1-5 · Verify core flows end to end
- Pairing (with `nameWarning`); remove screen; reconnect a TV.
- Media upload: image, and MP4 via signed URL.
- Playlists; schedules.
- Account deletion; password reset.
- **Acceptance:** a scripted QA pass against a test account; each flow listed as pass/fail.
- **Complexity:** M.

## P2: UX and visual consistency (Part 6)

The web's established direction (PRs #142–#146, `app/globals.css` tokens):
- **Colors and type:** primary `#1a5cff`, navy `#040916` / `#081230` / `#0e1c45`, cyan accent; Montserrat for headings, Inter for body.
- **Structure:** one primary action per card; secondary actions in a ⋯ menu.
- **Patterns:** segmented controls for filters; a notification center for alerts and billing.
- **Copy:** plain EN/ES wording.

Recommendations (verify against the app's current screens first):
1. Same names as the web: My Screens, Menu Boards, Content, Playlists, Schedules, Account, Brand Kit.
2. Screen card: status pill (Online / Offline · N days / Waiting), content line, thumbnail, primary "Change content", ⋯ for Schedule / Edit playlist / Open screen.
3. Screen search and status filter at 4+ screens (`lib/screen-filter.ts` logic).
4. In-app alert list and badge using `/api/alerts`, matching the web notification center.
5. Setup tracker using `/api/onboarding` only (no client-side "online now" logic).
6. Plan status: show the server `warning.message` (status-only).
7. Spanish strings aligned with `lib/i18n/es.ts` (usted form).

Acceptance: a side-by-side screenshot review of web and app for My Screens, a screen, Menu Boards, a board, and Account.

## P3: Optional

- Analytics summary (`/api/analytics/summary`).
- Presentation detail editing (per-slide duration).
- Promotions.
- Remote improvements.
- iOS release (backend already accepts `platform: "ios"` for push).
- Native template preview rendering (only if the server PNG is too slow; the web renderer is SVG and would have to be mirrored exactly).

## Suggested phases

1. **Phase A (P0, about a week):** tolerant models, read-only web boards, lossless classic editing, safe delete, contract fixtures.
2. **Phase B (P1-1, P1-2, P1-5):** assignment/publish correctness, item photos, QA pass.
3. **Phase C (P1-3, P1-4):** edit and create web-designer boards (after a catalog endpoint is decided).
4. **Phase D (P2/P3).**

## Web-side follow-ups that unblock Flutter (separate, not done in this audit)

1. Update `docs/FLUTTER_MANAGEMENT.md` (Layout Studio on; menu board kinds; 409; draft boards).
2. Extend the media in-use check to item photos and logos (R4).
3. Optional additive fields on menu rows: `kind: "classic"|"layout"|"template"`, `editable: {app: boolean}`, `published: boolean`.
4. Optional `GET /api/menu-templates/catalog` (template ids, names EN/ES, filters, thumbnail URLs, seed documents).
