"use client";
import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getSupabase, supabaseConfigured } from "@/lib/supabase-browser";
import { AuthFrame, friendlyAuthError } from "@/components/auth-frame";
import { CONFIRM_COPY, confirmPlan } from "@/lib/auth-confirm";

/**
 * Branded landing page for Supabase email links (B2-07 option A).
 * Nothing is verified until the owner presses the button, so link scanners
 * that open the email link cannot use it up.
 */
export default function AuthConfirmPage() {
  return (
    <Suspense fallback={<AuthFrame title="Checking your link…" lede="One moment."><div className="skeleton h-12" /></AuthFrame>}>
      <AuthConfirm />
    </Suspense>
  );
}

function AuthConfirm() {
  const params = useSearchParams();
  const plan = confirmPlan(new URLSearchParams(params.toString()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!plan.ok) {
    return (
      <AuthFrame
        title="This link can't be used"
        lede="The link is incomplete. Open it straight from the email, or ask for a new one."
        footer={<Link href="/login" className="font-semibold text-primary underline underline-offset-4">Back to sign in</Link>}
      >
        <Link href="/forgot-password" className="btn btn-primary w-full">Send a new reset link</Link>
      </AuthFrame>
    );
  }

  const copy = CONFIRM_COPY[plan.type];

  async function confirm() {
    if (!plan.ok || busy) return;
    setError(null);
    if (!supabaseConfigured()) return setError("Sign-in isn't available on this site right now.");
    setBusy(true);
    try {
      const { error: err } = await getSupabase().auth.verifyOtp({ token_hash: plan.tokenHash, type: plan.type });
      if (err) {
        setError(friendlyAuthError(err.message));
        setBusy(false);
        return;
      }
      setDone(true);
      location.replace(plan.next);
    } catch (err) {
      setError(friendlyAuthError((err as Error).message));
      setBusy(false);
    }
  }

  return (
    <AuthFrame
      title={copy.title}
      lede={copy.lede}
      footer={<Link href="/login" className="font-semibold text-primary underline underline-offset-4">Back to sign in</Link>}
    >
      {done ? (
        <p role="status" className="text-sm">{copy.done}</p>
      ) : (
        <>
          <button type="button" className="btn btn-primary w-full" disabled={busy} onClick={() => void confirm()}>
            {busy ? "Checking…" : copy.button}
          </button>
          {error ? (
            <div className="mt-4 grid gap-3">
              <p role="alert" className="text-sm text-danger">{error}</p>
              {plan.type === "recovery" ? <Link href="/forgot-password" className="btn btn-quiet w-full">Send a new reset link</Link> : null}
            </div>
          ) : null}
        </>
      )}
    </AuthFrame>
  );
}
