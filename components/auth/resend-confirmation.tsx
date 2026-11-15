"use client";
import { useEffect, useState } from "react";
import { getSupabase, supabaseConfigured } from "@/lib/supabase-browser";
import { useT } from "@/lib/i18n/client";
import type { MessageKey, Vars } from "@/lib/i18n/index";
import { friendlyAuthError } from "@/components/auth-frame";
import { safeDashboardNext } from "@/lib/safe-next";

const COOLDOWN_S = 60;

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
  const [note, setNote] = useState<{ key?: MessageKey; vars?: Vars; text?: string; error?: boolean } | null>(null);

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
    try {
      const redirect = `${location.origin}${safeDashboardNext(next || "")}`;
      const res = await getSupabase().auth.resend({ type: "signup", email: address, options: { emailRedirectTo: redirect } });
      if (res.error) return setNote({ text: friendlyAuthError(res.error.message, t), error: true });
      setWait(COOLDOWN_S);
      setNote({ key: "auth.resent", vars: { email: address } });
    } catch (err) {
      setNote({ text: friendlyAuthError((err as Error).message, t), error: true });
    } finally {
      setBusy(false);
    }
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
      {note ? <p role={note.error ? "alert" : "status"} className={note.error ? "note-error" : "note-ok"}>{note.key ? t(note.key, note.vars) : note.text}</p> : null}
    </form>
  );
}
