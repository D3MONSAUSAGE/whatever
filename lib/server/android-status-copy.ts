/**
 * Play launch: status-only wording for the Android app (+14).
 *
 * +14 sends no custom client header. Dio leaves the dart:io default User-Agent
 * "Dart/<version> (dart:io)". Browsers cannot send that UA, so a lenient
 * case-insensitive prefix match on "Dart/" is the +14 signal. A future
 * `X-Pekko-Client: android/<version>` header is also accepted.
 *
 * Applied in one place (`withLocalizedErrors`) after error localization.
 * Web requests are returned unchanged (same Response object). `code` and
 * `plan_name` are never rewritten.
 */

/** Case-insensitive purchase / web-steering phrases that must not appear in app copy. */
export const PURCHASE_STEERING =
  /choose a plan|elija un plan|pick a plan|seleccione un plan|upgrade(?: your)? plan|update your payment|update your card|actualice|manage billing|administrar facturación|\bcheckout\b|\bdashboard\b|\bpricing\b|\bbilling\b|\bfacturación\b|\bprecios\b|\$/i;

export function isAndroidAppRequest(req: Request): boolean {
  const ua = (req.headers.get("user-agent") ?? "").trim();
  if (ua.toLowerCase().startsWith("dart/")) return true;
  const client = (req.headers.get("x-pekko-client") ?? "").trim();
  return /^android(?:\/|$)/i.test(client);
}

type StatusCopyCase = { id: string; from: RegExp; to: string | ((match: RegExpMatchArray) => string) };

/** Exact known API/warning/error sentences (EN + ES), including dated forms. */
export const STATUS_COPY_CASES: readonly StatusCopyCase[] = [
  {
    id: "warning_expired",
    from: /^Your free trial has ended, so your screens are paused\. Your content and settings are saved\. Choose a plan to turn them back on\.$/,
    to: "Your free trial has ended, so your screens are paused. Your content and settings are saved.",
  },
  {
    id: "warning_canceled",
    from: /^Your plan isn't active, so your screens are paused\. Your content and settings are saved\. Choose a plan to turn them back on\.$/,
    to: "Your plan isn't active, so your screens are paused. Your content and settings are saved.",
  },
  {
    id: "warning_trial_grace",
    from: /^Your free trial has ended\. Screens keep playing until ([^.]+)\. Choose a plan to keep them on\.$/,
    to: (m) => `Your free trial has ended. Screens keep playing until ${m[1]}.`,
  },
  {
    id: "warning_past_due_grace_days",
    from: /^Your payment grace ends in \d+ days?, on ([^.]+)\. Update your payment method to keep your screens playing\. Your content is not deleted\.$/,
    to: (m) => `Payment for your plan is past due. Screens keep playing until ${m[1]}. Your content is not deleted.`,
  },
  {
    id: "warning_past_due_before_date",
    from: /^We couldn't take your last payment\. Update your payment method before ([^.]+) to keep your screens playing\.$/,
    to: (m) => `Payment for your plan is past due. Screens keep playing until ${m[1]}.`,
  },
  {
    id: "warning_past_due_no_date",
    from: /^We couldn't take your last payment\. Update your payment method to keep your screens playing\.$/,
    to: "Payment for your plan is past due. Your content is not deleted.",
  },
  {
    id: "error_subscription_inactive",
    from: /^Your plan isn't active, so new screens can't be added\. Choose a plan to continue\.$/,
    to: "Your plan isn't active, so new screens can't be added.",
  },
  {
    id: "error_screen_limit",
    from: /^Your plan's screen limit is reached\. Choose a plan with more screens, or pause another screen first\.$/,
    to: "Your plan's screen limit is reached. Pause another screen to pair this one.",
  },
  {
    id: "error_subscription_inactive_es",
    from: /^Su plan no está activo, por lo que no se pueden agregar pantallas nuevas\. Elija un plan para continuar\.$/,
    to: "Su plan no está activo, por lo que no se pueden agregar pantallas nuevas.",
  },
  {
    id: "error_screen_limit_es",
    from: /^Alcanzó el límite de pantallas de su plan\. Elija un plan con más pantallas o pause otra pantalla primero\.$/,
    to: "Alcanzó el límite de pantallas de su plan. Pause otra pantalla para vincular esta.",
  },
  {
    id: "checkout_choose_plan",
    from: /^Choose a plan\.$/,
    to: "That isn't available in this app.",
  },
  {
    id: "checkout_manage_billing",
    from: /^Use Manage billing to change this plan\.$/,
    to: "Your plan can't be changed in this app.",
  },
  {
    id: "checkout_card_declined",
    from: /^Your card was declined for this plan change, so your plan didn't change\. Update your card in Manage billing, then try again\.$/,
    to: "Your card was declined, so your plan didn't change.",
  },
  {
    id: "checkout_unavailable",
    from: /^Checkout isn't available yet\.$/,
    to: "That isn't available in this app.",
  },
  {
    id: "portal_unavailable",
    from: /^Billing isn't available yet\.$/,
    to: "That isn't available in this app.",
  },
  {
    id: "portal_not_owner",
    from: /^Only the account owner can manage billing\.$/,
    to: "Only the account owner can manage the plan.",
  },
  {
    id: "rollout_notice_unenforced",
    from: /^You're an early Pekko customer\. Enforcement is off, so your 14-day transition has not started\. You keep full access and get a notice before billing changes\. Your content stays\.$/,
    to: "You're an early Pekko customer. Enforcement is off, so your 14-day transition has not started. You keep full access and get a notice before any change. Your content stays.",
  },
];

