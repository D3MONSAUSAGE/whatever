import { daysLeft, type EntitlementRow } from "./entitlements";
import { emailProvider, type EmailMessage } from "./email";

export type BillingNoticeKind = "trial_ending" | "trial_ended" | "payment_failed" | "subscription_canceled";

export type BillingNotice = { kind: BillingNoticeKind; subject: string; text: string };

function utcDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) + " (UTC)";
}

/**
 * Customer notices. Receipts are not included: Stripe sends those from its own
 * email setting. Callers must not invent a Pekko receipt.
 */
export function billingNotices(e: EntitlementRow): BillingNotice[] {
  const notices: BillingNotice[] = [];
  const left = daysLeft(e.trial_ends_at, e.server_time);
  if (e.state === "trial" && left === 3) {
    notices.push({
      kind: "trial_ending",
      subject: "Your Pekko trial ends in 3 days",
      text: "Your free trial ends in 3 days. Choose a plan to keep your screens on. Your content stays either way.",
    });
  }
  if (e.state === "trial_grace" || e.state === "expired") {
    notices.push({
      kind: "trial_ended",
      subject: "Your Pekko trial has ended",
      text: e.state === "trial_grace" && e.playback_ends_at
        ? `Your free trial has ended. Screens keep playing until ${utcDate(e.playback_ends_at)}. Your content is still saved.`
        : "Your free trial has ended and screens are paused. Your content is still saved. Choose a plan to turn them back on.",
    });
  }
  if (e.state === "past_due") {
    notices.push({
      kind: "payment_failed",
      subject: "Pekko couldn't take your payment",
      text: e.grace_ends_at
        ? `We couldn't take your last payment. Update your payment method before ${utcDate(e.grace_ends_at)} to keep your screens playing. Your content is not deleted.`
        : "We couldn't take your last payment. Update your payment method to keep your screens playing. Your content is not deleted.",
    });
  }
  if (e.state === "canceled") {
    notices.push({
      kind: "subscription_canceled",
      subject: "Your Pekko subscription is canceled",
      text: "Your subscription is canceled and screens are paused. Your content and settings are saved. Choose a plan whenever you want them back on.",
    });
  }
  return notices;
}

/** Receipts stay on Stripe's own customer email. This app does not send them. */
export const RECEIPT_CHANNEL = "stripe" as const;

/**
 * Sends billing notices only when EMAIL_PROVIDER is configured (see emailProvider).
 * With no provider, nothing is sent.
 */
export async function sendBillingNotices(
  to: string,
  notices: BillingNotice[],
  env: Record<string, string | undefined> = process.env,
): Promise<{ sent: boolean; reason?: "email_disabled" | "empty" }> {
  if (!notices.length) return { sent: false, reason: "empty" };
  const provider = emailProvider(env);
  if (!provider) return { sent: false, reason: "email_disabled" };
  for (const notice of notices) {
    const msg: EmailMessage = { to, subject: notice.subject, text: notice.text };
    const result = await provider.send(msg);
    if (!result.ok) return { sent: false };
  }
  return { sent: true };
}
