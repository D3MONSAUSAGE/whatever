"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase, supabaseConfigured } from "@/lib/supabase-browser";
import { useT } from "@/lib/i18n/client";
import { AuthFrame, friendlyAuthError, MIN_PASSWORD } from "@/components/auth-frame";
import { useRequiredMessage } from "@/components/ui";

type Phase = "checking" | "ready" | "invalid" | "done";

export default function ResetPassword() {
  const t = useT();
  const requiredMsg = useRequiredMessage();
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("checking");
  // Raw Supabase message; translated at render so a language switch re-words it.
  const [linkError, setLinkError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabaseConfigured()) { setPhase("invalid"); return; }
    // Supabase puts link errors in the hash or query, e.g. #error_description=Email+link+is+invalid+or+has+expired
    const params = new URLSearchParams(location.hash.replace(/^#/, "") + "&" + location.search.replace(/^\?/, ""));
    const described = params.get("error_description");
    if (described) { setLinkError(described); setPhase("invalid"); return; }

    let cancelled = false;
    const supabase = getSupabase();
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if ((event === "PASSWORD_RECOVERY" || event === "SIGNED_IN" || event === "INITIAL_SESSION") && session) setPhase("ready");
    });
    (async () => {
      try {
        const code = params.get("code");
        if (code) {
          const { error: err } = await supabase.auth.exchangeCodeForSession(code);
          if (err && !cancelled) { setLinkError(err.message); setPhase("invalid"); return; }
        }
        const { data: current } = await supabase.auth.getSession();
        if (cancelled) return;
        if (current.session) setPhase("ready");
        else setTimeout(() => !cancelled && setPhase((p) => (p === "checking" ? "invalid" : p)), 2500);
      } catch (err) {
        if (!cancelled) { setLinkError((err as Error).message); setPhase("invalid"); }
      }
    })();
    return () => { cancelled = true; data.subscription.unsubscribe(); };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD) return setError(t("authError.short", { min: MIN_PASSWORD }));
    if (password !== confirm) return setError(t("auth.passwordsDontMatch"));
    setBusy(true);
    const { error: err } = await getSupabase().auth.updateUser({ password });
    setBusy(false);
    if (err) return setError(friendlyAuthError(err.message, t));
    history.replaceState(null, "", "/reset-password");
    setPhase("done");
  }

  if (phase === "checking") {
    return <AuthFrame title={t("auth.checkingLink")} lede={t("common.oneMoment")}><div className="skeleton h-12" /></AuthFrame>;
  }
  if (phase === "invalid") {
    return (
      <AuthFrame title={t("auth.linkUnusable")} lede={linkError ? friendlyAuthError(linkError, t) : t("auth.resetLinkHelp")}
        footer={<Link href="/login" className="font-semibold text-primary underline underline-offset-4">{t("common.backToSignIn")}</Link>}>
        <Link href="/forgot-password" className="btn btn-primary w-full">{t("auth.sendNewLink")}</Link>
      </AuthFrame>
    );
  }
  if (phase === "done") {
    return (
      <AuthFrame title={t("auth.passwordUpdated")} lede={t("auth.signedInNew")}>
        <button type="button" className="btn btn-primary w-full" onClick={() => router.replace("/dashboard")}>{t("common.goToDashboard")}</button>
      </AuthFrame>
    );
  }
  return (
    <AuthFrame title={t("auth.newPasswordTitle")} lede={t("auth.newPasswordLede", { min: MIN_PASSWORD })}>
      <form onSubmit={submit} className="space-y-3">
        <label className="form-label" htmlFor="new-password">{t("auth.newPassword")}</label>
        <input id="new-password" className="field" type="password" autoComplete="new-password" minLength={MIN_PASSWORD} required {...requiredMsg}
          value={password} onChange={(e) => setPassword(e.target.value)} />
        <label className="form-label" htmlFor="confirm-password">{t("auth.confirmPassword")}</label>
        <input id="confirm-password" className="field" type="password" autoComplete="new-password" minLength={MIN_PASSWORD} required {...requiredMsg}
          value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <button className="btn btn-primary w-full" disabled={busy}>{busy ? t("auth.saving") : t("auth.saveNewPassword")}</button>
        {error ? <p role="alert" className="note-error">{error}</p> : null}
      </form>
    </AuthFrame>
  );
}
