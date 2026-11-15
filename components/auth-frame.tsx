"use client";
import Link from "next/link";
import { LogoMark, WaveBackdrop, Wordmark } from "@/components/brand";
import { useT } from "@/lib/i18n/client";
import { makeT, type MessageKey, type T } from "@/lib/i18n/index";
import { LanguageSelect } from "@/components/i18n/language-select";

/** Shared frame for sign-in, forgot-password, and reset-password. */
export function AuthFrame({ title, lede, children, footer }: { title: string; lede?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode }) {
  const t = useT();
  return (
    <main className="wave-surface relative min-h-dvh overflow-hidden grid place-items-center px-5 py-12">
      <WaveBackdrop />
      <div className="relative z-10 auth-card">
        <Link href="/login" className="flex flex-col items-center text-center mb-8" aria-label={t("brand.homeLabel")}>
          <LogoMark className="size-16" />
          <span className="mt-4"><Wordmark size="lg" align="center" /></span>
          <span className="mt-3 text-sm text-muted">{t("brand.tagline")}</span>
        </Link>
        <div className="card p-6 md:p-8">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {lede ? <p className="mt-1.5 mb-5 text-sm text-muted leading-relaxed">{lede}</p> : <div className="mb-5" />}
          {children}
        </div>
        {footer ? <div className="mt-6 text-center text-sm">{footer}</div> : null}
        <nav className="mt-6 flex justify-center gap-4 text-xs text-muted" aria-label={t("auth.legalNav")}>
          <Link href="/terms" className="hover:underline">{t("footer.terms")}</Link>
          <Link href="/privacy" className="hover:underline">{t("footer.privacy")}</Link>
        </nav>
        {/* Client-only switch: no refresh, so a half-filled form is kept. */}
        <div className="mt-4 flex justify-center"><LanguageSelect refresh={false} /></div>
      </div>
    </main>
  );
}

const EN: T = makeT("en");

/** Supabase error text → dictionary key (null = pass the message through as-is). */
export function authErrorKey(message: string | undefined | null): { key: MessageKey; vars?: Record<string, number> } | null {
  const text = (message || "").toLowerCase();
  if (!text) return { key: "authError.generic" };
  if (text.includes("invalid login")) return { key: "authError.invalidLogin" };
  if (text.includes("email not confirmed")) return { key: "authError.notConfirmed" };
  if (text.includes("rate limit") || text.includes("too many") || text.includes("security purposes")) return { key: "authError.rateLimit" };
  if (text.includes("same") && text.includes("password")) return { key: "authError.samePassword" };
  if (text.includes("password") && (text.includes("short") || text.includes("least"))) return { key: "authError.short", vars: { min: MIN_PASSWORD } };
  if (text.includes("weak")) return { key: "authError.weak" };
  if (text.includes("expired") || text.includes("invalid") && text.includes("link")) return { key: "authError.expired" };
  if (text.includes("fetch") || text.includes("network")) return { key: "authError.network" };
  return null;
}

/** Supabase error text is terse. Map the common ones to plain language (in the UI language when `t` is given). */
export function friendlyAuthError(message: string | undefined | null, t: T = EN): string {
  const hit = authErrorKey(message);
  return hit ? t(hit.key, hit.vars) : (message as string);
}

/** True when the URL carries a Supabase recovery link (implicit hash or PKCE code from a recovery email). */
export function isRecoveryUrl(): boolean {
  if (typeof window === "undefined") return false;
  return /(^|[#&?])type=recovery(&|$)/.test(window.location.hash) || /(^|[?&])type=recovery(&|$)/.test(window.location.search);
}

export const MIN_PASSWORD = 8;
