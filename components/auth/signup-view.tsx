"use client";
/**
 * Sign-up page presentation (approved November 2026): "Create your free menu", trial reassurance, visible
 * labels, a password hint and Show/Hide, validation on leaving a field and on submit, and a "Check your inbox"
 * state. Presentation only: app/login/page.tsx still owns the Supabase signUp/resend calls, the confirmation
 * redirect and the 60 s resend wait, unchanged.
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LogoMark, Wordmark } from "@/components/brand";
import { LanguageSelect } from "@/components/i18n/language-select";
import { rich } from "@/components/i18n/rich";
import { useT } from "@/lib/i18n/client";
import { SUPPORT_EMAIL, TRIAL } from "@/lib/plans";
import { heroImage } from "@/lib/marketing-home";
import "@/components/auth/signup-view.css";
import { usePeekBodyClass, usePeekWeb } from "@/lib/peek-flag";
import { PeekLockup } from "@/components/peek/lockup";
import { Peek } from "@/components/peek/ui";

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const emailLooksValid = (email: string) => EMAIL_SHAPE.test(email.trim());

export type SignupProblem = "invalid_email" | "short_password";

/** Client-side checks shown before anything is sent. The server still enforces its own rules. */
export function signupProblems(email: string, password: string, min: number): SignupProblem[] {
  const out: SignupProblem[] = [];
  if (!emailLooksValid(email)) out.push("invalid_email");
  if (password.length < min) out.push("short_password");
  return out;
}

type Props = {
  email: string;
  password: string;
  setEmail: (v: string) => void;
  setPassword: (v: string) => void;
  minPassword: number;
  busy: boolean;
  configured: boolean;
  /** Called only when the client checks pass. */
  onSubmit: () => void;
  /** Client validation failed on submit (for the funnel count). */
  onInvalid: (problems: SignupProblem[]) => void;
  onSignIn: () => void;
  /** The address a confirmation email went to; set = show the inbox state. */
  sentTo: string | null;
  onDifferentEmail: () => void;
  resend: { onClick: () => void; disabled: boolean; label: string };
  /** The current note (server error or resend confirmation), already translated. */
  note: { text: string; error?: boolean } | null;
  announce: string;
};

