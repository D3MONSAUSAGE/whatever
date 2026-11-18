# Pekko landing page: CRO audit

Scope: https://pekkotv.com (home, pricing, signup), inspected live on 2026-11-18 at 1440×900 and 390×844, plus the codebase at `a5e49db`. No production page, setting, flag or data was changed. Screenshots referenced below were taken from the live site.

**Bottom line:** the page is competent but undersells the product as it exists today. It was written before the menu designer, the 22 templates and item photos, and it leads with technical framing ("digital signage", "compatible smart TV's web browser") instead of the result. The bigger unknown is the funnel. Today we can count landings and registrations, but nothing in between, so we can't yet tell whether visitors fail to click, fail to sign up, or stall at email confirmation.

**Current score: 59 / 100.** This is a structured expert assessment, not a measured or predicted conversion rate.

---

## 1. What Pekko actually offers (verified in code)

| Capability | Status | Evidence |
| --- | --- | --- |
| Unified menu designer: Business → Menu → Photos → Look | **Live for everyone** since `a5e49db` (flags default to all) | `components/menu-templates.tsx`, `lib/menu-templates-flag.ts` |
| 22 premium templates + 7 original layouts + full-screen classic menu, one gallery with filters | Live | `lib/menu-designs.ts`, `lib/menu-designer.ts` |
| Item photos on every menu style (upload, choose from Media, replace, remove) | Live | `lib/menu-design-svg.ts`, `lib/layout-studio.ts`, `lib/menu-classic-svg.ts` |
| Live TV preview identical to the TV image | Live (pixel test) | `tests/unit/menu-design-fidelity.test.ts` |
| Brand Kit (colours, logo, fonts) with automatic contrast checks | Live | `lib/brand-kit.ts`, `designColors()` |
| Upload own artwork: JPG/PNG/WebP, MP4 (H.264), PowerPoint, PDF | Live | `lib/file-upload.ts`, `docs/PPTX_UPLOADS.md` |
| TV pairing: open `pekkotv.com/pair` on the TV, enter the 6-digit code | Live. **Works before signup** (unauthenticated, rate-limited) | `app/api/player/pair/route.ts`, `next.config.ts` rewrites |
| No extra hardware on tested smart TVs (LG, Samsung, Vizio, Insignia) | Live. Limits: not every TV works; most TV browsers don't reopen the page after power-off; pre-2016 sets may fail HTTPS | `FIRST_TV_TEST.md`, `docs/PHASE_2B_PLAN.md`, FAQ copy |
| Remote updates, playlists, schedules (day-parts), screen groups, locations | Live | `app/api/{playlists,schedules,screen-groups,locations}` |
| Screen status, offline alerts, TV-confirmed playback | Live | `docs/ANALYTICS.md`, `docs/ALERTS.md` |
| English and Spanish dashboard | Live | `lib/i18n/es.ts` |
| Trial: 14 days, every feature, 5 screens, no card; 3 days playback grace after | Live | `lib/plans.ts`, `lib/server/entitlements.ts` (`PLAYBACK_GRACE_DAYS = 3`) |
| Plans: $19 / 1 screen, $39 / 3, $59 / 5, monthly | Live | `lib/plans.ts` |
| Team members / multi-user | **Not available**; don't advertise | no invite routes |
| Paid checkout | **Depends on production env** (`STRIPE_LIVE_ENABLED`); the app has an "Online checkout is coming soon" state | `lib/billing-view.ts`, `docs/billing/LIVE_ROLLOUT.md` |

Documentation inconsistency found: `docs/billing/COMMERCIAL_RULES.md` says the trial ends "with no playback grace", while the code and the public FAQ give 3 days. The public copy is correct; the doc is stale.

### The strongest customer benefits (outcomes, not features)

1. **A menu that looks professionally designed, without a designer.** 22 templates, automatic sizing and readability checks.
2. **Prices and specials that are always right.** Change it on your phone; every screen showing it updates.
3. **No new hardware on the TV you already have** (on compatible smart TVs), and you can check compatibility in 30 seconds before signing up.
4. **Food that sells itself.** Photos on any item, in every style.
5. **The right menu at the right time.** Breakfast, lunch and dinner switch automatically; promotions rotate.
6. **Risk-free to try.** 14 days, all features, 5 screens, no card, nothing deleted afterwards.
7. **Works in English and Spanish.** Relevant for the restaurant market. A hypothesis worth testing in ads, not a proven driver.

