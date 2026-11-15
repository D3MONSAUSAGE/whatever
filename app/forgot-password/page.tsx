"use client";
import Link from "next/link";
import { useState } from "react";
import { getSupabase, supabaseConfigured } from "@/lib/supabase-browser";
import { useT } from "@/lib/i18n/client";
import { rich } from "@/components/i18n/rich";
import { AuthFrame, friendlyAuthError } from "@/components/auth-frame";
import { useRequiredMessage } from "@/components/ui";

export default function ForgotPassword() {
  const t = useT();
  const requiredMsg = useRequiredMessage();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!supabaseConfigured()) return setError(t("auth.missingSettings"));
    setBusy(true);
    try {
      const { error: err } = await getSupabase().auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${location.origin}/reset-password`,
      });
      // Unknown emails succeed too, so the page never reveals who has an account.
      if (err) setError(friendlyAuthError(err.message, t));
      else setSent(true);
    } catch (err) {
      setError(friendlyAuthError((err as Error).message, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame
      title={sent ? t("auth.forgotSentTitle") : t("auth.forgotTitle")}
      lede={sent
        ? <>{rich(t("auth.forgotSentLede", { email: "{email}" }), { b: () => <strong className="text-ink">{email.trim()}</strong> })}</>
        : t("auth.forgotLede")}
      footer={<><Link href="/login" className="font-semibold text-primary underline underline-offset-4">{t("common.backToSignIn")}</Link><span className="block mt-2 text-muted">{rich(t("auth.forgotNoEmail"), { link: (c) => <Link href="/support" className="underline">{c}</Link> })}</span></>}
    >
      {sent ? (
        <button type="button" className="btn btn-quiet w-full" onClick={() => { setSent(false); setError(null); }}>
          {t("auth.differentEmail")}
        </button>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <label className="form-label" htmlFor="email">{t("common.email")}</label>
          <input id="email" className="field" type="email" autoComplete="email" required {...requiredMsg} placeholder={t("auth.emailPlaceholder")}
            value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className="btn btn-primary w-full" disabled={busy}>{busy ? t("auth.sending") : t("auth.sendResetLink")}</button>
          {error ? <p role="alert" className="note-error">{error}</p> : null}
        </form>
      )}
    </AuthFrame>
  );
}
