/**
 * I18N-5: Supabase Auth "Send Email" HTTP hook. Supabase calls this instead of SMTP once the hook
 * is enabled in the dashboard (manual step, see docs/auth-email-hook.md). Until then nothing calls it.
 *
 * - Standard Webhooks signature (webhook-id / webhook-timestamp / webhook-signature) with the
 *   hook secret from SUPABASE_SEND_EMAIL_HOOK_SECRET ("v1,whsec_<base64>"). The secret is never logged.
 * - Language from accounts.locale of the account the user owns. NULL, unknown, missing account,
 *   a read error or a slow read all mean English. The lookup never decides whether an email is sent.
 * - Sent with the existing Resend key from the verified pekkotv.com sender. One Idempotency-Key per
 *   hook delivery and recipient, so a Supabase retry can't send twice.
 * - Fail safe: any send failure, unknown type or bad payload returns an error, so Supabase reports
 *   the failure to the caller. Nothing is dropped silently. No rate limiting here: Supabase's own
 *   email rate limits and per-user cooldowns apply before the hook is called, unchanged.
 * - Logs carry the type, locale and outcome only: never the address, token or token_hash.
 */
import { verifyResendSignature, WEBHOOK_TOLERANCE_SECONDS } from "@/lib/server/inbound-email";
import { notificationLocaleOf } from "@/lib/server/notification-locale";
import type { Locale } from "@/lib/i18n/locales";
import { AUTH_EMAIL_FROM, isAuthEmailType, renderAuthEmail, type AuthEmailType } from "./templates";

export const HOOK_SECRET_ENV = "SUPABASE_SEND_EMAIL_HOOK_SECRET";
export const MAX_PAYLOAD_BYTES = 64 * 1024;
/** Supabase gives an HTTP hook 5 s in total; keep well inside it. */
export const LOCALE_TIMEOUT_MS = 1000;
export const SEND_TIMEOUT_MS = 3000;

export type HookUser = { id: string; email: string; new_email?: string };
export type HookEmailData = {
  token: string;
  token_hash: string;
  redirect_to: string;
  email_action_type: string;
  site_url: string;
  token_new: string;
  token_hash_new: string;
};
export type HookPayload = { user: HookUser; email_data: HookEmailData };

/** "v1,whsec_<base64>" (as the dashboard shows it), "whsec_<base64>" or bare base64. */
export function normalizeHookSecret(secret: string): string {
  return secret.trim().replace(/^v1,/, "");
}

export function verifyHookSignature(req: Request, payload: string, secret: string, now?: number) {
  return verifyResendSignature({
    payload,
    id: req.headers.get("webhook-id"),
    timestamp: req.headers.get("webhook-timestamp"),
    signature: req.headers.get("webhook-signature"),
    secret: normalizeHookSecret(secret),
    now,
    toleranceSeconds: WEBHOOK_TOLERANCE_SECONDS,
  });
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

export function parseHookPayload(raw: string): HookPayload | null {
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return null; }
  if (!body || typeof body !== "object") return null;
  const { user, email_data: d } = body as { user?: Record<string, unknown>; email_data?: Record<string, unknown> };
  if (!user || !d || typeof user !== "object" || typeof d !== "object") return null;
  const id = str(user.id), email = str(user.email);
  if (!id || !email) return null;
  return {
    user: { id, email, new_email: str(user.new_email) || undefined },
    email_data: {
      token: str(d.token),
      token_hash: str(d.token_hash),
      redirect_to: str(d.redirect_to),
      email_action_type: str(d.email_action_type),
      site_url: str(d.site_url),
      token_new: str(d.token_new),
      token_hash_new: str(d.token_hash_new),
    },
  };
}

export type PlannedEmail = { to: string; tokenHash: string; token: string };

/**
 * Who gets which link. email_change follows Supabase's documented (reversed) mapping:
 * with Secure Email Change on, the current address gets token + token_hash_new and the new address
 * gets token_new + token_hash; with it off, one email to the new address with token_hash.
 */
