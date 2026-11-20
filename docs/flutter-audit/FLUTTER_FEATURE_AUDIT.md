# Flutter app audit

Audit date: 2026-11-20.

## Source access: NOT AVAILABLE

The Flutter source could not be inspected.

- This session can reach these GitHub repositories: `D3MONSAUSAGE/whatever` (web), `Teamstream`, `TeamStream2`, `Team`, `Training_platform`, `Teamly_App`, `FRNKLY`, `teamly-project`, `receipt-upload-app`. None is the Pekko app; all but `whatever` were last pushed in early 2025.
- No `pubspec.yaml` exists on this machine. GitHub code search over accessible code finds no Dart code referencing `pekkotv.com`.
- The app is most likely a private repository under another owner or organization (Vercel team `teamtegrate`; Firebase project `pekko-effa3`), or not on GitHub.

**To complete this audit:** attach the Flutter repository to the session (owner/name), or share a source archive. Until then, every Flutter statement below is either **evidenced by the backend** (the web repo contains code, tests or docs written specifically for observed app behavior) or **unverified**. Nothing here was read from Dart source.

## What the backend proves about the app

| Fact | Evidence (web repo) | Confidence |
| --- | --- | --- |
| Native app, Android release id `com.pekkotv.app`; Firebase project `pekko-effa3` | `docs/PUSH.md` (#127/#128) | Evidenced |
| Latest known build is **+14** (Play launch). It sends no custom header; Dio's default `User-Agent: Dart/<version> (dart:io)` identifies it | `lib/server/android-status-copy.ts` (#131) | Evidenced |
| +14 shows status-only billing text (no prices, no purchase steering); the server rewrites warnings/errors for it | `lib/server/android-status-copy.ts`, `tests/unit/android-status-copy.test.ts` | Evidenced |
| Uses Supabase Auth with Bearer tokens on `/api/*`; never calls `/api/player/*`; never stores a display token | `docs/FLUTTER_MANAGEMENT.md`, `docs/PHASE_2D_PLAN.md` | Evidenced (contract) |
| Password reset deep link `seemple://reset-password`; `passwordRecovery` event; display name in `user_metadata`; global sign-out | `docs/ACCOUNT_AND_AUTH.md` | Documented contract (implementation unverified) |
| Android +13 sign-up uses `emailRedirectTo: https://pantalla-chi.vercel.app/dashboard` | `lib/auth-confirm.ts`, `tests/unit/b2-07a-auth-confirm.test.ts` | Evidenced |
| **Edits classic menus** via `PATCH /api/menus/:id`; its `MenuContent.toJson` sends no `headingFont` / `bodyFont` and no item-photo keys | `app/api/menus/[id]/route.ts`, `tests/unit/e6-menu-fonts-patch.test.ts`, `tests/api/unified-editor-flows.test.ts` | Evidenced |
| **Edits Brand Kit colors and logo**: always sends `{primaryColor, accentColor, logoMediaId}` to `PUT /api/brand` | `app/api/brand/route.ts`, `lib/brand-kit.ts`, `tests/unit/brand-identity.test.ts` | Evidenced |
| Registers for push (FCM): `POST /api/devices {token, platform, appVersion?, notifyOffline?, notifyRecovery?}`; test push; Settings push switch | `docs/PUSH.md`, `docs/ALERTS.md`, privacy policy (#129) | Evidenced |
| Parses `GET /api/displays` strictly: "one row with a wrong type fails the app's whole list" (build +10 and later) | `docs/FLUTTER_MANAGEMENT.md` "Screen row contract" | Evidenced (documented constraint) |
| Pairing by code (`POST /api/displays/pair`), screen list, rename, location, remove; remote next/prev and auto/manual | `docs/FLUTTER_MANAGEMENT.md`, `docs/REMOTE_CONTROL_API.md` | Contract documented for the app; implemented screens unverified |
| "App additions": `GET /api/layout-studio/boards`, `POST /api/layout-studio/assign`, `GET /api/displays/:id/timeline`, `POST /api/displays/publish` (with `replace`), `GET /api/config` | `docs/FLUTTER_MANAGEMENT.md` | Endpoints exist; app usage unverified |
| Setup tracker shared with the web | `app/api/onboarding/route.ts` comment | Evidenced (shared endpoint) |
| iOS | `POST /api/devices` accepts `platform: "ios"` | Backend-ready; an iOS build is unverified |

## Unverified (needs Dart source)

- Navigation structure, onboarding screens, and which of the documented endpoints are actually wired.
- Menu editor UI: which classic fields it edits, whether it shows layout/template boards, and how it handles a 409.
- Whether its menu JSON model tolerates `layoutVersion` documents, unknown keys, and null `playlistId` / `mediaId`.
- Media upload (image / MP4 / presentation) support, playlists, scheduling, screen groups, locations, alerts list, analytics.
- Account deletion and entitlements UI.
- Design system, theming, Spanish support.
- Build pipeline, minimum OS versions, and an iOS build.

## Functionality the app has that the web does not (evidenced)

- Push notifications (FCM device registration, test push, per-device offline/recovery toggles).
- Possibly a dedicated Remote screen (the API was designed for the phone; the web has no remote UI). Unverified in source.
