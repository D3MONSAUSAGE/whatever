# Peek redesign (web) — preview flag

The Peek redesign of the signed-in web app is built behind a preview flag. It is **off by default and cannot turn on in Production**.

## How the flag works (`lib/peek-gate.ts`)
1. **Build gate.** `next.config.ts` inlines `PEEK_WEB_ALLOWED` at build time: `"0"` on every Vercel **Production** build (`VERCEL_ENV=production`), `"1"` on Preview and local builds unless `PEEK_WEB=off`. Never set anything on Production; nothing there can enable it.
2. **Browser opt-in.** On an allowed build, open any dashboard or sign-in URL with `?peek=1`. That sets the `pekko_peek=1` cookie (30 days) for that browser. `?peek=0` clears it. Without the cookie, the current UI renders unchanged.

With the flag on, `class="peek"` (and `data-theme="light"`) is put on `<body>` while a dashboard or auth page is mounted, so dialogs and toasts (portals) pick up the tokens too. All Peek CSS (`app/peek.css`) is scoped to `.peek` or to `pk-*` classes that only Peek components render.

## Out of scope (never Peek, even with the flag on)
- Public marketing site (`/`, pricing, FAQ, support, contact, legal).
- TV-side pairing page and playback (`/pair`, `/tv`, `/player`, `public/player.html`, the player service worker and APIs).
- Internal Staff (`/dashboard/staff`, excluded in `peekExcludedPath`) and the developer console (`/developer`, own layout).

## Screenshot harness
`PANTALLA_UI_PREVIEW=1 next start` then `/preview?screen=<name>&peek=1` (e.g. `screens`, `menus`, `overview`, `peek-kit` for the primitives sheet). Fixtures only; no account or data.

No API, database or shared-contract changes: the Android app is unaffected.
