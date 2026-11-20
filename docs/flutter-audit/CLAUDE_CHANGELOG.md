# Claude-era changelog (Pekko web + backend)

Audit date: 2026-11-20. Read-only. Source of truth: `git log origin/main` of `D3MONSAUSAGE/whatever` at `398ec74`, the merged PR commits, and the current code. Production commit at audit time (from `https://pekkotv.com/api/health`): `398ec74`.

## How the start point was established

- Claude's commits carry `Co-Authored-By: Claude <noreply@anthropic.com>` (33 commits on `main`); the ones made in this session also carry `Claude-Session: https://claude.ai/code/session_017fNRFjs9fEihZTfyRP1KeV`.
- The earliest such commit is `386ff2c` (2026-11-16 17:20 UTC, "Marketing redesign"), merged as **PR #136**.
- Everything before it is authored by "Pantalla (Grok Bot)", "Cursor Agent" or `cursor[bot]` (last pre-Claude merge: `d1d4aac`, PR #133, 2026-11-15). PRs #134–#135 do not appear on `main`.
- **Claude-era range: PR #136 → PR #156, 21 merged PRs, 2026-11-16 to 2026-11-18.** Diff `d1d4aac..398ec74`: 380 files, +18,674 / −1,486 lines (54 test files, +4,024).
- Limitation: authorship comes from commit trailers. Squash merges are authored by `D3MONSAUSAGE` with the Claude trailer in the body. The PR-level authorship (GitHub UI) was not read.

## Summary by area

| Area | Claude-era change in one line | Flutter impact |
| --- | --- | --- |
| Menu designer | 22 professional templates, a gallery, one guided editor for every board type, released to everyone | **Direct**: most new boards are now layout documents the app can't edit |
| Food-item photos | Optional photo per menu item on every board type | **Direct**: new optional JSON keys; server guards older clients |
| Data-safety guards | Classic `PATCH` keeps fonts/photos it wasn't sent; refuses content edits on web boards (409); Brand apply skips web boards | **Direct**: protects the app; the app must handle 409 |
| Onboarding | Step 8 "Check it's playing" stays done once a TV confirmed content | Indirect (same `/api/onboarding` shape, better result) |
| Dashboard UI | Navy shell, notification center, page headers, cards, dialogs, Spanish analytics, accessibility | Indirect (visual direction for P2) |
| Screens UI | Screen search/status filter (4+ screens), equal-height cards, menus no longer clipped | Indirect (parity candidates) |
| Playlists UI | Preview shows "Next slide in Ns" | None (web preview only) |
| Auth/signup | New sign-up page design (presentation only) | None (Supabase calls unchanged) |
| Marketing/SEO | New home page, Spanish URLs, robots/sitemap, structured data | None (website only) |
| Analytics | Cookieless website traffic (0031), signup funnel counts (0032), developer console redesign | None (web/console only) |
| Ops | `/api/health` returns the deployed commit; deployment runbook | None (ops) |
| TV player / pairing / billing / scheduling / playlists backend | **No changes** | None |

## Chronological inventory

Status key: **Deployed** = merged to `main` and served by production (`/api/health` = `398ec74` includes all of these). **Pending** = merged but needs an owner action. **Unverified** = not independently checked.

### PR #136 — Marketing redesign (2026-11-16) · Deployed · Flutter: none
- Before: light marketing pages.
- Changed: Home, Features, Pricing, FAQ, Support, Contact moved to a dark navy/blue look (styles scoped under `.mk`), with sample signage boards and EN/ES copy. Legal, dashboard, auth, billing, API and player code untouched.
- Now: superseded on the home page by PR #154 (the old home is kept as `home-classic.tsx`); the other marketing pages keep this design.
- Commits `386ff2c`, `64626b7`.

### PR #137 — SEO (2026-11-16) · Deployed · Flutter: none
- Changed: `robots.txt`, `sitemap.xml`, Spanish marketing URLs (`/es/...` via middleware rewrite), metadata rendered in `<head>`, structured data, `noindex` on `pantalla-chi.vercel.app`. The TV, API and redirects on that host are unchanged.
- Commit `47f4b25`.

### PR #138, #139 — Developer console redesign and Customer Accounts tab (2026-11-16) · Deployed · Flutter: none
- Changed: new `GET /api/developer/access` (developer-only, 404 for everyone else), a console redesign, and Customer Accounts as a tab. `/developer/*` answers 404 to non-developers.
- Commits `b34e955`, `922b410`.

### PR #140, #141 — Website traffic counter (2026-11-16) · Deployed (code) · Flutter: none
- Changed: cookieless page-view beacon on marketing pages, `POST /api/traffic/collect`, migration **0031** (`traffic_*` tables, service-role functions, rollback), and a console tab. #141 fixed a double-count race when a day closes.
- State: the owner indicated 0031 was applied in production. That was not independently verified in this audit.
- Commits `4b82c8a`, `3d07b0f`, `a99b613`.

### PR #142 — Redesign phase 0+1: app shell, notification center, toasts (2026-11-16) · Deployed · Flutter: indirect (design reference)
- Before: light sidebar, separate alert and billing banners.
- Changed:
  - Design tokens: primary `#1a5cff`, navy 950/900/800, cyan, Montserrat display face, Inter body.
  - Shell: navy sidebar, a top bar with a billing chip, a notification bell and an account menu; phone tab bar with "More".
  - A notification center replaces the alert and billing banners.
  - Toast v2.
- Now: the current dashboard shell (`components/shell.tsx`, `components/notifications.tsx`, `lib/notifications.ts`).
- Commit `4637f48`.

### PR #143 — Redesign phases 2 and 3 (2026-11-16) · Deployed · Flutter: indirect
- Changed:
  - Light `PageHeader` on every page.
  - Overview gets quick actions and a Needs-attention panel.
  - My Screens cards: one primary action ("Change content") plus a ⋯ menu (Schedule, Edit playlist, Open screen).
  - Shared confirm dialog.
  - An opt-in three-panel menu-board editor.
- Commits `741143b`, `4ffe55a`.

### PR #144 — Editor: three-panel layout by default (2026-11-17) · Deployed · Flutter: none
- Changed: the three-panel editor is the default; the toolbar Preview button was removed; a "select an area" hint was added. Rollback: `NEXT_PUBLIC_EDITOR_LAYOUT=classic`.
- Commit `88f96c0`.

### PR #145 — Redesign phase 4: Schedules, Account, headings (2026-11-17) · Deployed · Flutter: indirect
- Changed: Schedules view tabs and layout; one Account tab bar (Overview, Settings, Brand Kit, Plan & billing). No logic, API, billing or permission changes.
- Commit `1b27188`.

### PR #146 — Redesign phase 5: Analytics in Spanish, accessibility, screen filter (2026-11-17) · Deployed · Flutter: indirect (parity candidate)
- Changed:
  - Analytics page fully translated.
  - Accessibility fixes.
  - My Screens: a search box (name or location) and an All / online / not online switch for accounts with 4 or more screens. Client-side only.
- Commit `41f4e11`.

### PR #147 — Setup step 8, screen cards, preview countdown (2026-11-17) · Deployed · Flutter: **indirect (shared API)**
- Before: onboarding step 8 was done only while a screen was online at load time, so a phone with the TVs off showed 7/8.
- Changed: `lib/server/onboarding.ts` `playingStep()` also counts the TV's stored confirmation (`displays.confirmed_at`) while content is still published. Equal-height screen cards. "Next slide in Ns" in the playlist preview.
- Now: `GET /api/onboarding` keeps the same shape; the app's setup tracker gets the corrected value with no change.
- Commit `f236a80`.

### PR #148 — Premium menu templates (2026-11-17) · Deployed · Flutter: **direct**
- Before: three classic templates (`classic`, `fresh`, `bold`) and seven Layout Studio layouts.
- Changed:
  - 18 template designs, stored as presets on existing layouts.
  - Additive `LayoutDocument` fields: `design`, `variant`, `stockPhoto`, `logoMediaId`.
  - One shared SVG renderer for the editor preview and the server PNG.
  - Gallery and guided editor (Business / Menu / Photos / Look).
  - New `GET /api/menu-templates` → `{ enabled, unified }`.
  - Rollout flag `MENU_TEMPLATES`. No migration.
- Commit `b936b72`.

### PR #149 — Per-item food photos and 4 photo templates (2026-11-17) · Deployed · Flutter: **direct**
- Changed:
  - Optional `imageMediaId` on items (and `stockPhoto` for template samples), plus `photoStyle`.
  - 4 photo templates (22 total).
  - Ownership: foreign photo and logo ids are dropped on save.
- **Data-safety guards (protect the app):**
  - `PATCH /api/menus/:id` now refuses content or template edits on layout/template boards with **409** "This menu board was made in the web editor. Edit it at pekkotv.com." Before this, a classic-route edit re-rendered and overwrote such boards.
  - `POST /api/brand/apply` skips layout/template boards.
- Commit `b721b9b`.

### PR #150 — Item photos on text-focused templates (2026-11-17) · Deployed · Flutter: none (renderer)
- Fixed: a photo on a text template (e.g. Burrata on Modern Restaurant) now shows. Hiding photos is only the explicit `photoStyle: "text"`.
- Commit `b269f2e`.

### PR #151 — One menu designer for every board; item photos in every style (2026-11-18) · Deployed · Flutter: **direct**
- Changed:
  - Every board type (template, original layout, classic) opens in the same guided editor. Each keeps its own storage, renderer and save path; nothing is converted unless the owner switches layout.
  - Classic boards gain optional item photos (`items[].imageMediaId`) and `itemPhotos: false` (hide).
  - **Guards:** `keepStoredItemPhotos` (an item sent without the key keeps the stored photo, matched by section, then item name); `keepOwnItemPhotos` (foreign ids dropped).
  - Shared classic renderer `lib/menu-classic-svg.ts`.
  - Flag `UNIFIED_MENU_EDITOR`.
- Commit `57deac3`.

### PR #152 — Deployment runbook and API flow tests (2026-11-18) · Deployed · Flutter: none
- Changed: `docs/DEPLOYMENT.md`; `tests/api/unified-editor-flows.test.ts`, including "an Android edit keeps the photos" and "an older client can't overwrite a layout board".
- Commit `4f948bd`.

### PR #153 — Menu designer released to everyone; `/api/health` commit (2026-11-18) · Deployed · Flutter: **direct (scale)**
- Changed: `MENU_TEMPLATES` and `UNIFIED_MENU_EDITOR` default to everyone when unset (`developers` / `off` remain as safeguards). `/api/health` returns `commit`.
- Now: every web customer creates template/layout boards by default. Production evidence: the font route gated by `LAYOUT_STUDIO` returns 200, and the designer is live.
- Commit `a5e49db`.

### PR #154 — New home page, sign-up page, signup funnel (2026-11-18) · Deployed (code), funnel **Pending** · Flutter: none
- Changed:
  - Option B home (rollback `HOME_VARIANT=classic`).
  - Sign-up page redesign. Presentation only: same `signUp` / `resend` / redirect.
  - Funnel events `/api/traffic/event` and migration **0032**.
  - Developer "Signup funnel" panel.
  - Privacy policy EN/ES (Nov 19).
- Pending: migration 0032 is not confirmed applied; until it is, funnel events are a no-op.
- Commit `2a95777`.

### PR #155 — My Screens clipped menus; gallery card alignment (2026-11-18) · Deployed · Flutter: none (web layout)
- Fixed: page sections used `overflow-x-hidden`, which created inner scroll boxes that clipped ⋯ menus. The ⋯ menu now flips upward when there's no room below. The screen workspace is split 3:2. Gallery cards have the CTA anchored and "Start from scratch" as a normal card.
- Commit `fe17275`.

### PR #156 — Gallery filter rows (2026-11-18) · Deployed · Flutter: none
- Fixed: Business/Style/Layout filters now share a label column and use the shared segmented control.
- Commit `398ec74`.

## Not done, pending or unverified

- Migration 0032 (signup funnel) needs to be applied in Supabase. Steps are in `docs/OPERATIONS.md` §8.
- Signed-in production pages (My Screens, Menu Boards) were verified in local production builds and through the live JS bundles, not through a signed-in production session.
- Suggested follow-ups, not started:
  - cut shared JS on public pages (Supabase client + both dictionaries);
  - fix the stale browser-only test `tests/unit/premium-ui-editor.test.ts`.
- Unchanged by Claude:
  - TV player (`public/player.html`), pairing, `/api/player/*`;
  - playlists, scheduling and screen-group APIs;
  - billing and entitlements logic;
  - push notifications;
  - account deletion;
  - all migrations other than 0031/0032.
