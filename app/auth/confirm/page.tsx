"use client";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getSupabase, supabaseConfigured } from "@/lib/supabase-browser";
import { useT } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/index";
import { AuthFrame, friendlyAuthError } from "@/components/auth-frame";
import { CLEAN_CONFIRM_PATH, confirmPlan } from "@/lib/auth-confirm";
import { ResendConfirmation } from "@/components/auth/resend-confirmation";
import { trackSignupCompleted } from "@/lib/heycatch-events";

/**
 * Branded landing page for Supabase email links (B2-07 option A).
 * Nothing is verified until the owner presses the button, so link scanners
 * that open the email link cannot use it up.
 */
function ConfirmFallback() {
  const t = useT();
  return <AuthFrame title={t("auth.checkingLink")} lede={t("common.oneMoment")}><div className="skeleton h-12" /></AuthFrame>;
}

/** "email" links use the same copy as "signup" (same as CONFIRM_COPY in lib/auth-confirm.ts). */
function copyKeys(type: string) {
  const k = type === "email" ? "signup" : type;
  return {
    title: `auth.confirm.${k}.title` as MessageKey,
    lede: `auth.confirm.${k}.lede` as MessageKey,
    button: `auth.confirm.${k}.button` as MessageKey,
    done: `auth.confirm.${k}.done` as MessageKey,
  };
}

export default function AuthConfirmPage() {
  return (
    <Suspense fallback={<ConfirmFallback />}>
      <AuthConfirm />
    </Suspense>
  );
}

function AuthConfirm() {
  const t = useT();
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
        title={t("auth.linkUnusable")}
        lede={plan.reason === "type" ? t("auth.linkType") : t("auth.linkIncomplete")}
        footer={<Link href="/login" className="font-semibold text-primary underline underline-offset-4">{t("common.backToSignIn")}</Link>}
      >
        {/* I18N-1F: the usual reason to land here is a sign-up link, so offer a new confirmation email first. */}
        <ResendConfirmation />
        <p className="mt-5 text-sm text-muted text-center">
          {t("auth.confirmResendOr")}{" "}
          <Link href="/forgot-password" className="font-semibold text-primary underline underline-offset-4" data-testid="confirm-reset-link">{t("auth.sendNewResetLink")}</Link>
        </p>
      </AuthFrame>
    );
  }

  const keys = copyKeys(plan.type);
  const copy = { title: t(keys.title), lede: t(keys.lede), button: t(keys.button), done: t(keys.done) };

  async function confirm() {
    if (!plan.ok || busy) return;
    setError(null);
    if (!supabaseConfigured()) return setError(t("auth.signInUnavailable"));
    setBusy(true);
    try {
      const { data, error: err } = await getSupabase().auth.verifyOtp({ token_hash: plan.tokenHash, type: plan.type });
      if (err) {
        setError(friendlyAuthError(err.message, t));
        setBusy(false);
        return;
      }
      // HeyCatch: a confirmed sign-up link is the moment a new account is created (re-clicked links fail above).
      if (plan.type === "signup") trackSignupCompleted(data?.user?.id);
      setDone(true);
      location.replace(plan.next);
    } catch (err) {
      setError(friendlyAuthError((err as Error).message, t));
      setBusy(false);
    }
  }

  return (
    <AuthFrame
      title={copy.title}
      lede={copy.lede}
      footer={<Link href="/login" className="font-semibold text-primary underline underline-offset-4">{t("common.backToSignIn")}</Link>}
    >
      {done ? (
        <p role="status" className="text-sm">{copy.done}</p>
      ) : (
        <>
          <button type="button" className="btn btn-primary w-full" disabled={busy} onClick={() => void confirm()}>
            {busy ? t("auth.checking") : copy.button}
          </button>
          {error ? (
            <div className="mt-4 grid gap-3">
              <p role="alert" className="text-sm text-danger">{error}</p>
              {plan.type === "recovery" ? <Link href="/forgot-password" className="btn btn-quiet w-full">{t("auth.sendNewResetLink")}</Link> : null}
              {plan.type === "signup" || plan.type === "email" ? <ResendConfirmation next={plan.next} /> : null}
            </div>
          ) : null}
        </>
      )}
    </AuthFrame>
  );
}
