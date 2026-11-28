/**
 * Conversion events for the guest-editor funnel: one call per step, fanned out to every analytics sink.
 *
 * Sinks today:
 *  - HeyCatch (per-visitor funnel, anonymous until sign-up, joined to the account by identifyUser);
 *  - the cookieless daily counters (funnel_daily) for the steps listed in COUNTER_STEPS.
 *
 * Ad platforms (Meta) are NOT wired: whether a Meta Pixel / Conversions API exists is being audited separately, so
 * nothing here assumes one. `registerConversionSink` is the single integration point: once the configuration is
 * known, register a sink that maps events with `AD_PLATFORM_MAP` (below), for example to `fbq("track", …)` with an
 * `eventID` equal to the `eventId` passed here, for deduplication with a server-side event.
 *
 * Classification (agreed Nov 28 2026): showing the sign-up sheet is NOT a lead. Prompts, attempts, completions and
 * product engagement are separate events, and only completions and a menu saved to an account are conversions.
 */
import { browserOptedOut, browserSignedIn, trackFunnel } from "@/lib/funnel-client";
import type { FunnelEvent } from "@/lib/funnel";
import { trackProductEvent } from "@/lib/heycatch-events";

export type ConversionEvent =
  | "guest_editor_opened"        // /create loaded (source: demo | cta | resume | direct)
  | "guest_template_selected"    // a design picked in the guest gallery
  | "guest_customization_started"// first real change to a guest menu (once per draft)
  | "guest_menu_previewed"       // "Your menu is ready" preview opened
  | "guest_action_clicked"       // save | display | share | download
  | "registration_prompted"      // the sign-up sheet shown (NOT a lead)
  | "registration_started"       // sign-up or log-in submitted from the sheet
  | "registration_failed"        // with a reduced error code
  | "registration_completed"     // account created, or existing account signed in, from the guest flow
  | "guest_draft_migrated";      // the guest menu is saved in the account (Phase 2)

export type ConversionProps = Record<string, string | number | boolean>;
export type ConversionSink = (event: ConversionEvent, props: ConversionProps & { eventId: string }) => void;

/**
 * Suggested ad-platform mapping, for whoever connects Meta. `null` = don't send (not a conversion). Engagement events
 * are custom events, never Lead. Trial and subscription conversions come from the server (account tables), not here.
 */
export const AD_PLATFORM_MAP: Record<ConversionEvent, { meta: string | null; custom?: boolean }> = {
  guest_editor_opened: { meta: null },
  guest_template_selected: { meta: null },
  guest_customization_started: { meta: "MenuCustomized", custom: true },
  guest_menu_previewed: { meta: "MenuPreviewed", custom: true },
  guest_action_clicked: { meta: null },
  registration_prompted: { meta: null },
  registration_started: { meta: null },
  registration_failed: { meta: null },
  registration_completed: { meta: "CompleteRegistration" },
  guest_draft_migrated: { meta: "Lead" },
};

/** Steps also counted by the cookieless daily counter (event + detail allow-list in lib/funnel.ts / migration 0038). */
const COUNTER_STEPS: Partial<Record<ConversionEvent, FunnelEvent>> = {
  guest_editor_opened: "guest_open",
  guest_customization_started: "guest_edit",
  guest_menu_previewed: "guest_preview",
  guest_action_clicked: "guest_action",
  registration_prompted: "signup_prompt",
};

const sinks = new Set<ConversionSink>();
export function registerConversionSink(sink: ConversionSink): () => void {
  sinks.add(sink);
  return () => { sinks.delete(sink); };
}

const INTERNAL_MARK = "pekko_internal";
/** Browsers where a staff, developer or internal account has signed in are never counted, even when signed out. */
export function markInternalBrowser(): void {
  try { localStorage.setItem(INTERNAL_MARK, "1"); } catch { /* storage blocked */ }
}
export function internalBrowser(): boolean {
  try { return localStorage.getItem(INTERNAL_MARK) === "1"; } catch { return false; }
}

const once = new Set<string>();

/**
 * Records one funnel step. `oncePerPage` drops repeats of the same event and detail until the next page load.
 * The daily counter skips signed-in browsers (as today); HeyCatch and sinks get the post-sign-up steps too.
 */
export function conversion(event: ConversionEvent, props: ConversionProps = {}, opts: { oncePerPage?: boolean } = {}): void {
  if (typeof window === "undefined" || browserOptedOut() || internalBrowser()) return;
  const detail = typeof props.detail === "string" ? props.detail : "";
  if (opts.oncePerPage) {
    const k = `${event}:${detail}`;
    if (once.has(k)) return;
    once.add(k);
  }
  const counter = COUNTER_STEPS[event];
  if (counter && !browserSignedIn()) trackFunnel(counter, detail);
  trackProductEvent(event, props);
  const eventId = `${event}.${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 8)}`;
  for (const sink of sinks) { try { sink(event, { ...props, eventId }); } catch { /* a sink must never break the page */ } }
}
