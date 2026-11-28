# Guest menu creation: audit, architecture and plan

Status: **Phases 1–2 (guest editor, claim and resume), analytics integration points and the hero copy are implemented behind `GUEST_EDITOR` (off by default).** Sharing (Phase 4) is not built yet. Audited against `main` at `a580f12` (Nov 28 2026). See §9 for what was built and how to turn it on.

Principle: let customers experience the value of Pekko before asking them for commitment.

## 0. Summary

- **The guest editor needs no new editor.** The real menu designer (`TemplateEditor`, `components/menu-templates.tsx`) already draws every board in the browser with the same SVG the TV gets, and it already has an account-less `preview` mode. Guest mode is that mode, made complete.
- **Guest work stays in the visitor's browser until they create an account.** Nothing is written to the database or storage for anonymous visitors: no new RLS, no anonymous uploads, no cleanup job, no new cost or abuse surface. On sign-up or sign-in, one authenticated call turns the draft into a normal draft board in the account, through the existing save and upload routes and their checks.
- **Email confirmation is off in production** (`docs/auth-email-hook.md`: "Confirm email: OFF (E4). Sign-ups log in immediately"). Sign-up returns a session in the same tab, so a browser-held draft is claimable right away. That makes the browser-held design reliable today. If confirmation is ever turned on, the plan adds a server handoff (§4.4).
- **Two blockers to confirm before building** (§8): whether email confirmation is still off, and where the Meta Pixel lives. There is no Meta Pixel or Conversions API code in this repository.
- **Order of work:** guest editor and hand-off first (Phases 1–2), analytics alongside them (Phase 3), sharing last (Phase 4), so sharing never delays the core change.

## 1. Audit

### 1.1 Website calls to action

All trial CTAs point to `/signup`, which redirects to `/login?mode=up` (`app/signup/page.tsx`).

| Where | Component | Label | Funnel event |
|---|---|---|---|
| Header (desktop) | `PeekPage` in `components/site/peek/shell.tsx` | Create my free menu | `cta_click:nav` |
| Phone menu sheet | `PeekMenu` children, same file | Create my free menu | `cta_click:nav` |
| Hero | `HomePeek` in `components/site/peek/home-peek.tsx` (`hero-cta`) | Create my free menu | `cta_click:hero` |
| Demo | `home-peek.tsx` | Make this menu for free | `cta_click:demo` |
| Pricing cards (home) | `PeekPricingCards` in `components/site/peek/sections.tsx` | Create my free menu | `cta_click:pricing` |
| Final CTA (home) | `PeekFinal`, same file | Create my free menu | `cta_click:final` |
| Sticky phone bar | `StickyCta` in `components/site/marketing/home-b-client.tsx` | Create my free menu | `cta_click:sticky` |
| `/features`, `/pricing`, `/faq` page heads and final CTAs | `components/site/peek/pages.tsx`, `sections.tsx` | Create my free menu | not tracked |
| Footer | `PeekFooter` | Create my free menu | not tracked |
| "Choose plan" (pricing, signed-in path) | `sections.tsx` → `/dashboard/billing` | Choose {plan} | not tracked |

Reuse: every CTA goes through `TrialLink` or `SIGNUP_HREF`, so changing the destination is a one-place change per CTA. "Choose plan" must keep going to billing.

### 1.2 Homepage interactive demo

`LiveDemo` (`home-b-client.tsx`) loads the real renderer (`designSvg` from `lib/menu-design-svg.ts`) and the board fonts on demand. State is `current` (a `MENU_DESIGNS` id) plus `{ title, itemName, itemPrice }`; it edits the first item of the first section. The CTA is a plain link, so the state is lost on click.

Reuse: the demo's template ids are the editor's design ids, and its document is `designDocument(design)` with three fields changed. Carrying it into the editor means handing over `{ design, title, itemName, itemPrice }`. No conversion is needed.

### 1.3 Menu editor and template selection

