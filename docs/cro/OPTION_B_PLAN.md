# Option B: refined prototypes and implementation proposal

Status: **proposal for review.** Nothing in production changed: no deploy, no environment variables, no billing, auth, dashboard or onboarding changes, and no customer data touched. Option A is kept as is for future Meta campaigns (`docs/cro/prototypes/option-a.html`).

## 1. Deliverables

| # | Deliverable | Where |
| --- | --- | --- |
| 1–2 | Refined Option B, mobile and desktop (one responsive page) | Private preview: https://claude.ai/artifact/KjBRAJsdgs2ZPDeCVFdEaN · `docs/cro/prototypes/b2/index.html` (open `index.local.html` from a local web server) |
| 3 | Proposed signup page, with a state switcher for Form / Validation / Server error / Check inbox | Private preview: https://claude.ai/artifact/WAkwjpH4ZoiGbJQhAFYbeR · `docs/cro/prototypes/b2/signup.html` |
| 4 | Template selection demonstration: hero switcher over 7 real templates, plus a live "type your menu" demo running Pekko's real renderer | Both in the Option B page; renderer bundle built by `docs/cro/prototypes/b2/build-demo.mjs` |
| 5–9 | Prioritised changes, analytics plan, technical plan, risks, change scope | This document |

All menu imagery is genuine Pekko output:
- **Hero boards:** rendered by `renderLayoutPng`, the production server renderer.
- **Live demo:** runs `designSvg` from `lib/menu-design-svg.ts`, the same code the menu designer uses in the browser.
- **App screens:** captured from the app's preview harness (gallery, editor, pairing form, publish dialog).
- **TV pairing screen:** drawn from the player's own text in `public/player.html`, because a real TV capture would create a production pairing session.

## 2. What changed from the first Option B

| Area | First Option B | Refined |
| --- | --- | --- |
| Mobile first screen | Headline, TV, CTAs, pills. The lede pushed the CTA low. | Headline, one-line subhead, real menu on a TV, template chips, **Create my free menu**, "14-day free trial · No credit card required", "Already have a Smart TV? No extra hardware needed." All within 844 px (verified at 390×844). |
| Navigation | 4 links + CTA | Phone: logo + Sign in. Desktop: Templates, How it works, Pricing, Sign in. Sticky CTA appears on phones once the hero CTA scrolls away. |
| Templates | Static image switcher | Hero switcher (static WebP, instant) **plus** a live demo: type the business name, first item and price, choose a template, and see the real renderer's output. |
| How it works | 4 static cards | 4 accessible tabs (Choose → Add menu → Connect TV → Publish) with real app screens; one panel visible at a time, so less scrolling. |
| TV message | "Check your TV first" was prominent | A positive message: "Already have a Smart TV? No extra hardware needed." Four plain steps. One concise, accurate caveat in small print and in the FAQ. |
| Trust | Facts block | Transparent pricing with trial terms, what happens after the trial, a "who builds it" block with the support email, and real product screens. |
| Length | about 6,900 px mobile | **5,349 px mobile** (live site today: 15,566 px); 3,765 px desktop. |

### Headline evaluation

"Beautiful digital menus on your TV in minutes." stays.
- It states the outcome (a beautiful digital menu), where it shows (your TV) and the effort (minutes) in eight words, and it works at phone width in three lines.
- Alternatives I considered:
  - "Create a beautiful TV menu in minutes" is more action-led, but "TV menu" is less clear than "digital menu".
  - "Your menu, on the TV you already have" is today's angle and doesn't promise design quality.
- The "TV you already have" idea now sits directly under the CTA as its own line, so the headline doesn't have to carry it. The subhead and that line are better test variables than the headline.

## 3. Smart TV compatibility: what the code supports

Facts:
- **The player is plain ES5** (`public/player.html`), written for years-old Samsung Tizen and LG webOS browsers.
- **It degrades gracefully:** XMLHttpRequest instead of `fetch`, no cache API needed, `background-size` instead of `object-fit`, and a token in `localStorage` with an in-memory fallback.
- **Tested** on LG, Samsung, Vizio and Insignia Smart TVs (public FAQ, `FIRST_TV_TEST.md`).

