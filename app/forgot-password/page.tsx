"use client";
import Link from "next/link";
import { useState } from "react";
import { getSupabase, supabaseConfigured } from "@/lib/supabase-browser";
import { AuthFrame, friendlyAuthError } from "@/components/auth-frame";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!supabaseConfigured()) return setError("This deploy is missing its Supabase settings.");
    setBusy(true);
    try {
      const { error: err } = await getSupabase().auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${location.origin}/reset-password`,
      });
      // Unknown emails succeed too, so the page never reveals who has an account.
      if (err) setError(friendlyAuthError(err.message));
      else setSent(true);
    } catch (err) {
      setError(friendlyAuthError((err as Error).message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame
      title={sent ? "Check your email" : "Reset your password"}
      lede={sent
        ? <>If an account uses <strong className="text-ink">{email.trim()}</strong>, a reset link is on its way. It works once and expires in an hour. Check spam if it doesn&apos;t arrive in a few minutes.</>
        : "Enter the email you sign in with. We'll send a link to choose a new password."}
      footer={<Link href="/login" className="font-semibold text-primary underline underline-offset-4">Back to sign in</Link>}
    >
      {sent ? (
        <button type="button" className="btn btn-quiet w-full" onClick={() => { setSent(false); setError(null); }}>
          Use a different email
        </button>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <label className="form-label" htmlFor="email">Email</label>
          <input id="email" className="field" type="email" autoComplete="email" required placeholder="you@business.com"
            value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className="btn btn-primary w-full" disabled={busy}>{busy ? "Sending…" : "Send reset link"}</button>
          {error ? <p role="alert" className="note-error">{error}</p> : null}
        </form>
      )}
    </AuthFrame>
  );
}
