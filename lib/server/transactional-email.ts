import { emailProvider, type EmailMessage } from "./email";
import { db } from "./supabase";

/** Intended Production sender. The module sends only when ALERT_EMAIL_FROM is actually set. */
export const BILLING_EMAIL_FROM = "Pekko <billing@pekkotv.com>";

export type NoticeLedger = {
  /** Returns true the first time this id is claimed, false if it was already claimed. */
  claim(id: string): Promise<boolean>;
};

/** In-memory ledger for tests. Production uses the billing_notices table. */
export function memoryNoticeLedger(): NoticeLedger {
  const seen = new Set<string>();
  return {
    async claim(id: string) {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    },
  };
}

/** Inserts the notice id once. A unique violation means this event was already claimed. */
export function supabaseNoticeLedger(): NoticeLedger {
  return {
    async claim(id: string) {
      const [accountId, kind] = id.split("|");
      const ins = await db().from("billing_notices").insert({ id, account_id: accountId, kind: kind || "notice" });
      if (ins.error?.code === "23505") return false;
      if (ins.error) throw new Error("notice ledger unavailable");
      return true;
    },
  };
}

export function transactionalEmailReady(env: Record<string, string | undefined> = process.env): boolean {
  return (env.EMAIL_PROVIDER || "").toLowerCase() === "resend"
    && Boolean(env.RESEND_API_KEY)
    && Boolean(env.ALERT_EMAIL_FROM);
}

export type SendResult = { sent: boolean; reason: "noop" | "sent" | "duplicate" | "failed" };

/**
 * One transactional send. With the provider unset, this logs a no-op and does not
 * claim the idempotency key, so a later configuration can still send that event.
 * A claimed key is never sent twice.
 */
export async function sendTransactionalEmail(input: {
  idempotencyKey: string;
  message: EmailMessage;
  env?: Record<string, string | undefined>;
  ledger?: NoticeLedger;
  log?: (line: string) => void;
}): Promise<SendResult> {
  const env = input.env ?? process.env;
  const log = input.log ?? ((line: string) => console.info(line));
  if (!transactionalEmailReady(env)) {
    log("billing-email noop: EMAIL_PROVIDER, RESEND_API_KEY, and ALERT_EMAIL_FROM are not all set");
    return { sent: false, reason: "noop" };
  }
  const ledger = input.ledger ?? supabaseNoticeLedger();
  let claimed = false;
  try {
    claimed = await ledger.claim(input.idempotencyKey);
  } catch {
    log("billing-email noop: notice ledger unavailable");
    return { sent: false, reason: "failed" };
  }
  if (!claimed) return { sent: false, reason: "duplicate" };
  const provider = emailProvider(env);
  if (!provider) {
    log("billing-email noop: EMAIL_PROVIDER, RESEND_API_KEY, and ALERT_EMAIL_FROM are not all set");
    return { sent: false, reason: "noop" };
  }
  const result = await provider.send(input.message);
  return result.ok ? { sent: true, reason: "sent" } : { sent: false, reason: "failed" };
}