Real limits:
- Very old sets, roughly before 2016, may reject the HTTPS certificate (`FIRST_TV_TEST.md`).
- Most TV browsers don't reopen the page after the TV powers off; the TV stays paired.
- Video needs H.264 MP4.
- No team or multi-user accounts, so nothing implies them.

Approved wording in the prototype:
- **Primary:** "Already have a Smart TV? No extra hardware needed." plus the four steps.
- **Small print:** "Tested on LG, Samsung, Vizio and Insignia Smart TVs. Some older TVs can't open secure websites; for those, any streaming stick or computer with a web browser connected to the screen works."
- **FAQ:** "What if the TV is turned off?", answered honestly.

## 4. Signup page: findings and proposal

The flow today: `/signup` → `/login?mode=up`, email and password, Supabase email confirmation, link → `/dashboard`.

| Finding | Type | Proposal (presentation only) |
| --- | --- | --- |
| No trial or no-card reminder; tagline "Digital signage made simple" | Consistency | Title "Create your free menu"; chips "14-day free trial · No credit card required · Every feature"; 3 short "what you can do" lines. |
| Light theme, unlike the dark marketing site | Consistency | Same dark Pekko tokens as the landing page. |
| Labels are screen-reader only; placeholders act as labels | Usability | Visible labels "Business email", "Create a password". |
| The 8-character rule appears only as a browser error after submit | Validation | Hint "At least 8 characters", validation on blur and on submit, message under the field, focus moves to the first problem, Show/Hide toggle. |
| After signup the card flips to "Sign in", with a one-line note under the form | Clarity | A dedicated **Check your inbox** state: the address, two numbered steps, a spam hint, resend with the existing 60 s cooldown, "Use a different email". |
| Errors appear as a line under the button | Clarity | One alert above the fields; the support email is visible. |

**Not changed:** auth calls (`signUp`, `resend`), fields, the redirect, email confirmation, trial entitlements.

**No defect found** in auth, billing or trial logic.

**Product decision, not a defect:** requiring email confirmation before first use is the largest structural step in the funnel. Changing it is an auth and security decision, left for you. Measure it first (§6).

## 5. Prioritised changes

**P0, before or with the redesign**
1. Funnel measurement (§6). Without it the redesign can't be evaluated.

**P1, the new home page (Option B)**

2. Hero: headline, subhead, real template switcher, "Create my free menu", trial line, Smart TV line, sticky phone CTA.
3. Live template demo: lazy-loaded, using the real renderer.
4. How it works: 4 tabs with real screens.
5. Smart TV band: 4 steps, 4 benefits, one caveat.
6. Pricing with trial terms; 4-question FAQ; who-builds-it block; final CTA.
7. Remove from the home page and keep on `/features`: video, PowerPoint/PDF detail, the non-restaurant examples, the long feature grid.

**P1, signup presentation**

8. Signup page as in §4.

**P2**

9. Spanish versions of every new string (the site is bilingual today; this is required, not optional).
10. Option A as a noindex `/lp/…` page for Meta ads.

## 6. Minimal analytics plan

Principles:
- Reuse the cookieless collector (`components/site/traffic-beacon.tsx` → `POST /api/traffic/collect` → `traffic_record`).
- Daily aggregates only, by channel. No cookies, no third-party scripts, no personal data.
- Respect GPC/DNT as the collector already does.

