"use client";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
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
        : await getSupabase().auth.signUp({ email, password, options: { emailRedirectTo: `${location.origin}/dashboard` } });
      if (res.error) return setNote({ text: friendlyAuthError(res.error.message), error: true });
      if (res.data.session) return router.replace(nextPath());
      setNote({ text: "Check your email to confirm your account, then sign in." });
      setMode("in");
    } catch (err) {
      setNote({ text: friendlyAuthError((err as Error).message), error: true });
    } finally {
      setBusy(false);
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
    </AuthFrame>
  );
}

/** Only same-site dashboard paths are honoured, so ?next= can't redirect off Pekko. */
function nextPath() {
  if (typeof window === "undefined") return "/dashboard";
  return safeDashboardNext(new URLSearchParams(window.location.search).get("next") || "");
}
