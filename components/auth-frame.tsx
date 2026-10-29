"use client";
import Link from "next/link";
import { LogoMark, WaveBackdrop, Wordmark } from "@/components/brand";

/** Shared frame for sign-in, forgot-password, and reset-password. */
export function AuthFrame({ title, lede, children, footer }: { title: string; lede?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <main className="wave-surface relative min-h-dvh overflow-hidden grid place-items-center px-5 py-12">
      <WaveBackdrop />
      <div className="relative z-10 auth-card">
        <Link href="/login" className="flex flex-col items-center text-center mb-8" aria-label="Seemple home">
          <LogoMark className="size-16" />
          <span className="mt-4"><Wordmark size="lg" align="center" /></span>
          <span className="mt-3 text-sm text-muted">making life simpler every day.</span>
        </Link>
        <div className="card p-6 md:p-8">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {lede ? <p className="mt-1.5 mb-5 text-sm text-muted leading-relaxed">{lede}</p> : <div className="mb-5" />}
          {children}
        </div>
        {footer ? <div className="mt-6 text-center text-sm">{footer}</div> : null}
        <nav className="mt-6 flex justify-center gap-4 text-xs text-muted" aria-label="Legal">
          <Link href="/terms" className="hover:underline">Terms</Link>
          <Link href="/privacy" className="hover:underline">Privacy</Link>
        </nav>
      </div>
    </main>
  );
}

/** Supabase error text is terse. Map the common ones to plain language. */
export function friendlyAuthError(message: string | undefined | null): string {
  const text = (message || "").toLowerCase();
  if (!text) return "Something went wrong. Try again.";
  if (text.includes("invalid login")) return "That email and password don't match.";
  if (text.includes("email not confirmed")) return "Confirm your email first. Check your inbox for the link.";
  if (text.includes("rate limit") || text.includes("too many") || text.includes("security purposes")) {
    return "Too many emails were sent recently. Wait a few minutes, then try again.";
  }
  if (text.includes("same") && text.includes("password")) return "Choose a password you haven't used here before.";
  if (text.includes("password") && (text.includes("short") || text.includes("least"))) return "Use at least 8 characters.";
  if (text.includes("weak")) return "That password is too easy to guess. Try a longer one.";
  if (text.includes("expired") || text.includes("invalid") && text.includes("link")) return "This link has expired. Ask for a new one.";
  if (text.includes("fetch") || text.includes("network")) return "Can't reach the server. Check your connection and try again.";
  return message as string;
}

/** True when the URL carries a Supabase recovery link (implicit hash or PKCE code from a recovery email). */
export function isRecoveryUrl(): boolean {
  if (typeof window === "undefined") return false;
  return /(^|[#&?])type=recovery(&|$)/.test(window.location.hash) || /(^|[?&])type=recovery(&|$)/.test(window.location.search);
}

export const MIN_PASSWORD = 8;
