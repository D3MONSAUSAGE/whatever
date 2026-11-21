import { fail, json } from "./http";
import { requestLocale } from "./error-codes";
import { billingEnforced, loadEffectiveEntitlement, subscriptionWritesAllowed } from "./entitlements";
import { entitlementsLocale, type Locale } from "./locale";

/** Stable code so Android status-only wording can match on it. */
export const SUBSCRIPTION_WRITE_CODE = "subscription_inactive" as const;
export const PLAN_CHECK_UNAVAILABLE_CODE = "plan_check_unavailable" as const;
export const PLAN_CHECK_RETRY_AFTER_SECONDS = "5" as const;

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

export function planCheckUnavailableError(locale: Locale = "en"): {
  error: string;
  code: typeof PLAN_CHECK_UNAVAILABLE_CODE;
  status: 503;
} {
  return {
    error: locale === "es"
      ? "No se pudo verificar su plan. Intente de nuevo."
      : "Couldn't check your plan. Try again.",
    code: PLAN_CHECK_UNAVAILABLE_CODE,
    status: 503,
  };
}

/**
 * 403 when this org may not edit, upload, publish, or change plan-restricted settings.
 * Fail closed with 503 plan_check_unavailable (Retry-After) when entitlement verification fails
 * or returns no row; never grant write access on a lookup failure.
 */
export async function rejectSubscriptionWrite(accountId: string, req?: Request): Promise<Response | null> {
  if (!billingEnforced()) return null;
  const e = await loadEffectiveEntitlement(accountId);
  if (e === "error" || e === null) {
    const locale = req
      ? (e === "error" ? requestLocale(req) : await entitlementsLocale(accountId, req))
      : "en";
    const body = planCheckUnavailableError(locale);
    return json({ error: body.error, code: body.code }, body.status, {
      "Retry-After": PLAN_CHECK_RETRY_AFTER_SECONDS,
    });
  }
  if (subscriptionWritesAllowed(e)) return null;
  const locale = req ? await entitlementsLocale(accountId, req) : "en";
  const body = subscriptionWriteError(e.state, locale);
  return fail(body.error, body.status, body.code);
}
