"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase, supabaseConfigured } from "@/lib/supabase-browser";
import { AuthFrame, friendlyAuthError, MIN_PASSWORD } from "@/components/auth-frame";

type Phase = "checking" | "ready" | "invalid" | "done";

export default function ResetPassword() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("checking");
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
    if (described) { setLinkError(friendlyAuthError(described)); setPhase("invalid"); return; }

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
          if (err && !cancelled) { setLinkError(friendlyAuthError(err.message)); setPhase("invalid"); return; }
        }
        const { data: current } = await supabase.auth.getSession();
        if (cancelled) return;
        if (current.session) setPhase("ready");
        else setTimeout(() => !cancelled && setPhase((p) => (p === "checking" ? "invalid" : p)), 2500);
      } catch (err) {
        if (!cancelled) { setLinkError(friendlyAuthError((err as Error).message)); setPhase("invalid"); }
      }
    })();
    return () => { cancelled = true; data.subscription.unsubscribe(); };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD) return setError(`Use at least ${MIN_PASSWORD} characters.`);
    if (password !== confirm) return setError("The two passwords don't match.");
    setBusy(true);
    const { error: err } = await getSupabase().auth.updateUser({ password });
    setBusy(false);
    if (err) return setError(friendlyAuthError(err.message));
    history.replaceState(null, "", "/reset-password");
    setPhase("done");
  }

  if (phase === "checking") {
    return <AuthFrame title="Checking your link…" lede="One moment."><div className="skeleton h-12" /></AuthFrame>;
  }
  if (phase === "invalid") {
    return (
      <AuthFrame title="This link can't be used" lede={linkError || "Reset links work once and expire after an hour. Ask for a new one."}
        footer={<Link href="/login" className="font-semibold text-primary underline underline-offset-4">Back to sign in</Link>}>
        <Link href="/forgot-password" className="btn btn-primary w-full">Send a new link</Link>
      </AuthFrame>
    );
  }
  if (phase === "done") {
    return (
      <AuthFrame title="Password updated" lede="You're signed in with your new password.">
        <button type="button" className="btn btn-primary w-full" onClick={() => router.replace("/dashboard")}>Go to dashboard</button>
      </AuthFrame>
    );
  }
  return (
    <AuthFrame title="Choose a new password" lede={`At least ${MIN_PASSWORD} characters. You'll stay signed in on this device.`}>
      <form onSubmit={submit} className="space-y-3">
        <label className="form-label" htmlFor="new-password">New password</label>
        <input id="new-password" className="field" type="password" autoComplete="new-password" minLength={MIN_PASSWORD} required
          value={password} onChange={(e) => setPassword(e.target.value)} />
        <label className="form-label" htmlFor="confirm-password">Confirm new password</label>
        <input id="confirm-password" className="field" type="password" autoComplete="new-password" minLength={MIN_PASSWORD} required
          value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <button className="btn btn-primary w-full" disabled={busy}>{busy ? "Saving…" : "Save new password"}</button>
        {error ? <p role="alert" className="note-error">{error}</p> : null}
      </form>
    </AuthFrame>
  );
}