export function planEmails(p: HookPayload, type: AuthEmailType): PlannedEmail[] | null {
  const d = p.email_data;
  if (type === "reauthentication") return d.token ? [{ to: p.user.email, tokenHash: d.token_hash, token: d.token }] : null;
  if (type === "email_change") {
    const newEmail = p.user.new_email;
    if (!newEmail) return null;
    if (d.token_hash && d.token_hash_new) {
      return [
        { to: p.user.email, tokenHash: d.token_hash_new, token: d.token },
        { to: newEmail, tokenHash: d.token_hash, token: d.token_new },
      ];
    }
    const hash = d.token_hash || d.token_hash_new;
    return hash ? [{ to: newEmail, tokenHash: hash, token: d.token_new || d.token }] : null;
  }
  return d.token_hash ? [{ to: p.user.email, tokenHash: d.token_hash, token: d.token }] : null;
}

export type HookDeps = {
  /** accounts.locale for the account owned by this auth user (raw value, may be null). */
  readAccountLocale(userId: string): Promise<unknown>;
  send(msg: { from: string; to: string; subject: string; html: string; idempotencyKey: string }): Promise<{ ok: boolean; status?: number }>;
  supabaseUrl: string;
  log?(line: string): void;
};

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

/** English unless the lookup cleanly returns exactly "es". Never throws. */
export async function hookLocale(deps: HookDeps, userId: string): Promise<{ locale: Locale; fallback: boolean }> {
  try {
    const raw = await withTimeout(deps.readAccountLocale(userId), LOCALE_TIMEOUT_MS);
    return { locale: notificationLocaleOf(raw), fallback: false };
  } catch {
    return { locale: "en", fallback: true };
  }
}

export type HookResult = { status: number; body: Record<string, unknown> };

const fail = (status: number, message: string): HookResult => ({ status, body: { error: { http_code: status, message } } });

/** Everything after the signature check. */
export async function handleSendEmailHook(payload: HookPayload, webhookId: string, deps: HookDeps): Promise<HookResult> {
  const log = deps.log ?? ((l: string) => console.info(l));
  const type = payload.email_data.email_action_type;
  if (!isAuthEmailType(type)) {
    log(`auth-email-hook refused type=${type.slice(0, 40) || "missing"}`);
    return fail(500, "Pekko's email hook doesn't handle this email type. Nothing was sent.");
  }
  const plan = planEmails(payload, type);
  if (!plan) {
    log(`auth-email-hook refused type=${type} reason=incomplete`);
    return fail(500, "The email request was incomplete. Nothing was sent.");
  }
  const { locale, fallback } = await hookLocale(deps, payload.user.id);
  for (const [n, item] of plan.entries()) {
    const email = renderAuthEmail({
      type,
      locale,
      tokenHash: item.tokenHash,
      token: item.token,
      redirectTo: payload.email_data.redirect_to,
      siteUrl: payload.email_data.site_url,
      supabaseUrl: deps.supabaseUrl,
      email: payload.user.email,
      newEmail: payload.user.new_email ?? "",
    });
    let res: { ok: boolean; status?: number };
    try {
      res = await withTimeout(deps.send({ from: AUTH_EMAIL_FROM, to: item.to, subject: email.subject, html: email.html, idempotencyKey: `supabase-auth/${webhookId}/${n}` }), SEND_TIMEOUT_MS);
    } catch {
      res = { ok: false };
    }
    if (!res.ok) {
      log(`auth-email-hook send-failed type=${type} locale=${locale} part=${n + 1}/${plan.length} status=${res.status ?? "none"}`);
      return fail(500, "The email couldn't be sent. Please try again in a minute.");
    }
  }
  log(`auth-email-hook sent type=${type} locale=${locale}${fallback ? " (fallback)" : ""} count=${plan.length}`);
  return { status: 200, body: {} };
}
