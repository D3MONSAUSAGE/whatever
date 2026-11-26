# Peek marketing site

The public site at pekkotv.com in the Peek identity: home (`/`, `/es`), `/features`, `/pricing` and `/faq` (and their
`/es/…` URLs). Source: `components/site/peek/`. Design: `pekko-marketing-site-handoff` (approved November 2026).

## When it shows (`lib/home-variant.ts`)
Launched November 2026: the Peek marketing site is the default on every environment (`MARKETING_DEFAULT = "peek"`).
It is **independent of the web app**. Pantalla's `PEEK_WEB_PRODUCTION` (dashboard and sign-in) doesn't change it, and rolling the marketing site back never touches the dashboard.

| Need | Do this |
|---|---|
| Roll back the marketing site only (ops) | Vercel → Environment Variables → Production: `HOME_VARIANT=b`, then redeploy. Remove it to return to Peek. |
| Roll back the marketing site only (code) | PR changing `MARKETING_DEFAULT` to `"b"` |
| Older home page | `HOME_VARIANT=classic` |
| Local/Preview without Peek | `PEEK_WEB=off` (ignored in Production) |

## What it does not change
- Shared public shell: `PublicPage`, `SiteNav`, `SiteFooter` and `PricingCards` are untouched. Support, contact, legal pages and 404 keep their current look.
- Web-app styles: everything is scoped to `.pkm` in `components/site/peek/peek-marketing.css`.
- Fonts and brand files: Gabarito and Figtree come from `app/peek.css` (bundled from `app/peek-fonts`), and the lockup from `public/peek/brand/`. Per `tests/unit/peek-web-flag.test.ts`, marketing code never imports `components/peek`. Both belong to the Peek web app and are only read here; nothing was added or changed.
- Signup destination (`/signup`), trial terms (`TRIAL`, `PLAYBACK_GRACE_DAYS`), prices (`lib/plans.ts`), EN/ES routes and hreflang, structured data, the signed-in redirect to `/dashboard`.
- Funnel events: the same `cta_click` locations (`hero`, `demo`, `pricing`, `final`, `sticky`, `nav`) and `template_try` (`hero`, `demo`). The standalone pages stay untracked except the header, as before.
- Interactive demo: the same `LiveDemo` and real renderer, styled with `ns="pkm"`. It opens on the Tacos template.

## Copy
New strings live under `home2.*` in `lib/i18n/en.ts` and `es.ts`, so the existing guards in `tests/unit/home-b.test.ts` cover them:
- `peekHeroSub`
- `featTitle`, `featLede`
- `feat5Title`, `feat6Title`, `feat6Body`
- `heroSwipe`, `heroSlide`

Option B strings (for example `home2.heroSub`, `nav.startTrial`) are unchanged, so the rollback renders exactly as before. The Peek site uses `home2.cta` ("Create my free menu") on every trial button, as approved.

## Tests
- `tests/unit/peek-marketing.test.ts`: variant matrix, `.pkm` scoping, no shared-shell imports, prices from constants, `/signup`, demo, EN/ES copy.
- When Peek is on, the e2e specs that read Option B markup (`landing`, `site`, `launch`) need the Peek selectors listed in the PR.
