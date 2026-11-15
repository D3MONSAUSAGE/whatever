"use client";
import { useEffect, useState } from "react";
import { getSupabase, supabaseConfigured } from "@/lib/supabase-browser";
import { useT } from "@/lib/i18n/client";
import type { MessageKey, Vars } from "@/lib/i18n/index";
import { authErrorKey } from "@/components/auth-frame";
import { safeDashboardNext } from "@/lib/safe-next";

const COOLDOWN_S = 60;
/** sessionStorage key: when the next resend is allowed (ms since epoch). A refresh can't skip the wait. */
export const RESEND_UNTIL_KEY = "pekko_confirm_resend_until";

/**
 * Gother #110 MEDIUM: this form takes any typed email, so the reply must not reveal whether it is
 * registered. Every outcome shows the same "sent" message except a mapped rate-limit error.
 */
export function resendOutcome(error: { message?: string } | null | undefined): "sent" | "rateLimit" {
  if (!error) return "sent";
  return authErrorKey(error.message)?.key === "authError.rateLimit" ? "rateLimit" : "sent";
}

/** Seconds left on a stored wait (0 when none, expired, or storage is unavailable). */
export function remainingWait(now: number = Date.now(), store: Pick<Storage, "getItem"> | null = safeStore()): number {
  const until = Number(store?.getItem(RESEND_UNTIL_KEY) ?? 0);
  return Number.isFinite(until) && until > now ? Math.ceil((until - now) / 1000) : 0;
}

function safeStore(): Storage | null {
  try { return typeof window === "undefined" ? null : window.sessionStorage; } catch { return null; }
}

function startWait(): number {
  try { safeStore()?.setItem(RESEND_UNTIL_KEY, String(Date.now() + COOLDOWN_S * 1000)); } catch { /* private mode: in-memory wait still applies */ }
  return COOLDOWN_S;
}

/**
 * I18N-1F: /auth/confirm offers a new confirmation email (not a password reset) when a sign-up link
 * can't be used. Page-only: the same supabase.auth.resend({ type: "signup" }) call as /login (E4);
 * no auth template or server change.
 */
export function ResendConfirmation({ next }: { next?: string }) {
  const t = useT();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);
  const [note, setNote] = useState<{ key: MessageKey; vars?: Vars; error?: boolean } | null>(null);

  // Restore a wait started before a refresh.
  useEffect(() => { const left = remainingWait(); if (left) setWait(left); }, []);

  useEffect(() => {
    if (wait <= 0) return;
    const id = setTimeout(() => setWait((n) => n - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const address = email.trim();
    if (!address || busy || wait > 0) return;
    setNote(null);
    if (!supabaseConfigured()) return setNote({ key: "auth.signInUnavailable", error: true });
    setBusy(true);
    let outcome: "sent" | "rateLimit" = "sent";
    try {
      const redirect = `${location.origin}${safeDashboardNext(next || "")}`;
      const res = await getSupabase().auth.resend({ type: "signup", email: address, options: { emailRedirectTo: redirect } });
      outcome = resendOutcome(res.error);
    } catch (err) {
      outcome = resendOutcome(err as Error);
    } finally {
      // The wait starts on every outcome, success or failure.
      setWait(startWait());
      setBusy(false);
    }
    setNote(outcome === "rateLimit" ? { key: "authError.rateLimit", error: true } : { key: "auth.resent", vars: { email: address } });
  }

  return (
    <form onSubmit={send} className="grid gap-3" data-testid="confirm-resend" name="resend-confirmation">
      <p className="text-sm text-muted">{t("auth.confirmResendLede")}</p>
      <label htmlFor="confirm-resend-email" className="sr-only">{t("common.email")}</label>
      <input id="confirm-resend-email" name="email" className="field" type="email" autoComplete="email" inputMode="email" required
        placeholder={t("common.email")} value={email} onChange={(e) => setEmail(e.target.value)} />
      <button className="btn btn-primary w-full" disabled={busy || wait > 0}>
        {busy ? t("auth.sending") : wait > 0 ? t("auth.resendWait") : t("auth.resend")}
      </button>
      {note ? <p role={note.error ? "alert" : "status"} className={note.error ? "note-error" : "note-ok"}>{t(note.key, note.vars)}</p> : null}
    </form>
  );
}
