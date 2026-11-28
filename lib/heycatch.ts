/**
 * HeyCatch website analytics (https://heycatch.ai/agents.md, "website (landing)" setup). Client-safe: no server imports.
 *
 * Scope: only the public marketing pages, the same twelve URLs the cookieless visit counter measures (the six
 * MARKETING_PATHS in English and under /es). Everything else (dashboard, developer console, sign-in/sign-up,
 * the TV player, pairing, legal pages, API routes) must never send an event.
 */
import { isTrackedPath } from "@/lib/traffic";

/** Publishable project key (safe in client code, per the guide). */
export const HEYCATCH_PROJECT_KEY = "hck_pk_9lmBdPD6VPOp5doQibPsa2HoSp0i7SH7";

/** True when an event captured while the browser is on `pathname` belongs to a public marketing page. */
export function heycatchPathAllowed(pathname: string | null | undefined): boolean {
  return isTrackedPath(pathname ?? "");
}

/**
 * HeyCatch `beforeSend` hook: keeps an event only while the page is a marketing page, so a soft navigation from a
 * marketing page into sign-in or the dashboard (same browser document, SDK still loaded) sends nothing.
 */
export function heycatchBeforeSend<E>(event: E | null, pathname: string | undefined = typeof location === "undefined" ? undefined : location.pathname): E | null {
  return event && heycatchPathAllowed(pathname) ? event : null;
}
