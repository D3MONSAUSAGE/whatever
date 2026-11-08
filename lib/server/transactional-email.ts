import { emailProvider, type EmailMessage } from "./email";
import { db } from "./supabase";

/** Intended Production sender. The module sends only when ALERT_EMAIL_FROM is actually set. */
export const BILLING_EMAIL_FROM = "Pekko <billing@pekkotv.com>";

/** Explicit columns. `id` is an opaque dedupe key and is never parsed for the account or kind. */
export type NoticeClaim = { id: string; accountId: string; kind: string };

export class NoticeLedgerError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = "NoticeLedgerError";
    this.code = code;
  }
}

/** Postgres SQLSTATE only. Messages, details, and hints can echo values and are never logged. */
export function dbErrorCode(code: string | undefined): string {
  return code && /^[0-9A-Z]{5}$/.test(code) ? code : "unknown";
}

export type NoticeLedger = {
  /** Returns true the first time this id is claimed, false if it was already claimed. */
  claim(notice: NoticeClaim): Promise<boolean>;
  /** True when this id was already claimed. Does not claim it. */
  has(id: string): Promise<boolean>;
};

/** In-memory ledger for tests. Production uses the billing_notices table. */
export function memoryNoticeLedger(): NoticeLedger {
  const seen = new Set<string>();
  return {
    async claim(notice: NoticeClaim) {
      if (seen.has(notice.id)) return false;
      seen.add(notice.id);
      return true;
    },
    async has(id: string) {
      return seen.has(id);
    },
  };
}

/** Inserts the notice id once. A unique violation means this event was already claimed. */
export function supabaseNoticeLedger(): NoticeLedger {
  return {
    async claim(notice: NoticeClaim) {
      const ins = await db().from("billing_notices").insert({
        id: notice.id,
        account_id: notice.accountId,
        kind: notice.kind,
      });
      if (ins.error?.code === "23505") return false;
      if (ins.error) throw new NoticeLedgerError(dbErrorCode(ins.error.code));
      return true;
    },
    async has(id: string) {
      const row = await db().from("billing_notices").select("id").eq("id", id).maybeSingle();
      if (row.error) return false;
      return Boolean(row.data?.id);
    },
  };
}

export function transactionalEmailReady(env: Record<string, string | undefined> = process.env): boolean {
  return (env.EMAIL_PROVIDER || "").toLowerCase() === "resend"
    && Boolean(env.RESEND_API_KEY)
    && Boolean(env.ALERT_EMAIL_FROM);
}

export type SendResult = { sent: boolean; reason: "noop" | "sent" | "duplicate" | "failed"; id: string | null; error: string | null };

/**
 * One transactional send. With the provider unset, this logs a no-op and does not
 * claim the idempotency key, so a later configuration can still send that event.
 * A claimed key is never sent twice.
 */
export async function sendTransactionalEmail(input: {
  idempotencyKey: string;
  accountId: string;
  kind: string;
  message: EmailMessage;
  env?: Record<string, string | undefined>;
  ledger?: NoticeLedger;
  log?: (line: string) => void;
}): Promise<SendResult> {
  const env = input.env ?? process.env;
  const log = input.log ?? ((line: string) => console.info(line));
  if (!transactionalEmailReady(env)) {
    log("billing-email noop: EMAIL_PROVIDER, RESEND_API_KEY, and ALERT_EMAIL_FROM are not all set");
    return { sent: false, reason: "noop", id: null, error: null };
  }
  const ledger = input.ledger ?? supabaseNoticeLedger();
  let claimed = false;
  try {
    claimed = await ledger.claim({ id: input.idempotencyKey, accountId: input.accountId, kind: input.kind });
  } catch (err) {
    const code = err instanceof NoticeLedgerError ? err.code : "unknown";
    log(`billing-email ledger error code=${code}`);
    return { sent: false, reason: "failed", id: null, error: `Couldn't record this send (${code}). No email was sent.` };
  }
  if (!claimed) return { sent: false, reason: "duplicate", id: null, error: null };
  const provider = emailProvider(env);
  if (!provider) {
    log("billing-email noop: EMAIL_PROVIDER, RESEND_API_KEY, and ALERT_EMAIL_FROM are not all set");
    return { sent: false, reason: "noop", id: null, error: null };
  }
  const result = await provider.send(input.message);
  return result.ok
    ? { sent: true, reason: "sent", id: result.id ?? null, error: null }
    : { sent: false, reason: "failed", id: null, error: result.error ?? "send failed" };
}
