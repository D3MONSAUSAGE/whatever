import { fail } from "./http";
import { billingEnforced, loadEffectiveEntitlement, subscriptionWritesAllowed } from "./entitlements";
import { entitlementsLocale, type Locale } from "./locale";

/** Stable code so Android status-only wording can match on it. */
export const SUBSCRIPTION_WRITE_CODE = "subscription_inactive" as const;

export function subscriptionWriteError(state: string, locale: Locale = "en"): { error: string; code: typeof SUBSCRIPTION_WRITE_CODE; status: 403 } {
  const es = locale === "es";
  if (state === "trial_grace") {
    return {
      error: es
        ? "Su prueba gratis terminó. Las pantallas que ya están encendidas pueden seguir reproduciendo, pero la edición y la publicación están bloqueadas hasta que elija un plan."
        : "Your free trial has ended. Screens already on can keep playing, but editing and publishing are locked until you choose a plan.",
      code: SUBSCRIPTION_WRITE_CODE,
      status: 403,
    };
  }
  return {
    error: es
      ? "Su plan no está activo, así que la edición y la publicación están bloqueadas. Elija un plan para continuar."
      : "Your plan isn't active, so editing and publishing are locked. Choose a plan to continue.",
    code: SUBSCRIPTION_WRITE_CODE,
    status: 403,
  };
}

/** 403 when this org may not edit, upload, or publish. Fail open on a database error. */
export async function rejectSubscriptionWrite(accountId: string, req?: Request): Promise<Response | null> {
  if (!billingEnforced()) return null;
  const e = await loadEffectiveEntitlement(accountId);
  if (e === "error" || e === null) return null;
  if (subscriptionWritesAllowed(e)) return null;
  const locale = req ? await entitlementsLocale(accountId, req) : "en";
  const body = subscriptionWriteError(e.state, locale);
  return fail(body.error, body.status, body.code);
}