| # | Stage | Today | Needed |
| --- | --- | --- | --- |
| 1 | Landing page visits | **Tracked**: page views, landings, estimated visitors, channel, referrer host (`traffic_daily`, migration 0031) | Nothing |
| 2 | Primary CTA clicks | Not tracked | Client event `cta_click` with `location` = hero / sticky / nav / pricing / final |
| 3 | Signup page views | Not tracked (`/login` is excluded from tracked paths on purpose) | Client event `signup_view` (count only, no path or query) |
| 4 | Signup submissions | Not tracked | Client events `signup_submit` and `signup_error {code}`; the code is a short enum (`invalid_email`, `short_password`, `rate_limited`, `server`), never the address |
| 5 | Successful registrations | **Tracked**: accounts created, by first-touch channel (signup attribution, migration 0024; developer console) | Nothing |
| 6 | Trial activation | Trial starts at account creation (same as 5). Email confirmation is **not reported** | Server-derived `email_confirmed` count per signup day, from Supabase `auth.users.email_confirmed_at` |
| 7 | First menu created | Not reported | Server-derived from `menus.created_at` (first per account), counted per signup cohort |
| 8 | First screen paired | **Per account** in the developer accounts view (`first_paired_at`, migration 0030); no funnel aggregate | Aggregate per signup cohort |
| 9 | First content published | **Per account** first TV-confirmed playback (`first_playback_at`, 0030); publish actions in `activity_events` | Aggregate per signup cohort (publish and TV-confirmed) |

How it would be built, all additive:
- **Client events (2–4):** extend the beacon body with an optional `event` field. The collector validates it against a fixed allow-list and calls a new `funnel_record(day, event, detail, channel)` that increments a tiny aggregate table, `funnel_daily (day, event, detail, channel, count)`. This is one additive migration with rollback, RLS on and service role only, like 0031.
  - The alternative, encoding events as pseudo-paths in `traffic_daily`, needs no migration but mixes events into the page report. Not recommended.
- **Server stages (5–9):** a read-only SQL function, like `dev_traffic_snapshot`, that counts per signup cohort and day using the existing tables. Nothing is written per user.
- **Developer console:** a "Funnel" panel on the Website traffic tab with the 9 stages, stage-to-stage rates and a channel filter.
- **Privacy policy:** one sentence added to the website-traffic section ("we also count anonymous clicks on sign-up buttons and sign-up form steps").

How to read it:

| Pattern | Likely problem | Next move |
| --- | --- | --- |
| Many landings, few CTA clicks | Page or traffic fit | Check the channel mix; test hero variants; check ad message match |
| CTA clicks ≫ signup views | Navigation or the redirect | Check `/signup` → `/login` on devices |
| Signup views ≫ submits | Form friction or doubt | Signup copy and validation; watch `signup_error` codes |
| Registrations ≫ confirmed | Email step | Deliverability, the inbox state, maybe the confirmation timing decision |
| Confirmed ≫ first menu | Onboarding | Menu-first onboarding (a separate, approved change) |
| First menu ≫ paired | TV setup | Pairing help and the TV copy |

At about 50 visits a day, read 2–4 week windows and compare stage rates; don't expect statistical significance on the final rate.

## 7. Technical implementation plan (existing architecture)

| Piece | Implementation | Files |
| --- | --- | --- |
| Home page | Replace the sections in `app/page.tsx` with new server components in `components/site/marketing/` (`HeroB`, `TemplateDemo`, `HowItWorks`, `SmartTvBand`). Keep `PricingCards` (reads `lib/plans.ts`), `FaqList` (subset of the existing FAQ keys plus 1–2 new ones), `TrialCta`, `HomeStructuredData`, `marketingMetadata`, `SIGNED_IN_REDIRECT`. | `app/page.tsx`, `components/site/marketing/*.tsx`, `components/site/sections.tsx` |
| Template images | Build-time script using `renderLayoutPng` (as in this prototype) → `public/marketing/templates/<id>-{640,1280}.webp`, committed. Regenerate when templates change. | `scripts/gen-marketing-templates.mjs` (new) |
| Hero switcher | Small client component swapping `<img srcset>`; the first image is preloaded with `fetchpriority="high"`; explicit width/height; no layout shift. | `components/site/marketing/hero-switcher.tsx` |
| Live demo | Client component that `import()`s `designSvg` and `designDocument` **dynamically** when the section is near the viewport, so it stays out of the first-load bundle. Uses the app's own font CSS (`fontFaceCss`) and stock photos from `public/menu-templates`. Same output as the designer, with no separate copy. | `components/site/marketing/template-demo.tsx` |
| How it works | Client tabs component (ARIA tabs, arrow keys). Real screenshots in `public/marketing/how/` captured from the preview harness. | `components/site/marketing/how-it-works.tsx` |
| Copy | All strings in `lib/i18n/en.ts` and `es.ts` (`home2.*` keys); the existing i18n parity tests cover them. | i18n files |
| Signup | Presentation only in `components/auth-frame.tsx` (dark variant for `mode=up`) and the signup branch of `app/login/page.tsx`: visible labels, hint, blur and submit validation, an inbox state component. The `signUp`/`resend` calls and the redirect are unchanged. | `app/login/page.tsx`, `components/auth-frame.tsx` |
| Funnel | Collector allow-list + `funnel_record`; migration `0032_funnel_daily.sql` with rollback; read-only cohort function; console panel. | `lib/traffic.ts`, `app/api/traffic/collect/route.ts`, `supabase/migrations/0032_*`, `app/developer/analytics/*` |
| Rollout | Ship behind a marketing variant switch (`HOME_VARIANT=b`, default current). Then make B the default once checked, and keep the switch as the rollback. | `app/page.tsx` |
| Tests | Unit: copy claims match `lib/plans.ts` (prices, trial days, screens), no forbidden claims, EN/ES parity. Playwright: mobile 390 first screen contains the CTA, trial line, TV line and template image; no horizontal overflow; tabs keyboard-operable; demo renders after scroll. Lighthouse budget in CI optional. | `tests/unit/*`, `tests/e2e/*` |

