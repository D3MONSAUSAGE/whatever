"use client";
import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabase, supabaseConfigured } from "@/lib/supabase-browser";
import { AuthFrame, friendlyAuthError, isRecoveryUrl, MIN_PASSWORD } from "@/components/auth-frame";
import { safeDashboardNext } from "@/lib/safe-next";
import { useT } from "@/lib/i18n/client";
import type { MessageKey, Vars } from "@/lib/i18n/index";
import { useRequiredMessage } from "@/components/ui";
import { SignupView } from "@/components/auth/signup-view";
import { trackFunnel } from "@/lib/funnel-client";
import { signupErrorCode } from "@/lib/funnel";

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <Login />
    </Suspense>
  );
}

function LoginFallback() {
  const t = useT();
  return <AuthFrame title={t("auth.signInTitle")}><p className="text-sm text-muted">{t("common.loading")}</p></AuthFrame>;
}

/** A note is kept as a key (re-rendered in the current language) or as raw text from the server. */
type Note = { key?: MessageKey; vars?: Vars; text?: string; error?: boolean };

function Login() {
  const t = useT();
  const requiredMsg = useRequiredMessage();
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<"in" | "up">(params.get("mode") === "up" ? "up" : "in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note | null>(null);
  // E4: the address a confirmation email was sent to (or that needs confirming), for "Resend confirmation email".
  const [pending, setPending] = useState<string | null>(null);
  const [resendWait, setResendWait] = useState(0);
  const [resending, setResending] = useState(false);
  // Screen readers hear one polite message when the wait ends, not a per-second countdown (Gother #104 low 3).
  const [announce, setAnnounce] = useState<MessageKey | null>(null);
  const wasWaiting = useRef(false);
  // Sign-up: the address the confirmation email went to (shows "Check your inbox").
  const [sentTo, setSentTo] = useState<string | null>(null);

  // Funnel: one signup_view per page load (cookieless daily count, lib/funnel.ts).
  useEffect(() => { if (mode === "up") trackFunnel("signup_view", "", { oncePerPage: true }); }, [mode]);

  useEffect(() => {
    if (resendWait <= 0) return;
    const t = setTimeout(() => setResendWait((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendWait]);

  useEffect(() => {
    if (resendWait > 0) { wasWaiting.current = true; setAnnounce(null); }
    else if (wasWaiting.current) { wasWaiting.current = false; setAnnounce("auth.resendReady"); }
  }, [resendWait]);

  useEffect(() => {
    if (params.get("mode") === "up") setMode("up");
    // A recovery link that fell back to the Site URL still ends on the reset page.
    if (isRecoveryUrl()) { location.replace(`/reset-password${location.search}${location.hash}`); return; }
    if (!supabaseConfigured()) return;
    getSupabase().auth.getSession().then(({ data }) => data.session && router.replace(nextPath())).catch(() => {});
  }, [params, router]);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    setNote(null);
    if (!supabaseConfigured()) {
      setNote({ key: "auth.notConfigured", error: true });
      return;
    }
    setBusy(true);
    if (mode === "up") trackFunnel("signup_submit");
    try {
      const res = mode === "in"
        ? await getSupabase().auth.signInWithPassword({ email, password })
        : await getSupabase().auth.signUp({ email, password, options: { emailRedirectTo: confirmRedirect() } });
      if (res.error) {
        // Gother #104 low 2: an unconfirmed sign-in starts the same 60 s wait as sign-up.
        if (needsConfirmation(res.error)) { setPending(email.trim()); setResendWait(RESEND_COOLDOWN_S); return setNote({ key: "auth.confirmFirst", error: true }); }
        if (mode === "up") trackFunnel("signup_error", signupErrorCode(res.error.message));
        return setNote({ text: friendlyAuthError(res.error.message, t), error: true });
      }
      if (res.data.session) return router.replace(nextPath());
      setPending(email.trim());
      setResendWait(RESEND_COOLDOWN_S);
      if (mode === "up") {
        setSentTo(email.trim());
        setNote({ key: "auth.up.inboxSent", vars: { email: email.trim() } });
      } else {
        setNote({ key: "auth.checkEmail" });
      }
    } catch (err) {
      if (mode === "up") trackFunnel("signup_error", signupErrorCode((err as Error).message));
      setNote({ text: friendlyAuthError((err as Error).message, t), error: true });
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (!pending || resendWait > 0 || resending) return;
    setResending(true);
    try {
      const res = await getSupabase().auth.resend({ type: "signup", email: pending, options: { emailRedirectTo: confirmRedirect() } });
      if (res.error) return setNote({ text: friendlyAuthError(res.error.message, t), error: true });
      setResendWait(RESEND_COOLDOWN_S);
      setNote({ key: "auth.resent", vars: { email: pending } });
    } catch (err) {
      setNote({ text: friendlyAuthError((err as Error).message, t), error: true });
    } finally {
      setResending(false);
    }
  }

  if (mode === "up") {
    return (
      <SignupView
        email={email} password={password} setEmail={setEmail} setPassword={setPassword} minPassword={MIN_PASSWORD}
        busy={busy} configured={supabaseConfigured()}
        onSubmit={() => void submit()}
        onInvalid={(problems) => { for (const code of problems) trackFunnel("signup_error", code); }}
        onSignIn={() => { setMode("in"); setNote(null); setSentTo(null); }}
        sentTo={sentTo}
        onDifferentEmail={() => { setSentTo(null); setPending(null); setResendWait(0); setNote(null); setPassword(""); }}
        resend={{ onClick: resend, disabled: resending || resendWait > 0, label: resending ? t("auth.sending") : resendWait > 0 ? t("auth.resendWait") : t("auth.resend") }}
        note={note ? { text: note.key ? t(note.key, note.vars) : note.text ?? "", error: note.error } : null}
        announce={announce ? t(announce) : ""}
      />
    );
  }

  return (
    <AuthFrame
      title={t("auth.signInTitle")}
      footer={
        <button type="button" className="font-semibold text-primary underline underline-offset-4"
          onClick={() => { setMode("up"); setNote(null); }}>
          {t("auth.newHere")}
        </button>
      }
    >
      {!supabaseConfigured() && (
        <p className="mb-4 note-error">{t("auth.missingConfig")}</p>
      )}
      <form onSubmit={submit} className="space-y-3" name="login">
        {/* Stable name/id/autocomplete and real <label for> in every language, so password managers find the fields (I18N-1F). */}
        <label htmlFor="login-email" className="sr-only">{t("common.email")}</label>
        <input id="login-email" name="email" className="field" type="email" autoComplete="email" inputMode="email" placeholder={t("common.email")} required {...requiredMsg}
          value={email} onChange={(e) => setEmail(e.target.value)} />
        <label htmlFor="login-password" className="sr-only">{t("common.password")}</label>
        <input id="login-password" name="password" className="field" type="password" autoComplete="current-password"
          placeholder={t("common.password")} minLength={MIN_PASSWORD} required {...requiredMsg} value={password} onChange={(e) => setPassword(e.target.value)} />
        <div className="text-right">
          <Link href="/forgot-password" className="text-sm font-semibold text-primary underline underline-offset-4">{t("auth.forgot")}</Link>
        </div>
        <button className="btn btn-primary w-full" disabled={busy}>{busy ? t("auth.busy") : t("auth.signInButton")}</button>
      </form>
      {note && <p role={note.error ? "alert" : "status"} className={`mt-4 ${note.error ? "note-error" : "note-ok"}`}>{note.key ? t(note.key, note.vars) : note.text}</p>}
      {pending ? (
        <button type="button" className="btn btn-quiet w-full mt-3" data-testid="resend-confirmation" onClick={resend} disabled={resending || resendWait > 0}>
          {resending ? t("auth.sending") : resendWait > 0 ? t("auth.resendWait") : t("auth.resend")}
        </button>
      ) : null}
      <p className="sr-only" aria-live="polite" data-testid="resend-announce">{announce ? t(announce) : ""}</p>
    </AuthFrame>
  );
}

const RESEND_COOLDOWN_S = 60;

/** Supabase's "Email not confirmed" sign-in error (code email_not_confirmed). */
function needsConfirmation(error: { message?: string; code?: string }) {
  return error.code === "email_not_confirmed" || /email not confirmed/i.test(error.message || "");
}

/** E4: the confirmation link lands where sign-in would have (?next=), on this site. */
function confirmRedirect() {
  return `${location.origin}${nextPath()}`;
}

/** Only same-site dashboard paths are honoured, so ?next= can't redirect off Pekko. */
function nextPath() {
  if (typeof window === "undefined") return "/dashboard";
  return safeDashboardNext(new URLSearchParams(window.location.search).get("next") || "");
}
