"use client";
/**
 * The sign-up sheet over a finished guest menu (docs/GUEST_EDITOR_PLAN.md §3.4). It says the menu is already made,
 * why an account is needed for the chosen action, and offers both "Create account" and "I have an account".
 * Closing it returns to the editor with nothing lost (the draft is in this browser).
 *
 * Same Supabase calls, validation and tracking as /login: signUp / signInWithPassword, then the account page that
 * moves the menu into the account (/dashboard/claim) and continues the action. If email confirmation is on, the
 * link in the email lands on that same page, and the menu is still in this browser.
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Dialog } from "@/components/dialog";
import { useLocale } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/index";
import { friendlyAuthError, MIN_PASSWORD } from "@/components/auth-frame";
import { loadSupabase } from "@/lib/supabase-lazy";
import { signupErrorCode } from "@/lib/funnel";
import { trackFunnel } from "@/lib/funnel-client";
import { identifyUser, trackSignupCompleted } from "@/lib/heycatch-events";
import { conversion } from "@/lib/conversion-events";
import type { GuestAction } from "@/lib/guest-draft";
import { TRIAL } from "@/lib/plans";

/** Where the account continues after sign-up or log-in: the claim page, which resumes the action. */
export function claimPath(action: GuestAction): string {
  return `/dashboard/claim?intent=${action}`;
}

export function GuestAuthSheet({ action, onClose, board }: { action: GuestAction; onClose: () => void; board: React.ReactNode }) {
  const { t } = useLocale();
  const [mode, setMode] = useState<"up" | "in">("up");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => { conversion("registration_prompted", { detail: action }); }, [action]);
  useEffect(() => { emailRef.current?.focus(); }, [mode]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD) { setError(t("auth.up.passwordError", { min: MIN_PASSWORD })); if (mode === "up") trackFunnel("signup_error", "short_password"); return; }
    setBusy(true);
    conversion("registration_started", { detail: mode === "up" ? "signup" : "login", action });
    if (mode === "up") trackFunnel("signup_submit");
    try {
      const supabase = await loadSupabase();
      if (!supabase) { setError(t("auth.notConfigured")); return; }
      const next = claimPath(action);
      const res = mode === "up"
        ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${location.origin}${next}` } })
        : await supabase.auth.signInWithPassword({ email, password });
      if (res.error) {
        const code = signupErrorCode(res.error.message);
        if (mode === "up") trackFunnel("signup_error", code);
        conversion("registration_failed", { detail: code, mode });
        setError(friendlyAuthError(res.error.message, t));
        return;
      }
      if (res.data.session) {
        if (mode === "up") trackSignupCompleted(res.data.user?.id); else identifyUser(res.data.user?.id);
        conversion("registration_completed", { mode, action });
        location.assign(next);
        return;
      }
      // Email confirmation is on: the link lands on the claim page; the menu stays in this browser meanwhile.
      if (mode === "up" && (res.data.user?.identities?.length ?? 0) > 0) identifyUser(res.data.user?.id);
      setSentTo(email.trim());
    } catch (err) {
      const code = signupErrorCode((err as Error).message);
      if (mode === "up") trackFunnel("signup_error", code);
      conversion("registration_failed", { detail: code, mode });
      setError(friendlyAuthError((err as Error).message, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog label={t(`guest.sheet.${action}` as MessageKey)} onClose={onClose} variant="sheet" className="guest-sheet bg-paper w-full max-w-xl rounded-t-2xl md:rounded-2xl p-5 max-h-[94dvh] overflow-y-auto" testId="guest-sheet">
      <div className="grid gap-4">
        <div className="grid grid-cols-[96px_1fr] md:grid-cols-[160px_1fr] gap-3 items-center">
          <div className="rounded-lg overflow-hidden bg-[#1d1630] p-1" aria-hidden="true">{board}</div>
          <div>
            <h2 className="font-display text-lg md:text-xl font-bold leading-snug" data-testid="guest-sheet-title">{t(`guest.sheet.${action}` as MessageKey)}</h2>
            <p className="text-sm text-muted mt-1">{t("guest.sheet.kept")}</p>
          </div>
        </div>

        {sentTo ? (
          <p className="note-ok" role="status" data-testid="guest-sheet-inbox">{t("guest.sheet.inbox", { email: sentTo })}</p>
        ) : (
          <>
            <div className="seg grid grid-cols-2" role="tablist" aria-label={t("guest.sheet.tabUp")}>
              <button type="button" role="tab" aria-selected={mode === "up"} aria-pressed={mode === "up"} data-testid="guest-sheet-tab-up" onClick={() => { setMode("up"); setError(null); }}>{t("guest.sheet.tabUp")}</button>
              <button type="button" role="tab" aria-selected={mode === "in"} aria-pressed={mode === "in"} data-testid="guest-sheet-tab-in" onClick={() => { setMode("in"); setError(null); }}>{t("guest.sheet.tabIn")}</button>
            </div>
            <form className="grid gap-3" onSubmit={submit} name={mode === "up" ? "signup" : "login"} noValidate>
              <label htmlFor="guest-email" className="sr-only">{t("common.email")}</label>
              <input ref={emailRef} id="guest-email" name="email" className="field" type="email" autoComplete="email" inputMode="email" required
                placeholder={t("common.email")} value={email} onChange={(e) => setEmail(e.target.value)} data-testid="guest-sheet-email" />
              <label htmlFor="guest-password" className="sr-only">{t("common.password")}</label>
              <input id="guest-password" name="password" className="field" type="password" required minLength={MIN_PASSWORD}
                autoComplete={mode === "up" ? "new-password" : "current-password"} placeholder={t("common.password")}
                value={password} onChange={(e) => setPassword(e.target.value)} data-testid="guest-sheet-password" />
              {error ? <p className="note-error" role="alert" data-testid="guest-sheet-error">{error}</p> : null}
              <button className="btn btn-primary w-full min-h-12" disabled={busy} data-testid="guest-sheet-submit">
                {busy ? t("guest.sheet.busy") : mode === "up" ? t("guest.sheet.createAndGo") : t("guest.sheet.loginAndGo")}
              </button>
              {mode === "up"
                ? <p className="text-xs text-muted text-center">{t("guest.sheet.noCard", { days: TRIAL.days })}</p>
                : <p className="text-sm text-center"><Link href="/forgot-password" className="font-semibold text-primary underline underline-offset-4">{t("guest.sheet.forgot")}</Link></p>}
            </form>
          </>
        )}
        <button type="button" className="btn btn-quiet justify-self-center" onClick={onClose} data-testid="guest-sheet-close">{t("guest.sheet.close")}</button>
      </div>
    </Dialog>
  );
}
