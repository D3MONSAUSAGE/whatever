# Pekko web application: current feature inventory

Audit date: 2026-11-20. Code at `398ec74` (= production, per `/api/health`).

Everything below was read from the current code: page files under `app/`, route handlers under `app/api/`, types in `lib/`. Every management API uses `Authorization: Bearer <Supabase access token>` (`lib/server/auth.ts` `requireAdmin`) and resolves the user to exactly one account; no request takes an account id.

"Both" = a customer workflow the phone app should support. "Web-only" = intentionally on the website (marketing, developer tools, purchase flows under the store-billing policy in `docs/billing/entitlement-api.md` §8).

## 1. Account, auth and onboarding

| Feature | Web behavior | Key code / API | Platform |
| --- | --- | --- | --- |
| Sign up | `/signup` → `/login?mode=up`. Redesigned page (#154): visible labels, password hint and Show/Hide, validation, "Check your inbox". Supabase `signUp` with `emailRedirectTo` = same-site `?next=` path. Email confirmation is OFF in production (`docs/auth-email-hook.md`), so sign-ups log in immediately. | `app/login/page.tsx`, `components/auth/signup-view.tsx` | Both (the app uses Supabase Flutter) |
| Sign in / out / out everywhere | Supabase password sign-in. "Sign out of all devices" = `signOut({scope:"global"})` plus `POST /api/session/sign-out` to clear push devices. | `app/login`, `app/api/session/sign-out` | Both |
| Password reset | `/forgot-password` → email → `/reset-password`. The app uses a deep link (`seemple://reset-password`, `docs/ACCOUNT_AND_AUTH.md`). | Supabase Auth | Both |
| Business name, display name | `GET/PATCH /api/me` (`accountName`, ≤ 80 chars); display name in `user_metadata.display_name` | `app/api/me` | Both |
| Language | EN/ES everywhere; `pekko_locale` cookie; account locale (migration 0028) drives emails and push text | `lib/i18n` | Both |
| Setup tracker | 8 steps derived from real data. Step 8 stays done once a TV has confirmed content (#147). `POST` `{dismissed}` / `{confirmBusiness:true}` | `GET/POST /api/onboarding`, `lib/server/onboarding.ts` | Both |
| Account deletion | Owner only, 7-day delay, cancellable; behind `ACCOUNT_DELETION=1` | `/api/account/deletion` | Both |

## 2. Screens, pairing, groups and remote

| Feature | Web behavior | API | Platform |
| --- | --- | --- | --- |
| Pair a TV | The TV opens `pekkotv.com/pair` and shows a 6-digit code. The owner enters the code and a name. A duplicate name returns `nameWarning` / `suggestedName` (never refused). | `POST /api/displays/pair {code,name}` → `{id}`; 429 rate limit; `screen_limit` / `subscription_inactive` when billing is enforced | Both |
| My Screens | Cards: status (Online / Offline · N days / Waiting), assigned content and thumbnail, last heartbeat, offline note, primary "Change content", ⋯ menu (Schedule, Edit playlist, Open screen). Search and status filter at 4+ screens (#146). | `GET /api/displays` (row contract: `docs/FLUTTER_MANAGEMENT.md` "Screen row contract") | Both |
| Screen page | What's playing, sync state (`reportedState` assigned → acknowledged → playing), next change, preview still, change content / schedule / playlist panels, Replace the TV (reconnect), remove | `GET/PATCH/DELETE /api/displays/:id`, `GET /api/displays/:id/timeline`, `POST /api/displays/:id/reconnect` | Both |
| Locations | Name and timezone per screen | `/api/locations`, `/api/locations/:id` | Both |
| Screen groups | Create, rename, members; publish to a group | `/api/screen-groups`, `/api/screen-groups/:id`; `GET` row `{id,name,displayIds,updatedAt}` | Both |
| Publish to screens | Preview step lists `willBeCleared`. `replace` decides whether other screens on the playlist keep it. | `POST /api/displays/publish {playlistId, displayIds or groupId, commit, replace}` | Both |
| Remote (manual slideshow) | Next/previous and auto/manual for screens on a Manual playlist; poll 1–2 s | `/api/remote/screens`, `.../command`, `.../playback-mode` (`docs/REMOTE_CONTROL_API.md`) | Both (designed for the phone) |
| TV player | `public/player.html` at `/player` and `/tv`; offline cache of images; reports acknowledged/playing | `/api/player/*` (TV only, `X-Display-Token`) | TV only; the app never calls it |

## 3. Content library

| Feature | Web behavior | API | Platform |
| --- | --- | --- | --- |
| Images | JPG/PNG/WebP through the function (≤ 15 MB), resized | `POST /api/media` multipart → `{id}` | Both |
| Video | MP4 (H.264/AAC) via signed upload then complete | `POST /api/media/upload` → `{mediaId,path,token,signedUrl}`; `POST /api/media/upload/complete` | Both |
| Presentations | PPTX/PDF → slide group; per-slide duration; add to a playlist as one item | `/api/media/presentation*` | Both (upload); detail editing is a candidate |
| Rename / delete | Delete refused (409) while a playlist uses the file. Item photos, Brand Kit logo and layout images are **not** counted as "in use" (see the parity matrix, risk R4). | `PATCH/DELETE /api/media/:id` | Both |
| Promotions | Promo templates rendered to images; can follow a menu | `/api/promos*` | Web (app support unverified) |
| Content hub | Media, Promotions and Presentations tabs | `components/content-hub.tsx` | Web UI |

## 4. Menu boards (largest Claude-era change)

Three storage formats live in `menus.content` (JSON). The `menus.template` column is always `classic|fresh|bold`, even for layout and template boards (where it holds the palette). **Clients must branch on `content.layoutVersion === 1`, not on `template`.**

| Board kind | Stored content | Renderer | Save path | Editable by older app? |
| --- | --- | --- | --- | --- |
| Classic full-screen (Classic night / Fresh day / Bold blue) | `MenuContent` (`lib/menu-templates.ts`): `title, subtitle, footer, sections[{name, items[{name, price, description, imageMediaId?}]}], photoMediaId?, useBrand?, headingFont?, bodyFont?, itemPhotos?` | `lib/menu-classic-svg.ts` → server PNG | `POST /api/menus`, `PATCH /api/menus/:id` (re-renders, swaps image on screens, no draft) | Yes. Unknown keys are kept by server guards |
| Original layouts (7) | `LayoutDocument` (`lib/layout-studio.ts`) with `layoutVersion: 1`, `template ∈ {two-column, menu-promo-67, two-menu-promo, triple-column, split-50, menu-banner, signature}`, no `design` | `layoutSvg()` | `POST /api/layout-studio {mode: draft\|publish, menuId, name, document}`; `POST /api/layout-studio/assign` | **No**: `PATCH` content → 409. Rename and assign OK |
| Professional templates (22) | `LayoutDocument` plus `design` (id below), `variant`, `stockPhoto?`, `logoMediaId?`, `photoStyle?`; items may carry `imageMediaId` and `stockPhoto` | `lib/menu-design-svg.ts` (same SVG in browser and server) | Same as layouts | **No**: same as layouts |

- Template ids (`lib/menu-designs.ts`, 22): `modern-restaurant, trattoria, cocktail-lounge, coffee-shop, bakery, brunch-house, espresso-bar, bold-fast-casual, pizza-night, smokehouse-bbq, happy-hour, morning-rush, taqueria, diner-classics, chalkboard-bistro, juice-bar, ice-cream-parlor, boba-tea, photo-menu-grid, cafe-favorites, taqueria-specials, featured-dishes`.
- Fonts (`lib/board-fonts.ts`): `inter, noto-serif, oswald, montserrat, bebas-neue, lobster`.
- Limits: 4 sections, 12 items per section, 24 items total (classic); a templates "fit report" refuses publish until everything fits.
- Web flows:
  - **New menu board:** one gallery (22 templates, 7 layouts, classic full-screen, Start from scratch; Business/Style/Layout/photos filters).
  - **Guided editor** (Business, Menu, Photos, Look, Advanced): live TV preview, Save draft (layout boards), Publish, Show on screens.
  - **Item photos:** upload, pick from Media, replace, remove; show or hide.
  - **Brand Kit:** apply and restore, plus template switching that keeps content.
- Flags: `MENU_TEMPLATES`, `UNIFIED_MENU_EDITOR` (unset = everyone since #153; `developers`; list; `off`), `LAYOUT_STUDIO=1` (on in production). `GET /api/menu-templates` → `{enabled, unified}` per account.
- `GET /api/menus` / `GET /api/menus/:id` return `{id, name, template, content, mediaId, playlistId, imageUrl (signed PNG), createdAt, updatedAt}` for every kind, with **raw** `content`.
- `GET /api/layout-studio/boards` → `{boards:[{id, name, template, thumbnailUrl}]}`; `POST /api/layout-studio/assign {menuId, displayId}`.
- Brand Kit: `GET/PUT /api/brand` (merge-safe: an absent key is kept, `null` clears; `{}` → 400), identity fields and fonts; `POST /api/brand/apply` re-renders classic boards only (skips layout/template boards).

## 5. Playlists and scheduling

| Feature | Web behavior | API | Platform |
| --- | --- | --- | --- |
| Playlists | Draft/publish, slide durations, transitions, Manual slideshow mode, snapshot | `/api/playlists*`, `POST /api/playlists/:id/publish`, `/snapshot` | Both |
| Menu boards as playlists | Every board owns a playlist; publish swaps the image (`menu_swap_media`) | via menus / layout-studio | Both |
| Schedules | Weekday windows, date range, priority, enabled; per screen or group; day-part sets; preview of what plays | `/api/schedules*`, `/api/schedules/day-parts`, `/api/schedules/preview`, `/api/schedules/upcoming` | Both |

## 6. Alerts, notifications, analytics

| Feature | Web | API | Platform |
| --- | --- | --- | --- |
| Offline/recovery alerts | Notification center (bell, Needs attention / All), alerts page, preferences (minutes, email, push) | `/api/alerts`, `/api/alerts/read`, `/api/alerts/preferences` | Both |
| Push | FCM devices, test push (app side) | `/api/devices*`, `/api/push/test` | App |
| Customer analytics | Screen reliability, uptime, activity | `/api/analytics/*` | Web (candidate) |
| Developer console, website traffic, signup funnel | Developer-only | `/api/developer/*`, `/api/traffic/*` | Web-only |

## 7. Plans, trial and billing

- Plans: Starter $19 / 1 screen, Business $39 / 3, Multi-screen $59 / 5 (`lib/plans.ts`). Trial: 14 days, 5 screens, no card; screens keep playing 3 more days (`PLAYBACK_GRACE_DAYS`).
- `GET /api/entitlements`: read-only status (`state, plan, screen_limit, can_add_screen, playback_allowed, trial, warning{kind,message,action}, enforced, ...`). `enforced` is true only when `BILLING_ENFORCE=1` (production value not verified in this audit).
- Purchase: Stripe checkout and portal on the web (`/api/billing/*`). **The app policy is status-only** (no prices or purchase links). Android requests (`User-Agent: Dart/...` or `X-Pekko-Client: android/...`) receive status-only wording (`lib/server/android-status-copy.ts`).
- Over-limit screen selection: `GET/POST /api/entitlements/active-screens`.

## 8. Web-only by design (not Flutter gaps)

- Marketing site, SEO, Spanish marketing URLs, the new home page, the funnel.
- Developer console.
- Stripe checkout and billing portal.
- Layout Studio isolated preview (`/layout-studio`).
- The TV player itself.
