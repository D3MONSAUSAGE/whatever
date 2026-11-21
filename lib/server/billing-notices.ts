import { daysLeft, paymentGraceEndsAt, transitionEndsAt, trialEndsAt, type EntitlementRow } from "./entitlements";
import { isValidTimeZone } from "./schedule";
import type { Locale } from "@/lib/i18n/locales";
import { sendTransactionalEmail, supabaseNoticeLedger, type NoticeLedger, type SendResult } from "./transactional-email";

export type BillingNoticeKind =
  | "trial_ending_3"
  | "trial_ending_1"
  | "payment_failed"
  | "grace_ending_2"
  | "grace_ending_1"
  | "transition_14"
  | "trial_ended"
  | "subscription_canceled";

export type BillingNotice = {
  kind: BillingNoticeKind;
  /** Server instant this reminder is about. Part of the idempotency key. */
  deadline: string;
  subject: string;
  text: string;
};

/** Billing emails use the account's first location timezone when one was set, else Pacific time. */
export const REMINDER_DEFAULT_TZ = "America/Los_Angeles";

/** "UTC" is the column default (not a customer choice), so it falls back to Pacific time. */
export function reminderZone(tz?: string | null): string {
  return tz && tz !== "UTC" && isValidTimeZone(tz) ? tz : REMINDER_DEFAULT_TZ;
}

/** "Nov 22, 2026 at 7:07 PM PST": date and time with an explicit zone label. */
export function formatWhen(iso: string, tz?: string | null, locale: Locale = "en"): string {
  const timeZone = reminderZone(tz);
  const d = new Date(iso);
  if (locale === "es") {
    // I18N-4: "21 nov 2026 a las 7:07 p.m. PST". es-US keeps the 12-hour clock and the PST/CST label.
    const esDate = d.toLocaleDateString("es-US", { month: "short", day: "numeric", year: "numeric", timeZone });
    const esTime = d.toLocaleTimeString("es-US", { hour: "numeric", minute: "2-digit", timeZone, timeZoneName: "short" });
    return `${esDate} a las ${esTime}`;
  }
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone, timeZoneName: "short" });
  return `${date} at ${time}`;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Remaining time, rounded down so the email never claims more time than is left. */
export function remainingPhrase(deadline: string, now: string, locale: Locale = "en"): string {
  const ms = Date.parse(deadline) - Date.parse(now);
  if (locale === "es") {
    if (ms >= 2 * DAY) return `en ${Math.floor(ms / DAY)} días`;
    if (ms >= DAY) return "en 1 día";
    const esHours = Math.floor(ms / HOUR);
    if (esHours >= 2) return `en ${esHours} horas`;
    if (esHours === 1) return "en 1 hora";
    return "en menos de una hora";
  }
  if (ms >= 2 * DAY) return `in ${Math.floor(ms / DAY)} days`;
  if (ms >= DAY) return "in 1 day";
  const hours = Math.floor(ms / HOUR);
  if (hours >= 2) return `in ${hours} hours`;
  if (hours === 1) return "in 1 hour";
  return "in less than an hour";
}

function notice(kind: BillingNoticeKind, deadline: string, subject: string, text: string): BillingNotice {
  return { kind, deadline, subject, text };
}

/** Shared copy for the six reminders. Self-test and live reminders both use this. */
export function billingTemplate(
  kind: "trial_ending_3" | "trial_ending_1" | "payment_failed" | "grace_ending_2" | "grace_ending_1" | "transition_14",
  deadline: string,
  opts?: { now?: string; tz?: string | null; locale?: Locale },
): BillingNotice {
  if (opts?.locale === "es") return billingTemplateEs(kind, deadline, opts);
  const when = formatWhen(deadline, opts?.tz);
  const left = remainingPhrase(deadline, opts?.now ?? new Date().toISOString());
  switch (kind) {
    case "trial_ending_3":
      return notice(kind, deadline, `Your Pekko trial ends ${left}`, `Your free trial ends on ${when}. Choose a plan to keep your screens on. Your content stays either way.`);
    case "trial_ending_1":
      return notice(kind, deadline, `Your Pekko trial ends ${left}`, `Your free trial ends on ${when}. Choose a plan to keep your screens on. Your content stays either way.`);
    case "payment_failed":
      return notice(kind, deadline, "Pekko couldn't take your payment", `We couldn't take your last payment. Update your payment method before ${when} to keep your screens playing. Your content is not deleted.`);
    case "grace_ending_2":
      return notice(kind, deadline, `Your Pekko payment grace ends ${left}`, `Your payment grace ends on ${when}. Update your payment method before then. Your content is not deleted.`);
    case "grace_ending_1":
      return notice(kind, deadline, `Your Pekko payment grace ends ${left}`, `Your payment grace ends on ${when}. Update your payment method before then. Your content is not deleted.`);
    case "transition_14":
      return notice(kind, deadline, "Your Pekko access continues for 14 days", `You're an early Pekko customer. You keep full access through ${when}. Your content stays; nothing is deleted.`);
  }
}

