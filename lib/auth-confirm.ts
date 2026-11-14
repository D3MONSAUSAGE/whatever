/**
 * B2-07 option A: branded email links. Supabase emails link to
 *   https://pekkotv.com/auth/confirm?token_hash=…&type=…&next=…
 * instead of the raw <project>.supabase.co/auth/v1/verify address. The page verifies the
 * token_hash in the browser (where the session lives) after the owner presses a button,
 * so email link scanners that open the link do not use it up.
 */
import type { EmailOtpType } from "@supabase/supabase-js";

/** Link types the templates send. Anything else is refused. */
export const CONFIRM_TYPES = ["signup", "email", "recovery", "email_change"] as const;
export type ConfirmType = (typeof CONFIRM_TYPES)[number] & EmailOtpType;

/** Hosts whose absolute next URLs are accepted (only their path is kept). */
export const NEXT_HOSTS = ["pekkotv.com", "www.pekkotv.com", "pantalla-chi.vercel.app"] as const;

/** Same-site paths a link may land on after confirming. */
const SAFE_PATH = /^\/(dashboard(\/[A-Za-z0-9/_-]*)?|reset-password)(\?[^#]*)?$/;

export function isConfirmType(value: string | null | undefined): value is ConfirmType {
  return (CONFIRM_TYPES as readonly string[]).includes(value ?? "");
}

/**
 * Turn a next value into a same-site path, or null when it is not allowed.
 * Accepts a relative path, or an absolute https URL on an allowed host
 * (Supabase's {{ .RedirectTo }} is absolute, e.g. Android +13's
 * https://pantalla-chi.vercel.app/dashboard, which becomes /dashboard on pekkotv.com).
 */
export function safeAuthNext(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value || value.length > 300) return null;
  let path: string;
  if (value.startsWith("/")) {
    if (value.startsWith("//") || value.includes("\\")) return null;
    path = value;
  } else {
    let url: URL;
    try { url = new URL(value); } catch { return null; }
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    if (!(NEXT_HOSTS as readonly string[]).includes(url.hostname.toLowerCase())) return null;
    path = url.pathname + url.search;
  }
  return SAFE_PATH.test(path) ? path : null;
}

export type ConfirmPlan =
  | { ok: true; tokenHash: string; type: ConfirmType; next: string }
  | { ok: false; reason: "missing" | "type" };

/** Read the link. Recovery always continues to /reset-password so a new password is set. */
export function confirmPlan(params: URLSearchParams): ConfirmPlan {
  const tokenHash = params.get("token_hash")?.trim() ?? "";
  const type = params.get("type");
  if (!tokenHash || tokenHash.length > 200 || !/^[A-Za-z0-9_-]+$/.test(tokenHash)) return { ok: false, reason: "missing" };
  if (!isConfirmType(type)) return { ok: false, reason: "type" };
  if (type === "recovery") return { ok: true, tokenHash, type, next: "/reset-password" };
  const next = safeAuthNext(params.get("next"));
  if (type === "email_change") return { ok: true, tokenHash, type, next: next ?? "/dashboard/account" };
  return { ok: true, tokenHash, type, next: next ?? "/dashboard" };
}

export const CONFIRM_COPY: Record<ConfirmType, { title: string; lede: string; button: string; done: string }> = {
  signup: {
    title: "Confirm your email",
    lede: "Press the button to confirm your email and open your Pekko dashboard.",
    button: "Confirm my email",
    done: "Email confirmed. Opening your dashboard…",
  },
  email: {
    title: "Confirm your email",
    lede: "Press the button to confirm your email and open your Pekko dashboard.",
    button: "Confirm my email",
    done: "Email confirmed. Opening your dashboard…",
  },
  recovery: {
    title: "Reset your password",
    lede: "Press the button to continue. You'll choose a new password on the next screen.",
    button: "Continue to reset password",
    done: "Link checked. Opening the reset page…",
  },
  email_change: {
    title: "Confirm your new email",
    lede: "Press the button to confirm the change to your sign-in email.",
    button: "Confirm email change",
    done: "Email change confirmed. Opening your account…",
  },
};

/**
 * Host redirect for the old production alias. Only browser sign-in pages move to
 * pekkotv.com, so a session is created there. TVs (/tv, /pair, /player*, player.html)
 * and the Android app's API calls (/api/*) keep working on pantalla-chi.vercel.app,
 * because a TV's pairing lives in that origin's storage and the app uses it as API base.
 */
export const OLD_HOST = "pantalla-chi.vercel.app";
export const CANONICAL_ORIGIN = "https://pekkotv.com";
const REDIRECT_PATH = /^\/(auth(\/.*)?|dashboard(\/.*)?|login|forgot-password|reset-password)$/;

export function canonicalAuthRedirect(host: string | null | undefined, pathname: string, search: string): string | null {
  if ((host ?? "").toLowerCase().split(":")[0] !== OLD_HOST) return null;
  if (!REDIRECT_PATH.test(pathname)) return null;
  return `${CANONICAL_ORIGIN}${pathname}${search}`;
}
