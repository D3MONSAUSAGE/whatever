/**
 * HeyCatch identity and business events for the web app. Opaque ids only: never an email, name, business name or any
 * customer content, and nothing is sent when the browser asks not to be tracked (the SDK is opted out then, and we
 * also skip the calls). Client-only; every call is a no-op during SSR.
 */
import { analytics } from "@heycatch/sdk";
import { browserOptedOut } from "@/lib/funnel-client";

const SIGNUP_MARK = "pekko_hc_signup_";
const ID_MARK = "pekko_hc_id";

/** Link this browser's anonymous visitor to the account (Supabase user id: a random UUID, not the email). */
export function identifyUser(userId: string | null | undefined): void {
  if (!userId || typeof window === "undefined" || browserOptedOut()) return;
  // One identify per account per tab: a page reload keeps the identity the SDK already stored.
  try { if (sessionStorage.getItem(ID_MARK) === userId) return; sessionStorage.setItem(ID_MARK, userId); } catch { /* storage blocked */ }
  analytics.setIdentity(userId);
}

export function resetUserIdentity(): void {
  if (typeof window === "undefined" || browserOptedOut()) return;
  try { sessionStorage.removeItem(ID_MARK); } catch { /* storage blocked */ }
  analytics.resetIdentity();
}

/**
 * Sends `signup_completed` once for a newly created, confirmed account. Called only where creation is proven:
 * the email-confirmation page after `verifyOtp` succeeds for a `signup` link, or sign-up that returned a session
 * straight away. A re-clicked link fails verification before this runs, a reload never reaches it, and a local mark
 * per account stops a second send from the same browser. No properties other than the sign-in method.
 */
export function trackSignupCompleted(userId: string | null | undefined): boolean {
  if (!userId || typeof window === "undefined" || browserOptedOut()) return false;
  try {
    if (localStorage.getItem(SIGNUP_MARK + userId)) return false;
    localStorage.setItem(SIGNUP_MARK + userId, "1");
  } catch { /* storage blocked: still send once for this call */ }
  identifyUser(userId);
  analytics.trackEvent("signup_completed", { method: "email_password" });
  return true;
}

/**
 * Product events for the guest-editor funnel (docs/GUEST_EDITOR_PLAN.md §6). Opaque, fixed property values only:
 * never menu text, names or prices. Integration point for ad-platform mapping lives in lib/conversion-events.ts.
 */
export function trackProductEvent(name: string, props: Record<string, string | number | boolean> = {}): void {
  if (typeof window === "undefined" || browserOptedOut()) return;
  try { analytics.trackEvent(name, props); } catch { /* analytics must never affect the page */ }
}
