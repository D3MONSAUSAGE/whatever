/**
 * Play launch: status-only wording for the Android app (+14).
 *
 * +14 sends no custom client header. Dio leaves the dart:io default User-Agent
 * "Dart/<version> (dart:io)". Browsers cannot send that UA, so a lenient
 * case-insensitive prefix match on "Dart/" is the +14 signal. A future
 * `X-Pekko-Client: android/<version>` header is also accepted.
 *
 * Applied in one place (`withLocalizedErrors`) after error localization.
 * Only top-level `error` (when `code` is present), `warning.message` and
 * top-level `rollout_notice` are rewritten. Web requests are returned
 * unchanged (same Response object). `code` and `plan_name` are never rewritten.
 */

/** Purchase / web-steering phrases. Used as a narrow guard after code/kind matching, not as a walk of arbitrary strings. */
export const PURCHASE_STEERING =
  /choose a plan|elija un plan|pick a plan|seleccione un plan|\bupgrade\b|\bsubscribe\b|suscr[ií]base|update your payment|update your card|actualice|manage billing|administrar facturación|\bcheckout\b|\bdashboard\b|\bpricing\b|\bbilling\b|\bfacturación\b|\bprecios\b/i;

/** Error codes whose `error` text may carry plan/payment steering. Other codes are left untouched. */
const ERROR_CODES = new Set([
  "subscription_inactive",
  "screen_limit",
  "plan",
  "billing_unavailable",
  "subscription_exists",
  "payment_failed",
  "not_owner",
]);

/** Warning kinds whose message may carry plan/payment steering. */
const WARNING_KINDS = new Set(["expired", "canceled", "trial_ended", "payment_failed"]);

export function isAndroidAppRequest(req: Request): boolean {
  const ua = (req.headers.get("user-agent") ?? "").trim();
  if (ua.toLowerCase().startsWith("dart/")) return true;
  const client = (req.headers.get("x-pekko-client") ?? "").trim();
  return /^android(?:\/|$)/i.test(client);
}

export type StatusCopyCase = {
  id: string;
  from: RegExp;
  to: string | ((match: RegExpMatchArray) => string);
  code?: string;
  kind?: string;
};

/** Exact known API/warning/error sentences (EN + ES), keyed by error code or warning kind. */
export const STATUS_COPY_CASES: readonly StatusCopyCase[] = [
  {
    id: "warning_expired",
    kind: "expired",
    from: /^Your free trial has ended, so your screens are paused\. Your content and settings are saved\. Choose a plan to turn them back on\.$/,
    to: "Your free trial has ended, so your screens are paused. Your content and settings are saved.",
  },
  {
    id: "warning_canceled",
    kind: "canceled",
    from: /^Your plan isn't active, so your screens are paused\. Your content and settings are saved\. Choose a plan to turn them back on\.$/,
    to: "Your plan isn't active, so your screens are paused. Your content and settings are saved.",
  },
  {
    id: "warning_trial_grace",
    kind: "trial_ended",
    from: /^Your free trial has ended\. Screens keep playing until ([^.]+)\. Choose a plan to keep them on\.$/,
    to: (m) => `Your free trial has ended. Screens keep playing until ${m[1]}.`,
  },
  {
    id: "warning_past_due_grace_days",
    kind: "payment_failed",
    from: /^Your payment grace ends in \d+ days?, on ([^.]+)\. Update your payment method to keep your screens playing\. Your content is not deleted\.$/,
    to: (m) => `Payment for your plan is past due. Screens keep playing until ${m[1]}. Your content is not deleted.`,
  },
  {
    id: "warning_past_due_before_date",
    kind: "payment_failed",
    from: /^We couldn't take your last payment\. Update your payment method before ([^.]+) to keep your screens playing\.$/,
    to: (m) => `Payment for your plan is past due. Screens keep playing until ${m[1]}.`,
  },
  {
    id: "warning_past_due_no_date",
    kind: "payment_failed",
    from: /^We couldn't take your last payment\. Update your payment method to keep your screens playing\.$/,
    to: "Payment for your plan is past due. Your content is not deleted.",
  },
  {
    id: "error_subscription_inactive",
    code: "subscription_inactive",
    from: /^Your plan isn't active, so new screens can't be added\. Choose a plan to continue\.$/,
    to: "Your plan isn't active, so new screens can't be added.",
  },
  {
    id: "error_screen_limit",
    code: "screen_limit",
    from: /^Your plan's screen limit is reached\. Choose a plan with more screens, or pause another screen first\.$/,
    to: "Your plan's screen limit is reached. Pause another screen to pair this one.",
  },
  {
    id: "error_subscription_inactive_es",
    code: "subscription_inactive",
    from: /^Su plan no está activo, por lo que no se pueden agregar pantallas nuevas\. Elija un plan para continuar\.$/,
    to: "Su plan no está activo, por lo que no se pueden agregar pantallas nuevas.",
  },
  {
    id: "error_screen_limit_es",
    code: "screen_limit",
    from: /^Alcanzó el límite de pantallas de su plan\. Elija un plan con más pantallas o pause otra pantalla primero\.$/,
    to: "Alcanzó el límite de pantallas de su plan. Pause otra pantalla para vincular esta.",
  },
  {
    id: "checkout_choose_plan",
    code: "plan",
    from: /^Choose a plan\.$/,
    to: "That isn't available in this app.",
  },
  {
    id: "checkout_manage_billing",
    code: "subscription_exists",
    from: /^Use Manage billing to change this plan\.$/,
    to: "Your plan can't be changed in this app.",
  },
  {
    id: "checkout_card_declined",
    code: "payment_failed",
    from: /^Your card was declined for this plan change, so your plan didn't change\. Update your card in Manage billing, then try again\.$/,
    to: "Your card was declined, so your plan didn't change.",
  },
  {
    id: "checkout_unavailable",
    code: "billing_unavailable",
    from: /^Checkout isn't available yet\.$/,
    to: "That isn't available in this app.",
  },
  {
    id: "portal_unavailable",
    code: "billing_unavailable",
    from: /^Billing isn't available yet\.$/,
    to: "That isn't available in this app.",
  },
  {
    id: "portal_not_owner",
    code: "not_owner",
    from: /^Only the account owner can manage billing\.$/,
    to: "Only the account owner can manage the plan.",
  },
  {
    id: "rollout_notice_unenforced",
    from: /^You're an early Pekko customer\. Enforcement is off, so your 14-day transition has not started\. You keep full access and get a notice before billing changes\. Your content stays\.$/,
    to: "You're an early Pekko customer. Enforcement is off, so your 14-day transition has not started. You keep full access and get a notice before any change. Your content stays.",
  },
];