- `DesignGallery` / `TemplateGallery` and `TemplateEditor` in `components/menu-templates.tsx` (1,662 lines), mounted by `components/menu-boards.tsx` inside the dashboard.
- **Engines:** `design` (22 premium templates), `layout` (7 original layouts), `classic` (3 themes). The preview for `design` and `layout` is a client-side SVG identical to the TV image (fidelity tests). `classic` previews by calling the server (`POST /api/menus/preview`, signed in).
- **Account-less mode already exists:** `preview` (used by the `/preview` screenshot harness) swaps the media library for bundled samples and turns save into a "preview only" toast. Uploads are disabled in it.
- **Account dependencies inside the editor:**
  - `/api/menu-templates` for the rollout flags;
  - `/api/layout-studio` and `/api/media` for the library;
  - `/api/media` and `/api/media/upload` for uploads;
  - `/api/layout-studio` for saving;
  - `/api/layout-studio/assign` for screens;
  - `displays` and `brand` props.

Reuse: the whole editor, gallery, renderer, fit report, item photos, colours, fonts, Advanced options and orientation. Modify: generalise `preview` into a `guest` data source (library = browser-held images, save = local, publish/display = account prompt). For guests, `classic` is left out of the gallery because its preview needs the server; `design` and `layout` cover 29 designs.

### 1.4 Authentication and route guards

- Supabase Auth, email and password. `/login?mode=up` is sign-up (`SignupView`), `/login` is sign-in.
- **Dashboard guard is client-side:** `components/shell.tsx` redirects to `/login?next=<path>` when there is no session.
- **API guard:** `requireAdmin` (`lib/server/auth.ts`) checks the bearer token and creates the account on first use (`ensure_account`). There is no database trigger on sign-up.
- **Return path:** `?next=` accepts only `/dashboard…` paths (`lib/safe-next.ts`). The email-link `next` accepts only `/dashboard…` and `/reset-password` (`lib/auth-confirm.ts`).
- **Production auth settings** (from `docs/auth-email-hook.md`, Nov 14): email confirmation off, sign-up logs in immediately, Resend SMTP.

Reuse: sign-up, sign-in, `?next=` and the confirm page, all unchanged. The resume target is a `/dashboard/…` path, so no change to the allow-lists is needed.

### 1.5 Menu creation, storage and publishing

- Boards are rows in `public.menus` (RLS on, no client policies: server only).
- **Save:** `POST /api/layout-studio` with `requireAdmin` and `rejectSubscriptionWrite` (trial or paid only). Drafts never move a screen. Publish renders a PNG with resvg and swaps it on the screens showing the board.
- **Assign:** `POST /api/layout-studio/assign`.
- **Screens and plan limits:** `lib/server/entitlements.ts` (trial: 5 screens, 14 days; `PLAYBACK_GRACE_DAYS` 3).
- **Pairing:** the TV opens `/pair` (`player.html`) and shows a code; the owner enters it at `/dashboard/screens/add` (`POST /api/displays/pair`, rate-limited per user and IP).

Reuse: all of it, unchanged. A claimed guest board is saved as an ordinary **draft**, so publishing, pairing and every subscription check stay exactly where they are.

### 1.6 Images and media uploads

- **Images:** `POST /api/media` (multipart). Requires an account and an allowed subscription write. Limits: 60 uploads per user per 15 minutes, 15 MB, PNG/JPEG checked by `checkImage`. HEIC is converted in the browser (`asUploadImage`).
- **Videos:** signed upload (`/api/media/upload` + `/complete`) with server conversion.
- **Bucket:** `media` is private (signed URLs). There are no anonymous storage policies.

Reuse: guests keep images in the browser; on claim they go through `POST /api/media` with its normal checks. **Guests get photos and logos, not video**: video needs server conversion, storage and cost. It stays an account feature, offered after sign-up.

### 1.7 Registration and onboarding

- `SignupView`: email and password, then `signUp`.
- **With a session returned** (production today): `trackSignupCompleted`, then `router.replace(next)`. Without one: a "check your inbox" state with resend.
- **Onboarding v2** (`0036`, `lib/server/onboarding-hooks.ts`): menu saved, screen paired and published milestones are stamped from server actions.

Reuse: the sign-up form, with an optional context headline ("Your menu is ready…") passed by `?intent=`. The milestones already record "menu saved" when the claim saves the board.