export function SignupView(p: Props) {
  const t = useT();
  const [touched, setTouched] = useState({ email: false, password: false });
  const [show, setShow] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const pwRef = useRef<HTMLInputElement>(null);
  const inboxTitle = useRef<HTMLHeadingElement>(null);
  const emailBad = touched.email && !emailLooksValid(p.email);
  const pwBad = touched.password && p.password.length < p.minPassword;

  useEffect(() => { if (p.sentTo) inboxTitle.current?.focus(); }, [p.sentTo]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ email: true, password: true });
    const problems = signupProblems(p.email, p.password, p.minPassword);
    if (problems.length) {
      (problems[0] === "invalid_email" ? emailRef : pwRef).current?.focus();
      p.onInvalid(problems);
      return;
    }
    p.onSubmit();
  }

  const noteEl = p.note ? <p role={p.note.error ? "alert" : "status"} className={`su-note ${p.note.error ? "is-error" : "is-ok"}`}>{p.note.text}</p> : null;

  // Peek redesign preview (board 28, UPDATE-1): lockup top-left and the light Peek palette. Markup only; validation,
  // submit and the inbox state are unchanged. Off unless this browser opted in.
  const peek = usePeekWeb();
  usePeekBodyClass(peek);

  return (
    <div className={peek ? "su pk-su" : "su"} data-testid="signup-view">
      <header className="su-header">
        <div className="su-wrap su-header-row">
          <Link href="/" className="su-brand" aria-label={t("brand.homeLabel")}>{peek ? <PeekLockup height={48} /> : <><LogoMark className="size-8" /><Wordmark size="sm" /></>}</Link>
          <button type="button" className="su-signin" onClick={p.onSignIn}>{t("auth.up.haveAccount")}</button>
        </div>
      </header>
      <main id="main" className="su-main">
        <div className="su-wrap su-grid">
          <div className="su-intro">
            <h1>{t("auth.up.title")}</h1>
            <ul className="su-promise" aria-label={t("auth.up.promiseLabel")}>
              <li>{t("auth.up.chip1", { days: TRIAL.days })}</li>
              <li>{t("auth.up.chip2")}</li>
              <li>{t("auth.up.chip3")}</li>
            </ul>
          </div>

          <div className="su-card">
            {!p.configured ? <p className="su-note is-error">{t("auth.missingConfig")}</p> : null}
            {p.sentTo ? (
              <div className="su-inbox" data-testid="signup-inbox">
                <h2 ref={inboxTitle} tabIndex={-1}>{t("auth.up.inboxTitle")}</h2>
                {noteEl}
                <ol>
                  <li>{t("auth.up.inboxStep1")}</li>
                  <li>{t("auth.up.inboxStep2")}</li>
                </ol>
                <p className="su-hint">{t("auth.up.inboxSpam")}</p>
                <button type="button" className="su-btn su-btn-quiet" data-testid="resend-confirmation" onClick={p.resend.onClick} disabled={p.resend.disabled}>{p.resend.label}</button>
                <button type="button" className="su-btn su-btn-quiet" data-testid="signup-different-email" onClick={() => { setTouched({ email: false, password: false }); p.onDifferentEmail(); }}>{t("auth.differentEmail")}</button>
              </div>
            ) : (
              <form onSubmit={submit} noValidate className="su-form" name="signup" aria-labelledby="su-form-title">
                <h2 id="su-form-title">{t("auth.up.formTitle")}</h2>
                {noteEl}
                <div className="su-field">
                  <label htmlFor="login-email">{t("auth.up.email")}</label>
                  <input ref={emailRef} id="login-email" name="email" type="email" autoComplete="email" inputMode="email" placeholder={t("auth.emailPlaceholder")} required
                    aria-invalid={emailBad} aria-describedby={emailBad ? "su-email-err" : undefined}
                    value={p.email} onChange={(e) => p.setEmail(e.target.value)} onBlur={() => p.email && setTouched((v) => ({ ...v, email: true }))} />
                  {emailBad ? <p className="su-err" id="su-email-err">{t("auth.up.emailError")}</p> : null}
                </div>
                <div className="su-field">
                  <label htmlFor="login-password">{t("auth.up.password")}</label>
                  <div className="su-pw">
                    <input ref={pwRef} id="login-password" name="password" type={show ? "text" : "password"} autoComplete="new-password" minLength={p.minPassword} required
                      aria-invalid={pwBad} aria-describedby={pwBad ? "su-pw-err" : "su-pw-hint"}
                      value={p.password} onChange={(e) => p.setPassword(e.target.value)} onBlur={() => p.password && setTouched((v) => ({ ...v, password: true }))} />
                    <button type="button" aria-controls="login-password" aria-pressed={show} onClick={() => setShow((s) => !s)} data-testid="password-toggle">{show ? t("auth.up.hide") : t("auth.up.show")}</button>
                  </div>
                  {pwBad
                    ? <p className="su-err" id="su-pw-err">{t("auth.up.passwordError", { min: p.minPassword })}</p>
                    : <p className="su-hint" id="su-pw-hint">{t("auth.up.passwordHint", { min: p.minPassword })}</p>}
                </div>
                <button className="su-btn" disabled={p.busy} data-testid="signup-submit">{p.busy ? t("auth.up.busy") : t("auth.up.submit")}</button>
                <p className="su-legal" data-testid="signup-legal">
                  {rich(t("auth.legalConsent"), {
                    terms: (c) => <Link href="/terms">{c}</Link>,
                    privacy: (c) => <Link href="/privacy">{c}</Link>,
                  })}
                </p>
              </form>
            )}
            <p className="su-below">{rich(t("auth.up.questions", { email: SUPPORT_EMAIL }), { link: (c) => <a href={`mailto:${SUPPORT_EMAIL}`}>{c}</a> })}</p>
            <p className="sr-only" aria-live="polite" data-testid="resend-announce">{p.announce}</p>
          </div>

          <div className="su-get-wrap">
            <ul className="su-get" aria-label={t("auth.up.getLabel")}>
              {(["auth.up.get1", "auth.up.get2", "auth.up.get3"] as const).map((k, i) => (
                <li key={k} data-n={i + 1}><span>{rich(t(k))}</span></li>
              ))}
            </ul>
            <div className="su-peek">{peek ? <span className="pk-su-peek"><Peek mood="happy" size={52} /></span> : null}<img src={heroImage("modern-restaurant", 640)} width={1280} height={720} alt={t("auth.up.peekAlt")} loading="lazy" decoding="async" /></div>
          </div>
        </div>
      </main>
      <footer className="su-footer">
        <div className="su-wrap su-footer-row">
          <nav aria-label={t("auth.legalNav")}><Link href="/terms">{t("footer.terms")}</Link><Link href="/privacy">{t("footer.privacy")}</Link></nav>
          {/* Client-only switch: no refresh, so a half-filled form is kept. */}
          <LanguageSelect refresh={false} />
        </div>
      </footer>
    </div>
  );
}