const NEUTRAL_EN = "That isn't available in this app.";
const NEUTRAL_ES = "Eso no está disponible en esta app.";

function looksSpanish(text: string): boolean {
  return /\b(su plan|sus pantallas|elija|actualice|facturación|prueba gratis|eso no está|suscr[ií]base)\b/i.test(text);
}

function casesFor(opts?: { code?: string; kind?: string }): readonly StatusCopyCase[] {
  if (opts?.code) return STATUS_COPY_CASES.filter((item) => item.code === opts.code);
  if (opts?.kind) return STATUS_COPY_CASES.filter((item) => item.kind === opts.kind);
  return STATUS_COPY_CASES;
}

function applyKnown(text: string, opts?: { code?: string; kind?: string }): string | null {
  for (const item of casesFor(opts)) {
    const match = text.match(item.from);
    if (match) return typeof item.to === "function" ? item.to(match) : item.to;
  }
  return null;
}

function allowGuardFallback(opts?: { code?: string; kind?: string }): boolean {
  if (opts?.code) return ERROR_CODES.has(opts.code);
  if (opts?.kind) return WARNING_KINDS.has(opts.kind);
  // No code/kind: only used by unit tests of unknown future copy.
  return true;
}

/** Rewrite one known warning or error sentence. Unchanged when it has no steering words. */
export function statusOnlyText(text: string, opts?: { code?: string; kind?: string }): string {
  const known = applyKnown(text, opts);
  if (known) return known;
  if (!PURCHASE_STEERING.test(text) || !allowGuardFallback(opts)) return text;
  return looksSpanish(text) ? NEUTRAL_ES : NEUTRAL_EN;
}

function rewriteBody(body: unknown): { value: unknown; changed: boolean } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { value: body, changed: false };
  const record = body as Record<string, unknown>;
  const out: Record<string, unknown> = { ...record };
  let changed = false;

  if (typeof record.error === "string" && typeof record.code === "string") {
    const next = statusOnlyText(record.error, { code: record.code });
    if (next !== record.error) {
      out.error = next;
      changed = true;
    }
  }

  const warning = record.warning;
  if (warning && typeof warning === "object" && !Array.isArray(warning)) {
    const w = warning as Record<string, unknown>;
    if (typeof w.message === "string") {
      const kind = typeof w.kind === "string" ? w.kind : undefined;
      const next = statusOnlyText(w.message, { kind });
      if (next !== w.message) {
        out.warning = { ...w, message: next };
        changed = true;
      }
    }
  }

  if (typeof record.rollout_notice === "string") {
    const next = statusOnlyText(record.rollout_notice);
    if (next !== record.rollout_notice) {
      out.rollout_notice = next;
      changed = true;
    }
  }

  return { value: changed ? out : body, changed };
}

/**
 * For Android-app requests, rewrite only top-level `error` (when `code` is
 * present), `warning.message` and top-level `rollout_notice`. Non-app requests
 * and unchanged bodies return the original Response.
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
  const rewritten = rewriteBody(body);
  if (!rewritten.changed) return res;
  const headers = new Headers(res.headers);
  headers.delete("content-length");
  return new Response(JSON.stringify(rewritten.value), { status: res.status, headers });
}