/**
 * I18N-4: Spanish reminders, same kind, deadline and facts as English. Wording is legally equivalent:
 * "free trial" = "prueba gratis", "payment grace" = "periodo de gracia para el pago", and every line keeps the
 * same promise (content kept, screens paused or playing, the same date and time). No plan names or prices.
 */
function billingTemplateEs(
  kind: Parameters<typeof billingTemplate>[0],
  deadline: string,
  opts: { now?: string; tz?: string | null },
): BillingNotice {
  const when = formatWhen(deadline, opts.tz, "es");
  const left = remainingPhrase(deadline, opts.now ?? new Date().toISOString(), "es");
  switch (kind) {
    case "trial_ending_3":
    case "trial_ending_1":
      return notice(kind, deadline, `Su prueba gratis de Pekko termina ${left}`, `Su prueba gratis termina el ${when}. Elija un plan para mantener sus pantallas encendidas. Su contenido se conserva en cualquier caso.`);
    case "payment_failed":
      return notice(kind, deadline, "Pekko no pudo cobrar su pago", `No pudimos cobrar su último pago. Actualice su método de pago antes del ${when} para que sus pantallas sigan reproduciendo. Su contenido no se elimina.`);
    case "grace_ending_2":
    case "grace_ending_1":
      return notice(kind, deadline, `Su periodo de gracia para el pago de Pekko termina ${left}`, `Su periodo de gracia para el pago termina el ${when}. Actualice su método de pago antes de entonces. Su contenido no se elimina.`);
    case "transition_14":
      return notice(kind, deadline, "Su acceso a Pekko continúa por 14 días", `Usted es uno de los primeros clientes de Pekko. Conserva acceso completo hasta el ${when}. Su contenido se conserva; no se elimina nada.`);
  }
}

/**
 * Reminders derived only from server timestamps on the entitlement row.
 * Receipts are not included: Stripe sends those from its own email setting.
 */