**Performance budget** (measured on the prototype locally; production must be re-measured):

| Item | Target | Prototype |
| --- | --- | --- |
| Hero image | small, preloaded | 27 KB WebP at 640 px |
| Live demo | outside the first load | renderer 30 KB gzip, lazy |
| Template fonts | outside the first load | loaded with the demo only |
| Stock photos | outside the first load | about 20–40 KB each, loaded only for the chosen template |
| Layout shift | < 0.1 | 0 on mobile, 0.05 on desktop (font swap) |
| First screen | no extra JS needed | no JS needed to render it |

Production should self-host fonts as the app already does, which removes the Google Fonts dependency used in the prototype. Target mobile Lighthouse LCP ≤ 2.5 s and TBT < 200 ms.

## 8. Risks

| Risk | Mitigation |
| --- | --- |
| A visitor's TV can't open the player (an older set) | Accurate small-print caveat and FAQ; the trial costs nothing to find out. Watch support questions and the paired-stage drop. |
| Live demo cost on low-end phones | Lazy-load; render on `requestAnimationFrame`; text inputs capped (28/26/7 characters); static fallback image if the script fails. |
| Font metric drift in the demo | Production uses the same bundled fonts as the designer, unlike the prototype's Google Fonts. |
| Claims drift from the product (template count, prices) | Read counts and prices from code (`MENU_DESIGNS.length`, `lib/plans.ts`) and add copy-claim tests. |
| "Who builds it" block | Needs your approval: it names you and "made in Los Angeles". It's based on the published operator facts in `lib/legal.ts`; the home address is deliberately left out. |
| Removing sections that drive SEO | Content moves to `/features`, not deleted; keep the structured data and meta. |
| Low traffic makes results noisy | Stage-level reading over 2–4 weeks (§6). |
| Paid checkout state unknown | If live checkout is off (`STRIPE_LIVE_ENABLED`), trials can't convert to paid. Check before spending on ads. |

## 9. What changes, and what stays untouched

**Changes, after your approval:**
- The home page content and layout.
- New marketing components and images.
- The signup page's presentation, copy and validation messages.
- New EN/ES strings.
- The aggregate funnel events: one additive migration, collector allow-list, console panel and a privacy-policy sentence.

**Untouched:**
- Authentication (Supabase calls, email confirmation, redirect).
- Account creation, trial length and entitlements, plans, prices, billing and Stripe.
- The dashboard, the onboarding checklist and workflow, and the menu designer.
- The TV player, pairing, publishing and schedules.
- Feature flags and environment variables; customer data.
- The `/features`, `/pricing` and `/faq` pages, apart from receiving the content moved off the home page.
