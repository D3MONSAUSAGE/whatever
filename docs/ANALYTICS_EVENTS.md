# Website and guest-editor analytics events (for the Meta conversion integration)

For Pantalla: everything the website and guest editor already record, and the one place to connect Meta. **No Meta
Pixel or Conversions API exists in this repository today**, and nothing below assumes one.

## 1. Where events go today

| Sink | What it is | Identity | Code |
|---|---|---|---|
| HeyCatch | Per-visitor product analytics (funnels, sessions). Joined to the account at sign-up/sign-in by `identifyUser(userId)` (opaque Supabase id only). | Anonymous visitor id → account id | `lib/heycatch.ts`, `lib/heycatch-events.ts` |
| Daily counters (`funnel_daily`, migrations 0032 + 0038) | Cookieless totals per (day, event, detail). No ids of any kind. Shown in the developer console. | None | `lib/funnel.ts`, `lib/funnel-client.ts`, `/api/traffic/event` |
| Account data | Registrations, confirmed emails, trials, first TV, first publish, paid: derived from tables, internal accounts excluded (`analytics_exclusions`). | Account | `lib/server/dev-analytics` |
| **Ad platforms (Meta)** | **Not connected.** One registration point: `registerConversionSink` (§3). | — | `lib/conversion-events.ts` |

Everything respects Do Not Track / Global Privacy Control (nothing is sent). Event properties are fixed values only:
never menu text, business names, prices, emails or file names.

## 2. The events

All guest-editor steps go through `conversion(event, props)` in `lib/conversion-events.ts`, which fans out to HeyCatch, the
daily counter (where listed) and every registered sink.

| Funnel step | Event | Properties | Daily counter | Fired in |
|---|---|---|---|---|
| Landing page viewed | `$pageview` (HeyCatch) / landing count | — | traffic (0031) | every marketing page |
| Interactive demo engaged | `template_try` | detail `hero` \| `demo` | yes | `components/site/marketing/home-b-client.tsx`, `components/site/peek/client.tsx` |
| Create menu clicked | `cta_click` | detail `hero` \| `demo` \| `pricing` \| `final` \| `sticky` \| `nav` | yes | `TrialLink`, `GuestDemoLink` |
| Guest editor opened | `guest_editor_opened` | detail `demo` \| `cta` \| `resume` \| `direct` | `guest_open` | `components/guest/guest-create.tsx` |
| Template selected | `guest_template_selected` | `design` (template id) | no | same |
| Menu customization started | `guest_customization_started` | `design` (once per draft) | `guest_edit` | same |
| Menu previewed | `guest_menu_previewed` | — (once per page) | `guest_preview` | same |
| Save / display / share / download clicked | `guest_action_clicked` | detail `save` \| `display` \| `share` \| `download` | `guest_action` | same |
| Registration prompted (sheet shown) | `registration_prompted` | detail = action | `signup_prompt` | `components/guest/guest-auth-sheet.tsx` |
| Registration started (submitted) | `registration_started` | detail `signup` \| `login`, `action` | `signup_submit` (sign-up only) | same |
| Registration failed | `registration_failed` | detail = reduced code (`invalid_email`, `rate_limit`, `already_registered`, …), `mode` | `signup_error` | same |
| Registration completed | `registration_completed` | `mode` (`up` \| `in`), `action`. New accounts also send HeyCatch `signup_completed` (here, or on `/auth/confirm` when the email link finishes sign-up) | via account data | same |
| Guest draft migrated to the account | `guest_draft_migrated` | detail = action | via `guest_claims` (0039) | `components/guest/guest-claim.tsx` |
| TV paired | — | — | account data (first TV) | server |
| Menu published | — | — | account data (first publish) | server |
| Subscription started | — | — | account data (paid) | server (Stripe webhooks) |

The /signup page keeps its own events (`signup_view`, `signup_submit`, `signup_error`) and HeyCatch `signup_completed`.

**Not double-counted:** page-level steps use `oncePerPage`; customization is once per draft (stored with the draft);
server steps are derived once from tables. **Internal activity:** signed-in browsers never send counters; a browser
where a developer account has signed in is marked `pekko_internal` and sends nothing afterwards, even signed out;
internal accounts are excluded server-side. **Attribution:** first-touch UTMs and referrer are kept 90 days in the
browser (`lib/signup-attribution.ts`) and written to the account on its first signed-in load, so they survive the guest
editor and sign-up unchanged.

## 3. Connecting Meta (the integration hook)

```ts
import { registerConversionSink, AD_PLATFORM_MAP } from "@/lib/conversion-events";

registerConversionSink((event, props) => {
  const map = AD_PLATFORM_MAP[event];
  if (!map.meta) return;                       // not a conversion: never sent to Meta
  // e.g. window.fbq?.(map.custom ? "trackCustom" : "track", map.meta, {}, { eventID: props.eventId });
});
```

- Register once on the client (for example from a small component in the root layout), only after consent rules allow it.
- `props.eventId` is unique per event: send the same id from any server-side Conversions API call for deduplication.
- `AD_PLATFORM_MAP` is the agreed classification (Nov 28 2026). Showing the sign-up sheet is **not** a Lead:

| Event | Meta event |
|---|---|
| `registration_prompted`, `registration_started`, `registration_failed`, `guest_editor_opened`, `guest_template_selected`, `guest_action_clicked` | not sent |
| `guest_customization_started` | custom `MenuCustomized` (engagement) |
| `guest_menu_previewed` | custom `MenuPreviewed` (engagement) |
| `registration_completed` | `CompleteRegistration` |
| `guest_draft_migrated` | `Lead` (an account that saved a real menu) |
| Trial / subscription | from the server (account tables, Stripe webhooks) as `StartTrial` / `Subscribe`, not from the browser |

- Keep the existing rules: no personal data in Meta parameters (never email, menu text or business name unless hashed
  under Meta's advanced-matching rules and covered by the privacy policy), and respect DNT/GPC like the other sinks.
- Update the privacy policy (EN/ES) before sending anything to Meta.