### 1.8 Analytics and conversion tracking

| System | What it is | Limits |
|---|---|---|
| `funnel_daily` (0032), `lib/funnel.ts`, `/api/traffic/event` | Cookieless daily counters per (event, detail). Fixed allow-list enforced by a CHECK constraint. Skipped for signed-in browsers and DNT/GPC. | **No visitor or session id**, so it cannot follow one visitor through a funnel. New events need a migration (CHECK constraint). |
| Website traffic (0031) | Cookieless landings and pages. | Same. |
| HeyCatch (`instrumentation-client.ts`, `lib/heycatch*.ts`) | Product analytics with an anonymous visitor id, identity on sign-in (`identifyUser`), `signup_completed`. Autocapture only on marketing pages; scrubbed URLs; DNT/GPC respected. | Per-visitor funnels are possible here. |
| First-touch attribution (`lib/signup-attribution.ts`, 0024) | UTMs and referrer kept 90 days in localStorage and a cookie, written to the account on first authenticated load. | Already survives the guest journey (same browser). |
| Developer console (`lib/server/dev-analytics`) | Registrations, trials, first TV, publish and paid, derived from account tables; internal accounts excluded via `analytics_exclusions`. | Server-side stages already exist. |
| **Meta Pixel / Conversions API** | **None found in this repository** (no `fbq`, no pixel id, no CAPI). | Needs clarification (§8). |

Internal activity: counters skip signed-in browsers, and the console excludes internal accounts. A team member testing while **signed out** is counted as a visitor today; the plan adds a browser-level internal mark (§6).

### 1.9 Security policies and database permissions

- App tables: RLS on, either no client policies (server-only via service role) or owner-read policies. Every write goes through API routes with `requireAdmin` and an `account_id` filter.
- Rate limits: `rate_limits` table via `enforceLimit` (per user, per IP for pairing).
- Media: private bucket, server-signed URLs, ownership checks on every referenced media id (`keepOwnItemPhotos`, layout save checks).

The plan adds **no** anonymous write path to any of these, and no change to existing policies.

## 2. Reuse vs modify

| Area | Reuse as is | Modify | New |
|---|---|---|---|
| Editor | Renderer, gallery, steps, fit, item photos, colours, fonts, orientation | `TemplateEditor`: `preview` becomes a `guest` data source; save, publish and upload call guest handlers | Guest page shell and action bar |
| Demo | `LiveDemo` | CTA hands its state to the guest editor | none |
| Auth | Sign-up, sign-in, `?next=`, confirm page | `SignupView` optional intent headline | none |
| Storage | Save, upload and assign routes | none | `POST /api/guest/claim` (authenticated) and a small dedupe table |
| Analytics | funnel counters, HeyCatch, attribution, console stages | funnel allow-list | Guest events (migration), internal mark |
| Pairing, publishing, billing | All | none | Resume routing after the claim |

## 3. Recommended architecture

### 3.1 Guest editor route

- **Routes:** `/create` (English) and `/es/create` (Spanish, through the existing Spanish rewrite), public, `noindex`. The Peek marketing header stays, simplified to the logo, language switch, "Log in" and the guest action bar.
- **Loading:** the editor is a client component loaded on the route (code-split from the marketing pages). Board fonts load as today.
- **Entry options:**
  - `/create` opens the gallery;
  - `/create?design=<id>` opens a design;
  - the demo hands over its state (§3.3);
  - an existing guest draft resumes where it left off.
- **Guest capabilities:** every editor step for `design` and `layout` boards:
  - business name, logo, sections and items (add, edit, remove, reorder), prices, descriptions;
  - board and item photos (upload; sample photos where the design has one);
  - colours, fonts, Advanced options, orientation;
  - fit report and split warnings;
  - full-screen TV preview.
- **Not for guests:** video, Brand Kit, the media library (none yet), screens, and classic boards (server preview). These become available after sign-up with the board.

### 3.2 Guest draft storage (browser)