const GENERIC_EN = "Your screens are paused. Your content and settings are saved.";
const GENERIC_ES = "Sus pantallas están en pausa. Su contenido y su configuración están guardados.";

function looksSpanish(text: string): boolean {
  return /\b(su plan|sus pantallas|elija|actualice|facturación|prueba gratis)\b/i.test(text);
}

function applyKnown(text: string): string | null {
  for (const item of STATUS_COPY_CASES) {
    const match = text.match(item.from);
    if (match) return typeof item.to === "function" ? item.to(match) : item.to;
  }
  return null;
}

function dropSteeringSentences(text: string): string {
  const parts = text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  const kept = parts.filter((s) => !PURCHASE_STEERING.test(s));
  return kept.join(" ");
}

/** Rewrite one user-visible sentence. Unchanged when it has no steering words. */
export function statusOnlyText(text: string): string {
  if (!PURCHASE_STEERING.test(text)) return text;
  const known = applyKnown(text);
  if (known) return known;
  const stripped = dropSteeringSentences(text);
  if (stripped && !PURCHASE_STEERING.test(stripped)) return stripped;
  return looksSpanish(text) ? GENERIC_ES : GENERIC_EN;
}

const SENTENCE_KEYS = new Set(["error", "rollout_notice"]);

function rewriteValue(value: unknown): { value: unknown; changed: boolean } {
  if (typeof value === "string") {
    const next = statusOnlyText(value);
    return next === value ? { value, changed: false } : { value: next, changed: true };
  }
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((item) => {
      const r = rewriteValue(item);
      if (r.changed) changed = true;
      return r.value;
    });
    return { value: changed ? next : value, changed };
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    let changed = false;
    for (const [key, item] of Object.entries(record)) {
      if (key === "code" || key === "plan_name" || key === "billing_url" || key === "action" || key === "kind" || key === "reason" || key === "plan" || key === "state") {
        out[key] = item;
        continue;
      }
      if (key === "message" || key === "title" || SENTENCE_KEYS.has(key) || (item && typeof item === "object")) {
        const r = rewriteValue(item);
        out[key] = r.value;
        if (r.changed) changed = true;
      } else {
        out[key] = item;
      }
    }
    return { value: changed ? out : value, changed };
  }
  return { value, changed: false };
}

/**
 * For Android-app requests, rewrite user-visible warning/error sentences in a
 * JSON body. Non-app requests and unchanged bodies return the original Response.
 */
export async function rewriteAndroidStatusCopy(req: Request, res: Response): Promise<Response> {
  if (!isAndroidAppRequest(req)) return res;
  if (!(res.headers.get("content-type") || "").includes("application/json")) return res;
  let body: unknown;
  try {
    body = await res.clone().json();
  } catch {
    return res;
  }
  const rewritten = rewriteValue(body);
  if (!rewritten.changed) return res;
  const headers = new Headers(res.headers);
  headers.delete("content-length");
  return new Response(JSON.stringify(rewritten.value), { status: res.status, headers });
}
