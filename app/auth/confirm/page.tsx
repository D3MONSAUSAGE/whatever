"use client";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getSupabase, supabaseConfigured } from "@/lib/supabase-browser";
import { AuthFrame, friendlyAuthError } from "@/components/auth-frame";
import { CLEAN_CONFIRM_PATH, CONFIRM_COPY, confirmPlan } from "@/lib/auth-confirm";

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
  // Read the link once and keep token_hash/type in memory only (B2-07A, Gother MEDIUM).
  const [plan] = useState(() => confirmPlan(new URLSearchParams(params.toString())));
  useEffect(() => {
    // Strip token_hash and type from the address bar, history and any later Referer.
    // This only cleans the URL; nothing is verified until the button is pressed.
    if (window.location.search) window.history.replaceState(null, "", CLEAN_CONFIRM_PATH);
  }, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!plan.ok) {
    return (
      <AuthFrame
        title="This link can't be used"
        lede={plan.reason === "type"
          ? "This kind of email link isn't used by Pekko. Sign in, or ask for a new password reset link."
          : "The link is incomplete. Open it straight from the email, or ask for a new one."}
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