- **IndexedDB**, one store `pekko_guest`:
  - `draft`: `{ draftId (random UUID), name, document, engine, updatedAt, version }`;
  - `images`: `{ localId, blob, name, w, h }`.
  - Written on every change (debounced 500 ms) and read on load, so a refresh, a back button or an auth redirect never loses work.
- **Image references:** guest images get ids of the form `guest:<uuid>`. The renderer gets them as `blob:` object URLs through the same `art` map it uses for signed URLs, so the preview is identical. On claim each `guest:` id is uploaded and swapped for the real media id.
- **Image limits** (keep phones well inside storage quotas): at most 12 images and 30 MB in total. Each image is downscaled in the browser to at most 2400 px on the long side. HEIC becomes JPEG (existing `asUploadImage`), PNG and JPEG only (the renderer can't draw WebP, as today).
- **Fallback:** if IndexedDB is unavailable (some private modes), the editor still works for the visit and says once that the draft lasts only while the tab is open.
- **One draft per browser** in the first version. Starting from the demo or a new design while a draft exists asks: "Continue your menu" or "Start a new one".

### 3.3 Demo → editor hand-off

"Make this menu for free" writes `{ design, title, itemName, itemPrice }` to the guest draft (creating `designDocument(design)` with those values, exactly as the demo draws it) and navigates to `/create`. There is no URL payload, so nothing is lost or leaked in links, and a refresh keeps it. The editor opens on the **Menu** step with the board already showing what the visitor typed.

### 3.4 Account-dependent actions

The guest action bar (and the finished-preview screen) offers four actions:

| Action | Guest behaviour | After sign-up (resume) |
|---|---|---|
| **Display on my TV** | Prompt: "Your menu is ready. Create your free account to show it on your TV." | Claim → board saved as a draft → `/dashboard/screens/add?menu=<id>` (pair a TV, then publish to it). Accounts that already have screens go to the board's publish dialog. |
| **Save my menu** | Prompt: "Love your menu? Create a free account to keep it and change it anytime." | Claim → board opens in the dashboard editor, saved as a draft. |
| **Share my menu** | Prompt: "Your menu looks great. Create your free account to share it with your customers." | Claim → board opens with the share sheet (Phase 4). |
| **Download image** | Same as Share. | Same. |

- **Prompt format:** a small sheet over the preview, in the Peek style. It shows the board thumbnail, one headline for the action, the two-field sign-up form inline (email, password), "Already have an account? Log in", and the trial line.
- **Inline sign-up:** it calls the same `signUp`, with the same validation, errors and tracking as `SignupView`, so the visitor never leaves their menu. If a confirmation email is required (§4.4), the sheet shows the existing "check your inbox" state.
- **Log in:** goes to `/login?next=/dashboard/claim?intent=<action>`, which works because the guest draft is in the browser.

### 3.5 Claim (ownership transfer)

`/dashboard/claim?intent=display|save|share` is a client page inside the dashboard shell, so the existing guard applies:

1. Read the guest draft. If there is none, go to `/dashboard`.
2. Upload each `guest:` image through the existing `POST /api/media` (authenticated, rate-limited, `checkImage`) and replace the ids.
3. Call `POST /api/guest/claim` with `{ draftId, name, document }`:
   - `requireAdmin` and `rejectSubscriptionWrite`;
   - `parseLayout` and the existing media ownership checks;
   - save as a **draft** via `saveLayoutForAccount`;
   - record `(account_id, draft_id) → menu_id` in `guest_claims` (unique), so a retry, a second tab or a reload returns the same board instead of a duplicate.
4. Delete the local draft only after the server confirms. Then route by intent (table above).

- **Failures:**
  - Images are re-uploaded only if their id is still `guest:`; finished uploads are remembered in the draft, so a retry doesn't duplicate media.
  - Network failure: the draft stays, and the page offers "Try again".
- **Ended trial or a blocked plan** (an existing customer signing in): the claim is refused by the same subscription rule. The draft stays in the browser and the page explains, with a link to billing. Guests never bypass plan rules.

### 3.6 Security and cost

- **No anonymous writes.** Nothing guest-related reaches the database or storage until the visitor is signed in, and then only through routes that already enforce ownership, limits and plan rules.
- **New table `guest_claims`:** RLS on, no policies, service role only. Columns: `account_id`, `draft_id`, `menu_id`, `created_at`; unique `(account_id, draft_id)`; cascades with the account.
- **Claim endpoint limits:** rate-limited per user (e.g. 20 per 15 minutes) and capped by document size.
- **Cost:** the guest editor is static assets plus client rendering, so there is no server cost per guest. Server work starts at the claim, as for any customer today.
- **Cleanup:** none needed server-side. Browser drafts older than 30 days are discarded on the next visit.

### 3.7 Above-the-fold copy

- **Under the hero CTA**, replace "14-day free trial · No credit card required" with "**Start now, no account or credit card needed.** 14-day free trial when you're ready." (Spanish to match.)
- **Hardware line:** keep "Already have a Smart TV? No extra hardware needed."
- **Labels:** "Create my free menu" stays (it is accurate: it now opens the editor). The demo CTA "Make this menu for free" stays.
- **Pricing CTAs:** these are for people choosing a plan. They keep opening the editor, since the trial starts at sign-up.

No layout or visual changes.

## 4. Edge cases and how they're handled

### 4.1 Refresh, back button, closing the tab
The IndexedDB draft is written on change and restored on load. A visitor can return to `/create` from any page header ("Continue my menu" appears in the header when a draft exists).

### 4.2 Existing users
Log in from the prompt, or from the header with a draft present. The claim adds the board to their account as a draft without touching their other boards, screens or schedules.

### 4.3 Two tabs
One draft id per browser. The claim is idempotent on `(account, draft_id)`, so two tabs that both claim get the same board.

### 4.4 Email confirmation (if turned on later)
A different device or browser (for example, Instagram's in-app browser, then Mail opening Safari) cannot see the IndexedDB draft. Two options, in order of preference:

- **(a) 6-digit code:** confirm with a code typed in the same tab (`verifyOtp`). The draft stays in the same browser. This needs the confirmation email to include `{{ .Token }}`, which the existing auth-email hook supports.
- **(b) Server handoff:** upload the draft before sign-up, under a random claim id stored in the user's `user_metadata`. This adds an anonymous write path, needs a cleanup job, and is not recommended unless (a) is impossible.

Today confirmation is off, so neither is needed for launch. This is listed so the decision is deliberate.

### 4.5 Instagram and Facebook in-app browsers
With confirmation off, sign-up completes inside the in-app browser, where the draft lives. IndexedDB works there; it is tested in the plan.

### 4.6 Storage blocked or full
The editor shows a notice and still lets the visitor continue to sign-up. The claim reads from memory in the same tab when storage failed.

### 4.7 Abuse
No server writes before sign-up, so guest abuse can only cost the visitor's own browser. Sign-up abuse is unchanged (Supabase limits).

## 5. Preview and sharing

### 5.1 Finished-preview moment
The editor's full-screen TV preview gets a "Your menu is ready" state:

- a TV frame with the board (the same SVG as the TV image);
- Peek's happy face;
- the four actions from §3.4.

It is reached from a **Preview** button that's always visible, and automatically once the visitor has changed the title and at least one item.

### 5.2 Sharing (Phase 4, after sign-up)
- **Image:** the exact TV PNG from the existing server renderer (`/api/layout-studio/preview` returns the PNG for signed-in accounts), so the shared image is pixel-identical to the TV.
- **On phones:** the Web Share API with the file (`navigator.share({ files })`) opens the native share sheet: Instagram, Facebook, WhatsApp, Messages. It is available in iOS Safari and Android Chrome and checked with `navigator.canShare`.
- **Fallback everywhere:** "Download image" (PNG; a square 1080×1080 crop option for Instagram feed is optional).
- **No direct posting** to Instagram or Facebook. That needs app review and each customer's page permissions, so we don't promise it.
- **Intent preserved:** "Share" before sign-up resumes on the share sheet after the claim.
- **Not in the first version:** a public share link for a menu. It would need a public read path for boards, so it is a separate decision.

## 6. Analytics

### 6.1 Two layers
- **`funnel_daily` counters:** privacy-first daily totals, as today. Extended with guest events through a migration that widens the CHECK allow-list; no other schema change.
- **HeyCatch:** per-visitor funnel, the only place where "where exactly do people drop" can be answered visitor by visitor. Events are sent with an opaque visitor id, no content, and DNT/GPC respected, as today. Sign-up already calls `identifyUser`, which joins the anonymous guest session to the account.

### 6.2 Event map

| Funnel step | Event (detail) | Where | Layer |
|---|---|---|---|
| Landing page viewed | existing landing count / `$pageview` | marketing | both (existing) |
| Demo engaged | `template_try:demo` (existing) | demo | both |
| Create menu clicked | `cta_click:<location>` (existing) | CTAs | both |
| Guest editor opened | `guest_open:<from>` (`demo`, `cta`, `resume`, `direct`) | `/create` load | both |
| Template selected | `guest_template` (no design name in counters; design id in HeyCatch) | gallery | both |
| Customization started | `guest_edit` (once per draft) | first change | both |
| Menu previewed | `guest_preview` | preview opened | both |
| Save / Display / Share clicked | `guest_action:save\|display\|share\|download` | action bar | both |
| Registration prompted | `signup_prompt:<action>` | sheet shown | both |
| Registration started | `signup_submit` (existing) | sign-up | both |
| Registration failed | `signup_error:<code>` (existing) | sign-up | both |
| Registration abandoned | derived: prompted − submitted, per action | console | derived |
| Registration completed | `signup_completed` (existing HeyCatch); registrations (existing console stage) | sign-up | both |
| Guest menu transferred | `guest_claimed:<intent>` (server-recorded via `guest_claims`) | claim | server + HeyCatch |
| TV paired | existing console stage (first TV) | server | server |
| Menu published | existing console stage | server | server |
| Subscription started | existing console stage (paid) | server | server |

- **No double counting:** each event fires once per page (`oncePerPage`) or once per draft (`guest_edit`, stored in the draft). Server stages are derived once from tables.
- **Signed-in exclusion:** `trackFunnel` already skips signed-in browsers. The claim and later stages are server-derived, with internal accounts excluded by `analytics_exclusions` as today.
- **Internal mark (new):** when a staff, developer or internal account signs in on a browser, set a `pekko_internal` local flag, so later signed-out testing on that browser is not counted in either layer.
- **Attribution:** first-touch UTMs and referrer are already kept in the browser for 90 days and written to the account on first authenticated load, so they survive the guest journey without change.
- **Meta:** see §8. Once we know where the pixel lives, map `signup_prompt` → `Lead`, `signup_completed` → `CompleteRegistration`, `guest_claimed:display` → custom `DisplayOnTV`, and subscription → `Subscribe`. Server events would use event ids for deduplication.

### 6.3 Console
A "Guest funnel" panel in the developer console (Website traffic tab) adds the steps above to the existing sign-up funnel.

## 7. Implementation plan

| Phase | Scope | Main files | Risk |
|---|---|---|---|
| **1. Guest editor** | `/create` route; `guest` data source in `TemplateEditor`; IndexedDB draft and images; demo hand-off; finished preview; action bar with prompts (inline sign-up); EN/ES | `app/create`, `components/menu-templates.tsx`, `lib/guest-draft.ts`, `components/guest/*`, `home-b-client.tsx` | Editor coupling to account APIs; mobile memory with large photos |
| **2. Claim and resume** | `guest_claims` migration; `POST /api/guest/claim`; `/dashboard/claim`; routing to pairing, editor and share; existing users; ended-trial handling | `supabase/migrations/0038_guest_claims.sql`, `app/api/guest/claim`, `app/dashboard/claim` | Duplicate boards (covered by the unique key); partial uploads |
| **3. Analytics** | 0039 funnel allow-list; events; HeyCatch events; internal mark; console panel; Meta mapping once confirmed | `lib/funnel.ts`, `lib/heycatch-events.ts`, dev console | Counting twice (covered by once-per rules) |
| **4. Copy and CTAs** | Hero sub-line EN/ES; every trial CTA → `/create` (Choose plan unchanged) | `home-peek.tsx`, `sections.tsx`, `pages.tsx`, `shell.tsx`, i18n | none |
| **5. Sharing** | Share sheet with the server PNG, download fallback, intent resume | dashboard board actions | Browser support (fallback covers it) |

- **Rollout:** behind `GUEST_EDITOR` (`off` / `on`), independent of the marketing and web-app switches. With it off, every CTA goes to `/signup` as today, so it has a one-variable rollback.
- **Tests:**
  - unit: draft store, image swap, claim idempotency, intent routing, subscription refusal, event allow-list;
  - e2e (production build): demo → editor with values kept; full guest menu with a photo; refresh; prompt → sign-up → claim → pairing page; existing user log-in claim; two tabs;
  - phone and desktop, EN/ES, including the Instagram in-app viewport.
- **Performance budget:** `/create` interactive in under 3 s on a mid-range phone over 4G; marketing pages unchanged (the editor is never in their bundle).

## 8. Decisions needed before building

1. **Email confirmation:** is "Confirm email" still off in Supabase? The plan relies on it for the first version. If it must be on, choose §4.4 (a), the 6-digit code.
2. **Meta Pixel:** there is no pixel or Conversions API code in this repository. Is Meta connected through HeyCatch, Google Tag Manager, or Vercel, or does it need adding? The answer decides where the Meta events in §6.2 go.
3. **Guest scope:** confirm that guests get templates and original layouts with photos and logos, but not video or classic boards (both need the server).
4. **Hero sub-line wording** (§3.7).

## 9. Implementation (Nov 28 2026)

### Turning it on
1. Apply `supabase/migrations/0038_guest_funnel_events.sql` (counter allow-list) and `0039_guest_claims.sql` (claim idempotency). Rollbacks are in `supabase/rollback/`. Until 0039 exists, `POST /api/guest/claim` answers 404 and the visitor's menu stays in their browser.
2. Set `GUEST_EDITOR=on` in Vercel and redeploy. Every Peek trial CTA then opens `/create`, and the hero shows "No account or credit card required to start creating." plus the "No extra hardware" line.
3. Rollback: unset `GUEST_EDITOR` (or set `off`) and redeploy. CTAs return to `/signup`; `/create` and `/dashboard/claim` become 404. Boards already claimed stay in their accounts.

### What was built
| Piece | Files |
|---|---|
| Flag | `lib/guest-editor-flag.ts` |
| Browser draft (IndexedDB + memory fallback, photo downscale, limits, 30-day expiry) | `lib/guest-draft.ts` |
| Guest page (gallery, resume, editor, "Your menu is ready", sign-up sheet) | `app/create/*`, `components/guest/guest-create.tsx`, `components/guest/guest-auth-sheet.tsx` |
| Real editor in guest mode (browser library, no video, account actions) | `components/menu-templates.tsx` (`guest` prop) |
| Demo hand-off | `GuestDemoLink` in `components/site/marketing/home-b-client.tsx` |
| Claim and resume | `app/api/guest/claim/route.ts`, `lib/guest-claim.ts`, `app/dashboard/claim/page.tsx`, `components/guest/guest-claim.tsx`; pairing then opens the board with that TV (`components/displays-screen.tsx`) |
| Analytics | `lib/conversion-events.ts` (HeyCatch + counters + `registerConversionSink` for Meta), `lib/funnel.ts`, migration 0038; internal mark set for developer accounts (`lib/dev-access.ts`) |
| Renderer | `safeDesignHref` / `safeImageHref` accept same-page `blob:` URLs so browser-held photos draw in the preview |

### Not done / follow-ups
- Sharing and download (Phase 4). The `share` and `download` intents currently resume on the board in the dashboard.
- "Show on my TV" after pairing opens the board with the new TV preselected. The owner still presses Publish, which is the existing flow; there is no auto-publish.
- The shared `SiteNav`/`SiteFooter` (support, contact, legal pages) still link to `/signup`. They are Pantalla's shared layout, so they are left for coordination.
- Classic full-screen boards and video stay account-only.
- Real iOS Safari and Android Chrome were not available here. Tested in Chromium with mobile emulation; IndexedDB Blob storage is supported in Safari 14+ and Chrome.