---

## 2. Research basis

Each recommendation below is tagged **[Evidence]**, where a cited source supports the general principle, or **[Hypothesis]**, a Pekko-specific inference to test.

| Topic | Finding | Source |
| --- | --- | --- |
| First seconds | Users often leave within the first 10 s; the value proposition must land quickly. Visitors who stay ~30 s often stay much longer. | NN/g, [How Long Do Users Stay on Web Pages?](https://www.nngroup.com/articles/how-long-do-users-stay-on-web-pages/) |
| Above the fold | 57% of viewing time is above the fold, and 74% in the first two screenfuls. Attention drops sharply after. | NN/g, [Scrolling and Attention](https://www.nngroup.com/alertbox/scrolling-attention.html) |
| Value proposition | The headline should state the value proposition clearly and credibly; clarity is a primary conversion driver. | CXL, [Value proposition examples](https://cxl.com/blog/value-proposition-examples-how-to-create/) |
| CTA wording | Vague CTAs ("Get Started") surprise users and stop them looking for information; specific labels work better. | NN/g, ["Get Started" Stops Users](https://www.nngroup.com/articles/get-started/) |
| Signup friction | Perceived friction drops with fewer fields, autocomplete and smart defaults; forcing account creation early hurts completion. | Baymard, [Simplifying sign-up](https://baymard.com/blog/simplifying-sign-up), [Delayed account creation](https://baymard.com/blog/delayed-account-creation); CXL, [Form design best practices](https://cxl.com/form-design-best-practices/) |
| Trust | Design quality, up-front disclosure, comprehensive current content and connection to the wider web communicate trustworthiness. | NN/g, [Trustworthiness in web design](https://www.nngroup.com/articles/trustworthy-design/), [Communicating trustworthiness](https://www.nngroup.com/articles/communicating-trustworthiness/) |
| Speed | Bounce probability rises 32% as mobile load goes from 1 s to 3 s (Google/SOASTA, 2017). LCP is "good" at ≤ 2.5 s and poor above 4 s; INP is good at ≤ 200 ms. | Think with Google, [Page load statistics](https://www.thinkwithgoogle.com/data/page-load-time-statistics/); web.dev, [LCP](https://web.dev/articles/lcp), [INP](https://web.dev/articles/inp) |
| Message match | The landing page should continue the promise of the ad that brought the visitor. Vendor case studies report lifts; treat the numbers as best-case. | Unbounce, [Ad-to-page relevancy](https://medium.com/inside-unbounce/why-ad-to-page-relevancy-matters-and-how-unbounce-can-help-1dddf1cedcda) |
| Benchmarks | Median SaaS landing page conversion is 3.8% (Unbounce 2024; 41,000 pages). Context only; it's not a target for a 50-visit/day site. | Unbounce, [SaaS conversion benchmark](https://unbounce.com/conversion-benchmark-report/saas-conversion-rate/) |
| Time to value | Activation, the moment a user gets the promised value, is the key trial metric. Reduce time-to-value and guide users to the "aha" moment. | OpenView, [Activation vs PQLs](https://openviewpartners.com/blog/activation-product-qualified-leads/), [PLG benchmarks](https://openviewpartners.com/blog/your-guide-to-product-led-growth-benchmarks/) |
| Urgency | Fake countdowns and false scarcity are deceptive design patterns. Use only real reasons to act now. | FTC, [Bringing Dark Patterns to Light](https://www.ftc.gov/reports/bringing-dark-patterns-light) (Sept 2022) |
| Interactive previews | Little independent research. Vendor data says homepage tours are common, and NN/g studies on onboarding tutorials found mixed results. Treat "try it in the page" as a hypothesis. | Vendor sources only; no NN/g study located |

Not found or not used: no reliable source for per-field signup drop-off rates, and none for "problem-first vs outcome-first" headline performance. The choice between A and B is therefore a test, not a settled answer.

---

## 3. Live page audit

### Evidence

**Hero (desktop, 1440×900).**
- Headline: "Your menu and promotions, on the TV you already have."
- Eyebrow: "Digital signage for restaurants and local businesses".
- Subhead: "Pekko turns a compatible smart TV's web browser into digital signage, with no separate hardware box. Build a branded menu or upload your own artwork, then publish from your phone."
- CTAs: "Start free trial" and "See how it works".
- Reassurance row: "14 days free · No credit card · No extra hardware box".
- Visual: an "Ember & Oak" menu with a burger panel, labelled "Sample design".

**Hero (mobile, 390×844).** The headline, subhead, both CTAs and the reassurance row fill the first screen. The menu visual starts at about 740 px, so only its top edge is visible.

**Page structure.** 10 sections; about 1,530 words.
- Mobile height is 15,566 px, about 19 screens. Desktop is 10,185 px.
- The sections, in order:
  - Three ways to fill your screens
  - Set up in three steps
  - Digital menu boards that look professionally designed
  - Bring your menu to life with video
  - Upload your artwork
  - What it can look like (restaurants, food trucks, pet shops, retail, coffee shops)
  - Everything you need
  - Pricing
  - FAQ (5)
  - Final CTA

**Menu boards section.** It lists the 6 original layouts and 6 fonts. It doesn't mention the 22 templates, the template gallery, item photos or the guided editor.

**Visuals.** Polished sample boards and a phone pairing mock-up. They are illustrations built for the site, not current product output, and there is no view of the editor itself.

**Trust.** No testimonials, customer counts or logos. That's honest, since none exist publicly yet.
- Repeated disclaimers: "Sample designs for illustration only…".
- The footer reads "© 2026 Francisco Lopez. All rights reserved." There's no company name, location or support response promise.

**Signup.** "Start free trial" goes to `/signup`, which redirects to `/login?mode=up`.
- The form asks only for email and password.
- The page title is "Create your account" with the tagline "Digital signage made simple". It doesn't mention the free trial, 14 days or "no credit card".
- It uses a light theme, a visual break from the dark marketing site.
- After submit, Supabase email confirmation is required: "Check your email".

**Onboarding after signup.** An 8-step checklist: account, business, location, screen, media, playlist, publish, playing. It doesn't route through the menu designer, so the first "wow" (seeing your own menu on a TV preview) isn't the first step.

**Performance.** Lighthouse (mobile, simulated slow 4G):

| Metric | Result |
| --- | --- |
| Performance score | 71 |
| Accessibility | 100 |
| Best practices | 100 |
| SEO | 100 |
| First Contentful Paint | 1.1 s |
| Largest Contentful Paint | 4.2 s |
| Total Blocking Time | 590 ms |
| Cumulative Layout Shift | 0 |
| Transfer size | 825 KiB |

Flags: unused JS, image sizing, next-gen formats, DOM size, and bfcache blocked. A real-browser load measured LCP at 2.5 s on desktop and 4.3 s on mobile, unthrottled from the audit host.

**Links.** Every "Start free trial" link resolves to the signup form, "See how it works" scrolls to `#how`, and the console shows no errors. The FAQ's pairing instructions match the code.

### Answers to the audit questions

| Question | Finding |
| --- | --- |
| Understandable in 3–5 s? | Mostly. "Menu on the TV you already have" is clear, but "digital signage" and "web browser" make it sound technical. |
| Compelling outcome in the headline? | Partly: it promises *where* (your TV), not *what you get* (a professional menu in minutes that stays up to date). |
| Real customer problem named? | No. The page is feature-led; no section names the pain. |
| Differentiation obvious? | "No extra box" is stated. The strongest differentiator now, design quality without a designer via 22 templates, is invisible. |
| Visual shows the end result? | Yes (a menu on a TV) on desktop; below the fold on mobile. It doesn't show *how easy* creation is. |
| CTA clear? | Yes. "Start free trial" is specific and repeated, with a sticky header CTA on desktop. There's no low-commitment alternative such as "Check my TV". |
| Trial low-risk? | Yes on the landing page (no card, 14 days); the context is lost on the signup page. |
| TV compatibility understood? | Answered in the FAQ near the bottom. The best reassurance, testing your TV before signing up, is not promoted. |
| Templates / designer explained? | No (outdated). |
| Benefits prioritised? | Features before outcomes; video and PowerPoint upload get as much space as menus. |
| Unnecessary technical language? | Yes: "web browser", "digital signage", "MP4 (H.264)", "1920 × 1080", ".pptx". |
| Mobile friction? | Long page; visual below fold; LCP 4.2 s. |
| Navigation distracts? | Mildly: 4 nav links plus a language selector. Acceptable, since FAQ and Pricing help buyers. |
| Objections addressed? | Hardware, compatibility, trial, connection and plans are in the FAQ. Missing: "is it hard?", "what if I already have a Canva menu?" (covered mid-page), "who is behind this?" |
| Credible proof? | Weak, and it can't be faked. Genuine options are listed in the roadmap. |
| Unnecessary signup steps? | Email confirmation before first use. Onboarding isn't menu-first. |

---

## 4. Funnel audit

### What we can measure today

| Stage | Measured? | How |
| --- | --- | --- |
| Landing page visits | **Yes**: page views, landings, estimated visitors, referrer host, UTM channel | Cookieless beacon → `/api/traffic/collect` (`lib/traffic.ts`); Developer console → Website traffic |
| Primary CTA clicks | **No** | not instrumented |
| Signup page visits | **No** | `/login` is deliberately excluded from tracked paths |
| Signup attempts | **No** | |
| Successful registrations | **Yes**: accounts created, by channel (internal/QA accounts excluded) | Developer console traffic tab (`registrations`) |
| Email confirmed | **Not reported** | derivable from Supabase `auth.users.email_confirmed_at` |
| Trial started | Same as registration (the trial starts at account creation) | `accounts.trial_started_at` |
| First menu created | **Not reported** | derivable from `menus.created_at` |
| First screen paired | **Not reported** | derivable from `displays` / `activity_events` (pair) |
| First content published | **Not reported** | `activity_events` (publish), `displays.confirmed_at` (TV-confirmed) |

**Unknown.** I couldn't read the aggregated traffic or registration numbers: the developer console requires a signed-in developer account, and I didn't sign in or query production data. So I can't say whether the problem is traffic quality, the landing page or the signup step. Your "~50 visitors/day, ~0 trials" is the only figure in this audit and it is yours; I haven't verified it.

The console's channel table (Meta, Google Ads, Google organic, referral, direct) is the first thing to read. If most visitors are direct or come from one ad, traffic quality and message match matter more than page copy.

### Interactions checked

- **Links:** every CTA link resolves, and `/signup` → `/login?mode=up` works.
- **Not exercised:** a real signup end to end. That would create a production account. The flow is email → password → confirmation email → link → dashboard.
- **Not misleading:** the landing copy matches the code on trial length, screens, no card, grace and prices.
- **Live checkout:** whether trial users can actually pay depends on `STRIPE_LIVE_ENABLED`, which I can't see. If it's off, trials can start but can't convert to paid.

### Minimum privacy-conscious tracking (recommended, not implemented)

The rule: extend the existing cookieless, aggregate collector. No third-party scripts, no cookies, no personal data. Events are counted per day, and per channel where the visit has one.

1. `cta_click` with `{location: hero|sticky|pricing|final|tv-check}`. Is the page convincing anyone?
2. `signup_view`: did they arrive at the form?
3. `signup_submit` and `signup_error {code}`: did the form or validation stop them?
4. `confirmation_sent` and `email_confirmed` (server-side, from Supabase): does the email step lose people?
5. Server-side activation milestones from existing tables, as counts per signup cohort:
   - `first_menu_saved`
   - `first_screen_paired`
   - `first_publish`
   - `tv_confirmed_playing`

These answer "where do they drop?" without tracking anyone individually.

---

## 5. Scorecard (current site)

| Category | Max | Score | Evidence | Why it matters | Improvement | Priority | Confidence |
| --- | ---: | ---: | --- | --- | --- | --- | --- |
| Value proposition clarity | 15 | **10** | Clear headline about "the TV you already have". Subhead is technical ("compatible smart TV's web browser", "digital signage"). No mention of templates or speed. | NN/g: the value must land in about 10 s. | Outcome headline plus a plain-language subhead naming templates, phone updates and no extra box. | Critical | High |
| Above-the-fold effectiveness | 15 | **10** | Desktop: headline, CTA, reassurance and visual all visible. Mobile: visual begins at the fold edge. | 57% of viewing time is above the fold. | On mobile, show the result (a real board) in the first screen; trim the subhead. | High | High |
| Problem/solution | 10 | **4** | No section names the customer's pain; the page is a list of capabilities. | Pain framing motivates action for problem-aware visitors. Strong for some audiences, unproven for Pekko. | Name 3–4 real jobs (wrong prices, no designer, hardware cost, day-parts). | Medium | Medium |
| Product visuals & demonstration | 10 | **6** | Attractive sample boards, but illustrations rather than current output. No editor, gallery or item photos shown; nothing shows ease. | Visual proof answers "what will mine look like?" and "is it hard?". | Real template renders and a real editor screenshot, plus an interactive template switcher or 4-frame storyboard. | High | High |
| CTA clarity & prominence | 10 | **8** | Specific "Start free trial", repeated, header CTA. | Specific labels beat vague ones (NN/g). | Keep it. Add a low-commitment "Check my TV" path and keep the trial promise next to every CTA. | Medium | High |
| Trust & credibility | 10 | **3** | No customers, testimonials or logos (none exist). Footer is a personal name. No company or support info near CTAs. | NN/g: design quality, up-front disclosure and current content build trust. | Genuine signals only: a "made by" note, support email and response hours, the tested-TV list, the "nothing deleted" policy, a live demo. Collect real reviews from first customers. | High | Medium |
| Mobile UX & responsiveness | 10 | **6** | No overflow; nav works. 15,566 px (≈19 screens); visual below fold; LCP 4.2 s on Lighthouse mobile. | Attention falls off after two screenfuls; speed affects bounce. | Cut to about 8 sections, visual first, sticky mobile CTA, lighter images. | High | High |
| Signup friction & trial messaging | 10 | **6** | Landing trial messaging is excellent. The signup form has only 2 fields, but the page loses trial context, then email confirmation, then an 8-step onboarding that isn't menu-first. | Baymard: perceived friction drives abandonment. OpenView: time-to-value drives activation. | Repeat "14 days free · no card" on the signup page; consider confirming email later; start onboarding in the menu designer. | Critical | Medium (funnel unmeasured) |
| Objection handling & differentiation | 5 | **3** | FAQ covers hardware, compatibility, trial, connection and plans, but sits at the bottom. The template differentiator isn't stated. | Unanswered "will it work for me?" stalls decisions. | Promote the 30-second TV check; add "Already have a Canva menu?" and "Is it hard?". | Medium | High |
| Performance & accessibility | 5 | **3** | Lighthouse mobile: performance 71, accessibility 100, LCP 4.2 s, TBT 590 ms. | Bounce rises with load time (Google). | Responsive images, defer non-critical JS, fewer DOM nodes. | Medium | High |
| **Total** | **100** | **59** | | | | | |

### The five biggest likely conversion obstacles

1. **The page sells last quarter's product.** Templates, the guided editor and item photos, the clearest answer to "will mine look good and be easy?", are missing. The hero speaks in technical terms.
2. **Nobody can see where visitors drop.** Without CTA-click, signup-view and confirmation data, we can't tell landing-page failure from signup failure. *This is the first fix.*
3. **Long, unanchored time to first value.** Signup page without trial context → email confirmation → 8-step checklist before the user sees their own menu. *(Hypothesis; measure it.)*
4. **Compatibility doubt without a cheap way to resolve it.** "Will it work on my TV?" is answered only in the FAQ. The page could offer a no-signup TV check that the product already supports.
5. **Thin credibility.** No real customers yet, a personal-name footer and no visible support promise. It can't be faked, but there are honest ways to strengthen it.

Mobile length and speed (15.5k px, LCP 4.2 s) amplify all five.

---

## 6. Prioritised recommendations

**Critical**
1. Add the funnel events in §4. Without them, any redesign is unmeasurable.
2. Rewrite the hero around the outcome and the templates (Option B direction). Real template render first on mobile.
3. Carry the trial promise onto the signup page ("14 days free · no card · cancel by doing nothing") and match its look to the marketing site.

**High**
4. Replace the menu-boards section with the template gallery, item photos and the guided editor, using real renders and real UI.
5. Promote the 30-second, no-account TV check near the hero and in the objections block.
6. Make onboarding menu-first: after signup, open the template gallery, so the user sees their menu before pairing a TV.
7. Shorten the mobile page to about 8 sections. Move video, PowerPoint and non-restaurant examples to Features.
8. Genuine trust: who runs Pekko, support email and hours, the tested-TV list, "nothing deleted when the trial ends", privacy (no ad trackers).

**Medium**
9. Image and JS weight to reach LCP ≤ 2.5 s on mobile.
10. A problem-first page (Option A) as the dedicated landing page for Meta ads.
11. Evaluate email confirmation timing, e.g. let users into the designer first and confirm before publishing. This is a product and security decision; not changed here.

**Low**
12. Fix the stale `docs/billing/COMMERCIAL_RULES.md` grace statement.

See `docs/cro/COMPARISON.md` for the two directions and `docs/cro/ROADMAP.md` for sequencing.