export function billingNotices(e: EntitlementRow, opts?: { transitionEndsAt?: string | null; enforced?: boolean; tz?: string | null; locale?: Locale }): BillingNotice[] {
  const notices: BillingNotice[] = [];
  const es = opts?.locale === "es";
  const at = es ? { now: e.server_time, tz: opts?.tz ?? null, locale: "es" as const } : { now: e.server_time, tz: opts?.tz ?? null };
  const trialLeft = daysLeft(e.trial_ends_at, e.server_time);
  if (e.state === "trial" && e.trial_ends_at && trialLeft === 3) notices.push(billingTemplate("trial_ending_3", e.trial_ends_at, at));
  if (e.state === "trial" && e.trial_ends_at && trialLeft === 1) notices.push(billingTemplate("trial_ending_1", e.trial_ends_at, at));
  if (e.state === "trial_grace" || e.state === "expired") {
    // Stable fallback: a moving server_time would make a new key (and a new email) on every run.
    const deadline = e.playback_ends_at || e.trial_ends_at || "none";
    notices.push(notice(
      "trial_ended",
      deadline,
      es ? "Su prueba gratis de Pekko terminó" : "Your Pekko trial has ended",
      es
        ? (e.state === "trial_grace" && e.playback_ends_at
          ? `Su prueba gratis terminó. Las pantallas siguen reproduciendo hasta el ${formatWhen(e.playback_ends_at, opts?.tz, "es")}, pero la edición y la publicación están bloqueadas. Su contenido sigue guardado.`
          : "Su prueba gratis terminó y las pantallas están en pausa. Su contenido sigue guardado. Elija un plan para volver a encenderlas.")
        : e.state === "trial_grace" && e.playback_ends_at
          ? `Your free trial has ended. Screens keep playing until ${formatWhen(e.playback_ends_at, opts?.tz)}, but editing and publishing are locked. Your content is still saved.`
          : "Your free trial has ended and screens are paused. Your content is still saved. Choose a plan to turn them back on.",
    ));
  }
  if (e.state === "past_due" && e.grace_ends_at) {
    notices.push(billingTemplate("payment_failed", e.grace_ends_at, at));
    const graceLeft = daysLeft(e.grace_ends_at, e.server_time);
    if (graceLeft === 2) notices.push(billingTemplate("grace_ending_2", e.grace_ends_at, at));
    if (graceLeft === 1) notices.push(billingTemplate("grace_ending_1", e.grace_ends_at, at));
  }
  if (e.state === "canceled") {
    notices.push(notice(
      "subscription_canceled",
      // Stable fallback (see trial_ended). This state also covers an unpaid subscription whose
      // payment grace ended, so the copy says "not active" rather than claiming it was canceled.
      e.current_period_end || e.grace_ends_at || "none",
      es ? "Sus pantallas de Pekko están en pausa" : "Your Pekko screens are paused",
      es
        ? "Su suscripción no está activa, así que sus pantallas están en pausa. Su contenido y su configuración están guardados. Elija un plan o actualice su método de pago en Facturación para volver a encenderlas."
        : "Your subscription is not active, so your screens are paused. Your content and settings are saved. Choose a plan or update your payment method in Billing to turn them back on.",
    ));
  }
  const transitionEnd = opts?.transitionEndsAt ?? null;
  if (opts?.enforced && e.state === "grandfathered" && transitionEnd && (daysLeft(transitionEnd, e.server_time) ?? 0) > 0) {
    notices.push(billingTemplate("transition_14", transitionEnd, at));
  }
  return notices;
}

/** One key per account, reminder kind, and deadline. A repeat of the same event does not send again. */
export function billingNoticeKey(accountId: string, notice: Pick<BillingNotice, "kind" | "deadline">): string {
  return `${accountId}|${notice.kind}|${notice.deadline}`;
}

export const SELF_TEST_KINDS = ["trial_ending_3", "trial_ending_1", "payment_failed", "grace_ending_2", "grace_ending_1", "transition_14"] as const;

/** Separate from live reminder keys so a self-test cannot claim or suppress a real notice. */
export function selfTestClaimKey(accountId: string, run: string, kind: string): string {
  return `selftest:${accountId}:${run}:${kind}`;
}

export function selfTestAllowed(accountId: string, allowlist: string | undefined): boolean {
  return (allowlist || "").split(",").map((part) => part.trim()).filter(Boolean).includes(accountId);
}

/** Whether this signed-in org may see the dashboard self-test. Does not reveal the rest of the list. */
export function selfTestStatus(accountId: string, allowlist: string | undefined): { enabled: boolean } {
  return { enabled: selfTestAllowed(accountId, allowlist) };
}

/**
 * All six templates, using this org's stored dates when it has them.
 * Missing dates are computed from the server timestamp only. Nothing is written.
 */
export function selfTestNotices(e: EntitlementRow, transitionStartedAt: string | null): BillingNotice[] {
  const trialEnd = e.trial_ends_at ?? (e.trial_started_at ? trialEndsAt(e.trial_started_at) : trialEndsAt(e.server_time));
  const graceEnd = e.grace_ends_at ?? paymentGraceEndsAt(e.server_time);
  const transitionEnd = transitionEndsAt(transitionStartedAt) ?? transitionEndsAt(e.server_time) ?? e.server_time;
  const deadline = {
    trial_ending_3: trialEnd,
    trial_ending_1: trialEnd,
    payment_failed: graceEnd,
    grace_ending_2: graceEnd,
    grace_ending_1: graceEnd,
    transition_14: transitionEnd,
  };
  return SELF_TEST_KINDS.map((kind) => {
    const item = billingTemplate(kind, deadline[kind], { now: e.server_time });
    return { ...item, subject: `[TEST] ${item.subject}` };
  });
}

