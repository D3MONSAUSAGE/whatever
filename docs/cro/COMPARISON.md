# Option A vs Option B

Prototypes (private previews, not deployed; buttons are inert):

| Option | Preview | Local file |
| --- | --- | --- |
| A, problem-first | https://claude.ai/artifact/96h3tKCcz3JGm681QGvsXw | `docs/cro/prototypes/option-a.html` |
| B, outcome-first | https://claude.ai/artifact/QuySg5xpvjBWuVDnDgeET2 | `docs/cro/prototypes/option-b.html` |

Both use only real Pekko output: template boards rendered by the production renderer and screenshots of the real editor and gallery. They contain no testimonials, customer counts, savings figures or guarantees, and every claim maps to a feature in `docs/cro/CRO_AUDIT.md` §1.

## The two strategies

**A, "Your prices changed. Your menu didn't."**
- Opens on a recognisable pain: a taped printed menu with crossed-out prices, which turns into the live board, the real Modern Restaurant template.
- Four real problems, each with its fix: wrong prices, no designer, hardware or contracts, the breakfast board still up at lunch.
- Then three steps, templates, honest answers led by "check your TV in 30 seconds", pricing, final CTA.
- Light theme; a sticky CTA on mobile.

**B, "Beautiful digital menus on your TV in minutes."**
- On mobile the TV comes first, showing a real template. Visitors switch between 7 real templates by business type (Restaurant, Tacos, Café, Fast casual, BBQ, Brunch, Bar) before reading anything.
- A four-frame storyboard from empty screen to live menu, made of real gallery and editor screenshots.
- Then three outcomes, real templates, "good to know" facts (TV check, uploads, trial terms, Spanish), pricing, final CTA.
- Dark Pekko brand.

## Side by side

| | A, problem-first | B, outcome-first |
| --- | --- | --- |
| Clarity | Clear once you read the hero; the board appears after a short "before" moment. | Clear at a glance: the first thing on a phone is a menu on a TV. |
| Emotional motivation | **Stronger.** Names frustrations owners recognise. | Aspiration and ease ("in minutes", "no designer"). |
| Perceived ease | Good: three plain steps. | **Stronger.** The storyboard shows the real editor; the switcher feels like using the product. |
| Differentiation | "Use the TV you have" and "change from your phone". | **Stronger on design quality:** 22 templates, item photos, a preview identical to the TV. |
| Mobile | Text first, visual on the second screen; sticky CTA. | **Result in the first screen**, horizontal template chips. |
| Audience fit | Problem-aware owners: already using paper or a TV with a USB stick, burned by signage vendors. Interruption traffic (Meta). | Solution-aware searchers ("digital menu board", "menu TV app"): organic and Google search intent. |
| Main objections left | "Will mine look this good?" (answered later). Risk of sounding negative to owners without the problem. | "Is it really that quick for me?" The TV compatibility answer sits lower than in A. |
| Likely conversion strength | Motivation; strong for cold traffic that needs a reason to care. | Shows value fastest; strong for warm and intent traffic; template switching is engaging. |
| Likely weakness | Takes a beat to reach the product; depends on visitors recognising the pain. | Less urgency; relies on the visuals doing the persuading. |
| Implementation | Medium: new copy, a before/after component, problem cards; assets exist. | Medium: template switcher (static images), storyboard; assets exist. Both reuse the existing Next.js marketing components. |

## Projected scores (subjective estimates, same rubric; not measured)

| Category | Max | Current | A | B |
| --- | ---: | ---: | ---: | ---: |
| Value proposition clarity | 15 | 10 | 12 | 13 |
| Above-the-fold effectiveness | 15 | 10 | 12 | 14 |
| Problem/solution | 10 | 4 | 9 | 6 |
| Product visuals & demonstration | 10 | 6 | 8 | 10 |
| CTA clarity & prominence | 10 | 8 | 9 | 9 |
| Trust & credibility | 10 | 3 | 5 | 5 |
| Mobile UX & responsiveness | 10 | 6 | 8 | 9 |
| Signup friction & trial messaging* | 10 | 6 | 7 | 7 |
| Objection handling & differentiation | 5 | 3 | 5 | 4 |
| Performance & accessibility** | 5 | 3 | 4 | 4 |
| **Total** | **100** | **59** | **79** | **81** |

\* Both improve only the landing side. The signup page and onboarding (Roadmap items Q3 and M2) are what move this category further.
\*\* Assumes the prototypes' lighter pages ship with responsive images. Not measured on production.

Trust stays low in both because genuine proof (customer reviews, a case study) doesn't exist yet. That's the biggest remaining gap and only real customers can close it.

## Recommendation

**Test B first, on the main page, after the funnel events are live.**

1. B fixes the two highest-weighted problems: value proposition and above the fold. It shows the newest and most differentiated part of the product, and on a phone it shows the result in the first screen. That's where the current page loses the most (NN/g: 57% of viewing time is above the fold).
2. It needs no assumption about which pain a visitor has, which suits a home page that serves mixed traffic.
3. A's problem framing is more valuable as a **dedicated ad landing page** (`/lp/menu-prices` or similar) for Meta campaigns, where visitors weren't searching and need a reason to care. That's message match: the ad names the pain, the page continues it (Unbounce).

**Testing reality at about 50 visitors a day.** A 50/50 split test can't produce a reliable winner in a reasonable time at this volume, especially with very few conversions. The practical plan:
- Ship tracking first and record a 2-week baseline.
- Switch the home page to B and compare the funnel stages over the next 2–4 weeks: CTA-click rate, signup-view → submit, confirmed, first menu.
- Run A only on paid traffic you control. Judge by stage-level movement and qualitative signal (session counts per step, support questions), not by small differences in the final rate.

## Testable hypotheses

| # | Hypothesis | Metric | Variant |
| --- | --- | --- | --- |
| H1 | Showing a real template board in the first mobile screen increases the share of visitors who click a trial CTA. | `cta_click` / landings (mobile) | B hero vs current |
| H2 | Letting visitors switch templates by business type increases CTA clicks, because they see *their* kind of menu. | `cta_click` after interaction vs none; switcher interactions | B with / without switcher |
| H3 | Offering "Check my TV in 30 seconds (no account)" reduces compatibility hesitation without lowering trial starts. | `cta_click{tv-check}`; registrations | A or B, CTA present vs absent |
| H4 | Repeating "14 days free · no card" on the signup page increases form submissions. | `signup_submit` / `signup_view` | signup page copy |
| H5 | Opening the template gallery first after signup increases the share of new accounts that save a first menu within 24 h. | `first_menu_saved` within 24 h / registrations | onboarding order |
| H6 | For Meta traffic, the problem-first page produces more trial CTA clicks than the outcome-first page. | `cta_click` / landings for `utm_source=meta` | A vs B on ads |
| H7 | Moving email confirmation after the first menu (before publishing) increases activation. | `first_menu_saved`, `first_publish` | product and security decision; evaluate first |
