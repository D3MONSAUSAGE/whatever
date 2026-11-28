/**
 * Conversion funnel events (migration 0032). Client-safe: no server imports.
 *
 * Minimal and privacy-conscious, on top of the cookieless website-traffic counter (0031):
 *  - only the events and details below are accepted (anything else is dropped by the server);
 *  - nothing identifies a person: no email, no account or user id, no IP or user agent, no cookie;
 *  - each event is a daily counter, (day, event, detail) → count;
 *  - browsers that send Global Privacy Control or Do Not Track send nothing, and signed-in people are skipped.
 *
 * Later stages (registered, email confirmed, trial, first TV, first content on screen, paid) are not sent from
 * the browser: the developer console derives them from existing account tables.
 */
export const FUNNEL_EVENTS = [
  "cta_click", "signup_view", "signup_submit", "signup_error", "template_try",
  // Guest editor (migration 0038; recorded only once it is applied).
  "guest_open", "guest_edit", "guest_preview", "guest_action", "signup_prompt",
] as const;
export type FunnelEvent = (typeof FUNNEL_EVENTS)[number];

/** Where a trial CTA sits. */
export const CTA_LOCATIONS = ["hero", "demo", "final", "sticky", "nav", "pricing"] as const;
export type CtaLocation = (typeof CTA_LOCATIONS)[number];

/** Why a signup didn't go through: client validation or a reduced server error. Never the message itself. */
export const SIGNUP_ERROR_CODES = ["invalid_email", "short_password", "weak_password", "rate_limit", "network", "already_registered", "other"] as const;
export type SignupErrorCode = (typeof SIGNUP_ERROR_CODES)[number];

/** Which template preview a visitor used (counted once per page view). */
export const TEMPLATE_TRY_SPOTS = ["hero", "demo"] as const;

/** How a visitor reached the guest editor. */
export const GUEST_SOURCES = ["demo", "cta", "resume", "direct"] as const;
/** Account actions offered on a finished guest menu (also the sign-up sheet's reason). */
export const GUEST_ACTIONS = ["save", "display", "share", "download"] as const;

const DETAILS: Record<FunnelEvent, readonly string[]> = {
  cta_click: CTA_LOCATIONS,
  signup_view: [""],
  signup_submit: [""],
  signup_error: SIGNUP_ERROR_CODES,
  template_try: TEMPLATE_TRY_SPOTS,
  guest_open: GUEST_SOURCES,
  guest_edit: [""],
  guest_preview: [""],
  guest_action: GUEST_ACTIONS,
  signup_prompt: GUEST_ACTIONS,
};

export type FunnelBody = { event: FunnelEvent; detail?: string };

/** The (event, detail) pair to record, or null when the body isn't one of the allowed combinations. */
export function reduceFunnelEvent(body: unknown): { event: FunnelEvent; detail: string } | null {
  if (!body || typeof body !== "object") return null;
  const b = body as { event?: unknown; detail?: unknown };
  if (typeof b.event !== "string" || !(FUNNEL_EVENTS as readonly string[]).includes(b.event)) return null;
  const event = b.event as FunnelEvent;
  const detail = b.detail === undefined || b.detail === null ? "" : b.detail;
  if (typeof detail !== "string" || !DETAILS[event].includes(detail)) return null;
  return { event, detail };
}

/** Supabase sign-up error text → a reduced code (the text is never sent). */
export function signupErrorCode(message: string | null | undefined): SignupErrorCode {
  const text = (message || "").toLowerCase();
  if (text.includes("rate limit") || text.includes("too many") || text.includes("security purposes")) return "rate_limit";
  if (text.includes("fetch") || text.includes("network")) return "network";
  if (text.includes("already") && text.includes("registered")) return "already_registered";
  if (text.includes("weak")) return "weak_password";
  if (text.includes("password") && (text.includes("short") || text.includes("least"))) return "short_password";
  return "other";
}

/** Developer console shape (Website traffic tab, "Signup funnel" panel). */
export type DevFunnel = {
  /** false until migration 0032 is applied. Counts are then zero and nothing is invented. */
  collecting: boolean;
  firstDay: string | null;
  /** Ordered top-of-funnel stages. Registrations and confirmations come from account data, not the browser. */
  stages: { key: "landings" | "ctaClicks" | "signupViews" | "signupSubmits" | "registrations" | "confirmed"; count: number; fromPrevious: number | null }[];
  ctaByLocation: { location: CtaLocation; count: number }[];
  errorsByCode: { code: SignupErrorCode; count: number }[];
  templateTries: { spot: (typeof TEMPLATE_TRY_SPOTS)[number]; count: number }[];
};