/** True when this attempt sent mail or found an existing claim. A total failure did not. */
export function selfTestAttemptSucceeded(results: { sent: boolean; reason: string }[]): boolean {
  return results.some((row) => row.sent || row.reason === "duplicate");
}

export function evaluateSelfTestGate(input: {
  accountId: string;
  allowlist: string | undefined;
  email: string;
  run: string;
  replay: boolean;
  limited: boolean;
}): { ok: true } | { ok: false; status: number; error: string } {
  if (!selfTestAllowed(input.accountId, input.allowlist)) return { ok: false, status: 404, error: "Not found." };
  if (!input.email.includes("@")) return { ok: false, status: 400, error: "This account has no email." };
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(input.run)) return { ok: false, status: 400, error: "Send a run id made of letters, numbers, _ or -." };
  if (!input.replay && input.limited) return { ok: false, status: 429, error: "A test email was just sent. Wait 10 minutes before sending another." };
  return { ok: true };
}

/** Receipts stay on Stripe's own customer email. This app does not send them. */
export const RECEIPT_CHANNEL = "stripe" as const;

export type NoticeDelivery = { key: string; sent: boolean; reason: SendResult["reason"] };

export type SelfTestResult = {
  kind: BillingNotice["kind"];
  subject: string;
  deadline: string;
  sent: boolean;
  reason: SendResult["reason"];
  id: string | null;
  error: string | null;
};

/** Sends the six test templates. Claim keys stay in the selftest namespace. */
export async function deliverSelfTest(input: {
  accountId: string;
  to: string;
  run: string;
  notices: BillingNotice[];
  env?: Record<string, string | undefined>;
  ledger?: NoticeLedger;
  log?: (line: string) => void;
}): Promise<SelfTestResult[]> {
  const env = input.env ?? process.env;
  const ledger = input.ledger ?? supabaseNoticeLedger();
  const out: SelfTestResult[] = [];
  for (const notice of input.notices) {
    const result = await sendTransactionalEmail({
      idempotencyKey: selfTestClaimKey(input.accountId, input.run, notice.kind),
      accountId: input.accountId,
      kind: notice.kind,
      message: { to: input.to, subject: notice.subject, text: notice.text },
      env,
      ledger,
      log: input.log,
    });
    out.push({
      kind: notice.kind,
      subject: notice.subject,
      deadline: notice.deadline,
      sent: result.sent,
      reason: result.reason,
      id: result.id,
      error: result.error,
    });
  }
  return out;
}

/**
 * Sends each notice at most once. With email unset, logs a no-op and does not
 * claim the key. Does not delete stored notices or any customer data.
 */
export async function deliverBillingNotices(input: {
  accountId: string;
  to: string;
  notices: BillingNotice[];
  env?: Record<string, string | undefined>;
  ledger?: NoticeLedger;
  log?: (line: string) => void;
}): Promise<NoticeDelivery[]> {
  const env = input.env ?? process.env;
  const ledger = input.ledger ?? supabaseNoticeLedger();
  const out: NoticeDelivery[] = [];
  for (const notice of input.notices) {
    const key = billingNoticeKey(input.accountId, notice);
    const result = await sendTransactionalEmail({
      idempotencyKey: key,
      accountId: input.accountId,
      kind: notice.kind,
      message: { to: input.to, subject: notice.subject, text: notice.text },
      env,
      ledger,
      log: input.log,
    });
    out.push({ key, sent: result.sent, reason: result.reason });
  }
  return out;
}

/**
 * Sends billing notices only when EMAIL_PROVIDER, RESEND_API_KEY, and ALERT_EMAIL_FROM
 * are set. With any of them missing, nothing is sent.
 */
export async function sendBillingNotices(
  to: string,
  notices: BillingNotice[],
  env: Record<string, string | undefined> = process.env,
): Promise<{ sent: boolean; reason?: "email_disabled" | "empty" }> {
  if (!notices.length) return { sent: false, reason: "empty" };
  const delivered = await deliverBillingNotices({ accountId: "account", to, notices, env });
  if (delivered.every((row) => row.reason === "noop")) return { sent: false, reason: "email_disabled" };
  return { sent: delivered.some((row) => row.sent) };
}
