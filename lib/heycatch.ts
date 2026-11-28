/**
 * HeyCatch analytics for pekkotv.com (https://heycatch.ai/agents.md): one SDK instance for the whole site.
 * Marketing pages, sign-in/sign-up and the signed-in web app are one project, so there is a single `init`
 * (instrumentation-client.ts) and no `site` tag. Client-safe: no server imports.
 *
 * Privacy rules enforced here, in the SDK's `beforeSend` hook, on every event:
 *  - Do Not Track / Global Privacy Control: the SDK starts opted out (see `heycatchInitConfig`) and never opts in.
 *  - Only the public marketing pages keep click autocapture. Everywhere else (sign-in, dashboard) clicks, rage clicks,
 *    form submits and other autocapture events are dropped, because the text and attributes of what was clicked can be
 *    customer content (screen names, menu names, emails typed into fields). Pageviews, identify and our own events stay.
 *  - Page titles are removed outside marketing pages (a title can be a menu or screen name).
 *  - URLs are scrubbed: no hash fragment (Supabase puts session tokens there) and no token/code/email query values.
 *  - Staff and developer areas send nothing.
 */
import { isTrackedPath } from "@/lib/traffic";
import { browserOptedOut } from "@/lib/funnel-client";

/** Publishable project key (safe in client code, per the guide). */
export const HEYCATCH_PROJECT_KEY = "hck_pk_9lmBdPD6VPOp5doQibPsa2HoSp0i7SH7";

/** Path prefixes that never send anything (internal tools). */
const SILENT_PREFIXES = ["/developer", "/dashboard/staff", "/dev", "/preview", "/layout-studio", "/api"];

/** Events that may leave a non-marketing page: pageviews, identity, and our own (non-$) events. */
const APP_SYSTEM_EVENTS = new Set(["$pageview", "$pageleave", "$identify", "$set", "$opt_in", "$opt_out"]);

/** Routes that only redirect (/signup goes straight to /login?mode=up): their pageview would double-count the visit. */
const REDIRECT_ONLY = new Set(["/signup"]);

/** Query parameters whose values are never sent. */
const SECRET_PARAMS = /^(token|token_hash|access_token|refresh_token|provider_token|code|error_description|email|type|password|otp|key|apikey)$/i;
/** Paths where even the remaining query string is dropped (auth links). */
const AUTH_PATH = /^\/(auth|reset-password|forgot-password)(\/|$)/;

/** Properties that hold a URL. */
const URL_KEYS = ["$current_url", "$referrer", "$session_entry_url", "$session_entry_referrer", "$initial_current_url", "$initial_referrer"];

export function pathOf(url: string): string {
  try { return new URL(url, "https://pekkotv.com").pathname; } catch { return ""; }
}

/** The URL with no fragment and no secret query values. Unparseable values become an empty string. */
export function scrubUrl(raw: unknown): unknown {
  if (typeof raw !== "string" || !raw) return raw;
  let u: URL;
  try { u = new URL(raw); } catch { return ""; }
  u.hash = "";
  if (AUTH_PATH.test(u.pathname)) u.search = "";
  else for (const k of [...u.searchParams.keys()]) if (SECRET_PARAMS.test(k)) u.searchParams.delete(k);
  return u.toString();
}

export function heycatchPathSilent(pathname: string): boolean {
  return SILENT_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

type Evt = { event: string; properties: Record<string, unknown>; [k: string]: unknown };

/**
 * `beforeSend` for HeyCatch: returns the (scrubbed) event to send, or null to drop it.
 * `pathname` defaults to the page the browser is on right now.
 */
export function heycatchBeforeSend<E extends Evt>(event: E | null, pathname: string | undefined = typeof location === "undefined" ? undefined : location.pathname): E | null {
  if (!event || typeof pathname !== "string") return null;
  if (heycatchPathSilent(pathname)) return null;
  if (REDIRECT_ONLY.has(pathname) && String(event.event) === "$pageview") return null;
  const marketing = isTrackedPath(pathname);
  const name = String(event.event);
  if (!marketing && name.startsWith("$") && !APP_SYSTEM_EVENTS.has(name)) return null;
  const p = event.properties;
  if (p) {
    for (const k of URL_KEYS) if (k in p) p[k] = scrubUrl(p[k]);
    if (!marketing) { delete p.title; delete p.$title; }
  }
  return event;
}

/** `init` options. DNT and GPC start the SDK opted out (no requests, no cookie, no device id) and it is never opted in. */
export function heycatchInitConfig() {
  const optedOut = browserOptedOut();
  return {
    projectKey: HEYCATCH_PROJECT_KEY,
    install: { framework: "nextjs", frameworkVersion: "15", agent: "other" },
    optOutCapturingByDefault: optedOut,
    respectDnt: true,
    // Send each event as it happens (not in a 3 s batch): some navigations here are full page loads (email-confirmation
    // redirect, language switch, external links) and a queued batch would be lost with the page. The guide's advice for
    // multi-page sites.
    requestBatching: false,
    beforeSend: (event: Evt | null) => heycatchBeforeSend(event),
  } as const;
}
