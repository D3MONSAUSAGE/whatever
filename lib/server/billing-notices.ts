import { daysLeft, type EntitlementRow } from "./entitlements";
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

function utcDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) + " (UTC)";
}

function notice(kind: BillingNoticeKind, deadline: string, subject: string, text: string): BillingNotice {
  return { kind, deadline, subject, text };
}

/**
 * Reminders derived only from server timestamps on the entitlement row.
 * Receipts are not included: Stripe sends those from its own email setting.
 */
export function billingNotices(e: EntitlementRow, opts?: { transitionEndsAt?: string | null; enforced?: boolean }): BillingNotice[] {
  const notices: BillingNotice[] = [];
  const trialLeft = daysLeft(e.trial_ends_at, e.server_time);
  if (e.state === "trial" && e.trial_ends_at && trialLeft === 3) {
    notices.push(notice(
      "trial_ending_3",
      e.trial_ends_at,
      "Your Pekko trial ends in 3 days",
      `Your free trial ends on ${utcDate(e.trial_ends_at)}. Choose a plan to keep your screens on. Your content stays either way.`,
    ));
  }
  if (e.state === "trial" && e.trial_ends_at && trialLeft === 1) {
    notices.push(notice(
      "trial_ending_1",
      e.trial_ends_at,
      "Your Pekko trial ends in 1 day",
      `Your free trial ends on ${utcDate(e.trial_ends_at)}. Choose a plan to keep your screens on. Your content stays either way.`,
    ));
  }
  if (e.state === "trial_grace" || e.state === "expired") {
    const deadline = e.playback_ends_at || e.trial_ends_at || e.server_time;
    notices.push(notice(
      "trial_ended",
      deadline,
      "Your Pekko trial has ended",
      e.state === "trial_grace" && e.playback_ends_at
        ? `Your free trial has ended. Screens keep playing until ${utcDate(e.playback_ends_at)}. Your content is still saved.`
        : "Your free trial has ended and screens are paused. Your content is still saved. Choose a plan to turn them back on.",
    ));
  }
  if (e.state === "past_due" && e.grace_ends_at) {
    notices.push(notice(
      "payment_failed",
      e.grace_ends_at,
      "Pekko couldn't take your payment",
      `We couldn't take your last payment. Update your payment method before ${utcDate(e.grace_ends_at)} to keep your screens playing. Your content is not deleted.`,
    ));
    const graceLeft = daysLeft(e.grace_ends_at, e.server_time);
    if (graceLeft === 2) {
      notices.push(notice(
        "grace_ending_2",
        e.grace_ends_at,
        "Your Pekko payment grace ends in 2 days",
        `Your payment grace ends on ${utcDate(e.grace_ends_at)}. Update your payment method before then. Your content is not deleted.`,
      ));
    }
    if (graceLeft === 1) {
      notices.push(notice(
        "grace_ending_1",
        e.grace_ends_at,
        "Your Pekko payment grace ends in 1 day",
        `Your payment grace ends on ${utcDate(e.grace_ends_at)}. Update your payment method before then. Your content is not deleted.`,
      ));
    }
  }
  if (e.state === "canceled") {
    notices.push(notice(
      "subscription_canceled",
      e.current_period_end || e.server_time,
      "Your Pekko subscription is canceled",
      "Your subscription is canceled and screens are paused. Your content and settings are saved. Choose a plan whenever you want them back on.",
    ));
  }
  const transitionEnd = opts?.transitionEndsAt ?? null;
  if (opts?.enforced && e.state === "grandfathered" && transitionEnd && (daysLeft(transitionEnd, e.server_time) ?? 0) > 0) {
    notices.push(notice(
      "transition_14",
      transitionEnd,
      "Your Pekko access continues for 14 days",
      `You're an early Pekko customer. You keep full access through ${utcDate(transitionEnd)}. Your content stays; nothing is deleted.`,
    ));
  }
  return notices;
}

/** One key per account, reminder kind, and deadline. A repeat of the same event does not send again. */
export function billingNoticeKey(accountId: string, notice: Pick<BillingNotice, "kind" | "deadline">): string {
  return `${accountId}|${notice.kind}|${notice.deadline}`;
}

/** Receipts stay on Stripe's own customer email. This app does not send them. */
export const RECEIPT_CHANNEL = "stripe" as const;

export type NoticeDelivery = { key: string; sent: boolean; reason: SendResult["reason"] };

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
