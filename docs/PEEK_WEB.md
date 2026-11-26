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

## Production (t425u)

Peek is on for every web app user in Production while the Production env var `PEEK_WEB_PRODUCTION` is `on`
(read at build time by next.config.ts, see `peekProductionOn` in lib/peek-gate.ts).

- **Turn it off fast:** promote the previous Peek-off Production deployment (Vercel "Instant Rollback"), or set
  `PEEK_WEB_PRODUCTION=off` and redeploy main. With the switch off, a Production build cannot render Peek at all.
- **One browser:** `?peek=0` opts out (cookie `pekko_peek=0`, 30 days); `?peek=1` opts back in.
- Dark mode stays opt-in (`?theme=dark|system|light`). `PANTALLA_UI_PREVIEW` stays Preview-only, so /preview is 404 in Production.
- Marketing site, /pair, /tv, /player and Staff never use Peek.

## Server-rendered Peek (no flash) and the sign-in logo

- The sign-in pages (`/login`, `/forgot-password`, `/reset-password`, `/auth/confirm`) and the dashboard layout are wrapped in
  `<PeekServer>` (`components/peek/server.tsx`). It reads the `pekko_peek` cookie plus the build default (on in Production while
  `PEEK_WEB_PRODUCTION=on`) and the first HTML already has the Peek markup. A tiny inline script puts `peek` and `data-theme` on
  `<body>` before first paint (it skips `?peek=0` and `/dashboard/staff`). `usePeekWeb` still decides after hydration and is the
  source of truth. Marketing, `/pair`, `/tv` and `/player` never use `PeekServer`.
- The Peek lockup is an inline SVG (`components/peek/lockup.tsx`), not an `<img>`, so it can not render blank if an image request
  fails. The light and dark art are both in the markup and CSS shows the one for the theme.
- The Peek fonts moved to `app/peek-fonts/` and are loaded through the CSS bundle (`/_next/static/media/*`, hashed, immutable cache)
  instead of `/peek/fonts/*` (which was served with `max-age=0, must-revalidate`).
