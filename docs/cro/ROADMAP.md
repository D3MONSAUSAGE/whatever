# CRO implementation roadmap

Nothing here is implemented. Each item needs your approval before it ships. Ordered by expected impact relative to effort.

## 0. Measure first (prerequisite, about 1 day)

Extend the existing cookieless collector (`lib/traffic.ts`, `/api/traffic/collect`). No cookies, no third-party scripts, no personal data; daily aggregates by channel.

| Event | Where | Question it answers |
| --- | --- | --- |
| `cta_click {location}` | marketing pages | Does the page persuade? |
| `signup_view` | `/login?mode=up` (count only) | Do clicks reach the form? |
| `signup_submit`, `signup_error {code}` | signup form | Does the form stop people? |
| `email_confirmed` | server, from Supabase `email_confirmed_at` | Does confirmation lose people? |
| `first_menu_saved`, `first_screen_paired`, `first_publish`, `tv_confirmed_playing` | server, from existing tables, per signup cohort | Do trials activate? |

Add a "Funnel" panel to the developer console's Website traffic tab, then record a 2-week baseline before changing the page.

## Quick wins (hours each)

| # | Change | Why |
| --- | --- | --- |
| Q1 | Hero subhead in plain language: "Pick a template, type your menu, add photos, publish to your TV. Change it any time from your phone." Drop "digital signage" and "web browser" from the first screen. | Value proposition clarity |
| Q2 | Replace the "Digital menu boards" layout and font list with 3 real template renders and "22 templates · item photos". | The page undersells the product |
| Q3 | Signup page: add "14 days free · No credit card · Every feature" under the title and match the marketing theme. | Keeps the promise through the click |
| Q4 | Promote "Check your TV first: open pekkotv.com/pair on the TV" beside the hero CTA. | Compatibility doubt |
| Q5 | Footer and hero trust: who runs Pekko, a support email with response hours, "Nothing is deleted when your trial ends". | Genuine credibility |
| Q6 | Responsive image sizes and next-gen formats for the hero and example boards. | Mobile LCP 4.2 s |

## Medium effort (days)

| # | Change |
| --- | --- |
| M1 | Ship Option B as the home page, with the template switcher (static images) and storyboard. Trim to about 8 sections; move video, PowerPoint and non-restaurant examples to `/features`. |
| M2 | Menu-first onboarding: after the first sign-in, open the design gallery. The checklist starts with "Make your menu", and pairing comes after the user has seen their menu in the preview. |
| M3 | Option A as a dedicated ad landing page (noindex) for Meta campaigns, with UTM-matched copy. |
| M4 | Reduce JavaScript on marketing pages: defer non-critical scripts, cut DOM size. Target LCP ≤ 2.5 s and TBT < 200 ms on mobile Lighthouse. |

## Higher-effort experiments (weeks, or product decisions)

| # | Experiment | Note |
| --- | --- | --- |
| H1 | In-page "type your business name" demo: re-render a template live with the visitor's name, using the same client-side SVG renderer as the app. | Strong "show, don't tell". Needs care with page weight. |
| H2 | Confirm email later: allow the designer before confirmation, and require it before publishing or pairing. | Security and abuse review needed; not decided here. |
| H3 | Google sign-in. | Fewer typed fields; requires an auth provider setup. |
| H4 | Collect genuine proof: ask the first active customers for a quote and a photo of their screen, with permission. | The only way to raise the trust score honestly. |
| H5 | Spanish-language ad landing page for Hispanic-owned restaurants. | Hypothesis; the product is already bilingual. |

## How to judge results at about 50 visits/day

- Compare stage rates, not just the final number: CTA click, signup view → submit, confirmed, first menu.
- Use at least 2–4 weeks per change.
- Change one major thing at a time on organic traffic. Use paid traffic, where you control volume, for A vs B.
- Treat small differences as noise until the stage counts are in the dozens.
