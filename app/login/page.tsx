"use client";
import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabase, supabaseConfigured } from "@/lib/supabase-browser";
import { AuthFrame, friendlyAuthError, isRecoveryUrl, MIN_PASSWORD } from "@/components/auth-frame";
import { safeDashboardNext } from "@/lib/safe-next";

export default function LoginPage() {
  return (
    <Suspense fallback={<AuthFrame title="Sign in"><p className="text-sm text-muted">Loading…</p></AuthFrame>}>
      <Login />
    </Suspense>
  );
}

function Login() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<"in" | "up">(params.get("mode") === "up" ? "up" : "in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  // E4: the address a confirmation email was sent to (or that needs confirming), for "Resend confirmation email".
  const [pending, setPending] = useState<string | null>(null);
  const [resendWait, setResendWait] = useState(0);
  const [resending, setResending] = useState(false);
  // Screen readers hear one polite message when the wait ends, not a per-second countdown (Gother #104 low 3).
  const [announce, setAnnounce] = useState("");
  const wasWaiting = useRef(false);

  useEffect(() => {
    if (resendWait <= 0) return;
    const t = setTimeout(() => setResendWait((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendWait]);

  useEffect(() => {
    if (resendWait > 0) { wasWaiting.current = true; setAnnounce(""); }
    else if (wasWaiting.current) { wasWaiting.current = false; setAnnounce("You can send a new confirmation email now."); }
  }, [resendWait]);

  useEffect(() => {
    if (params.get("mode") === "up") setMode("up");
    // A recovery link that fell back to the Site URL still ends on the reset page.
    if (isRecoveryUrl()) { location.replace(`/reset-password${location.search}${location.hash}`); return; }
    if (!supabaseConfigured()) return;
    getSupabase().auth.getSession().then(({ data }) => data.session && router.replace(nextPath())).catch(() => {});
  }, [params, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setNote(null);
    if (!supabaseConfigured()) {
      setNote({ text: "Supabase is not configured on this deploy.", error: true });
      return;
    }
    setBusy(true);
    try {
      const res = mode === "in"
        ? await getSupabase().auth.signInWithPassword({ email, password })
        : await getSupabase().auth.signUp({ email, password, options: { emailRedirectTo: confirmRedirect() } });
      if (res.error) {
        // Gother #104 low 2: an unconfirmed sign-in starts the same 60 s wait as sign-up.
        if (needsConfirmation(res.error)) { setPending(email.trim()); setResendWait(RESEND_COOLDOWN_S); return setNote({ text: "Confirm your email first. Open the link we sent you, or send a new one below.", error: true }); }
        return setNote({ text: friendlyAuthError(res.error.message), error: true });
      }
      if (res.data.session) return router.replace(nextPath());
      setPending(email.trim());
      setResendWait(RESEND_COOLDOWN_S);
      setNote({ text: "Check your email to confirm your account, then sign in." });
      setMode("in");
    } catch (err) {
      setNote({ text: friendlyAuthError((err as Error).message), error: true });
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (!pending || resendWait > 0 || resending) return;
    setResending(true);
    try {
      const res = await getSupabase().auth.resend({ type: "signup", email: pending, options: { emailRedirectTo: confirmRedirect() } });
      if (res.error) return setNote({ text: friendlyAuthError(res.error.message), error: true });
      setResendWait(RESEND_COOLDOWN_S);
      setNote({ text: `We sent a new confirmation email to ${pending}. It can take a minute to arrive; check spam too.` });
    } catch (err) {
      setNote({ text: friendlyAuthError((err as Error).message), error: true });
    } finally {
      setResending(false);
    }
  }

  return (
    <AuthFrame
      title={mode === "in" ? "Sign in" : "Create your account"}
      footer={
        <button type="button" className="font-semibold text-primary underline underline-offset-4"
          onClick={() => { setMode(mode === "in" ? "up" : "in"); setNote(null); }}>
          {mode === "in" ? "New here? Create an account" : "Have an account? Sign in"}
        </button>
      }
    >
      {!supabaseConfigured() && (
        <p className="mb-4 note-error">This deploy is missing its Supabase URL or publishable key.</p>
      )}
      <form onSubmit={submit} className="space-y-3">
        <input className="field" type="email" autoComplete="email" placeholder="Email" aria-label="Email" required
          value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="field" type="password" autoComplete={mode === "in" ? "current-password" : "new-password"}
          placeholder="Password" aria-label="Password" minLength={MIN_PASSWORD} required value={password} onChange={(e) => setPassword(e.target.value)} />
        {mode === "in" ? (
          <div className="text-right">
            <Link href="/forgot-password" className="text-sm font-semibold text-primary underline underline-offset-4">Forgot password?</Link>
          </div>
        ) : null}
        {mode === "up" ? (
          <p className="text-sm text-muted" data-testid="signup-legal">
            By creating an account you agree to the <Link className="underline" href="/terms">Terms of Service</Link> and <Link className="underline" href="/privacy">Privacy Policy</Link>.
          </p>
        ) : null}
        <button className="btn btn-primary w-full" disabled={busy}>{busy ? "One moment…" : mode === "in" ? "Sign in" : "Create account"}</button>
      </form>
      {note && <p role={note.error ? "alert" : "status"} className={`mt-4 ${note.error ? "note-error" : "note-ok"}`}>{note.text}</p>}
      {pending ? (
        <button type="button" className="btn btn-quiet w-full mt-3" data-testid="resend-confirmation" onClick={resend} disabled={resending || resendWait > 0}>
          {resending ? "Sending…" : resendWait > 0 ? "Resend confirmation email (wait a minute)" : "Resend confirmation email"}
        </button>
      ) : null}
      <p className="sr-only" aria-live="polite" data-testid="resend-announce">{announce}</p>
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
