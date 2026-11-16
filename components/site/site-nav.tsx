"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LogoMark, Wordmark } from "@/components/brand";
import { useT } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/index";
import { LanguageSelect } from "@/components/i18n/language-select";

export const NAV_LINKS: readonly { href: string; label: MessageKey }[] = [
  { href: "/", label: "nav.home" },
  { href: "/features", label: "nav.features" },
  { href: "/pricing", label: "nav.pricing" },
  { href: "/faq", label: "nav.faq" },
];

/** `tone="dark"` is the marketing look (PublicPage theme="dark"); the default is unchanged for legal and other pages. */
export function SiteNav({ tone = "light" }: { tone?: "light" | "dark" } = {}) {
  const dark = tone === "dark";
  const t = useT();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  const hover = dark ? "hover:bg-white/10 hover:text-white" : "hover:bg-black/5";
  const cls = (href: string) =>
    dark
      ? `rounded-full px-3.5 py-2 ${hover} ${pathname === href ? "text-white bg-white/10" : "text-[#c5d3ee]"}`
      : `rounded-lg px-3 py-2 hover:bg-black/5 ${pathname === href ? "text-primary" : ""}`;
  return (
    <header className={dark ? "sticky top-0 z-40 border-b border-white/10 bg-[#040916]/75 backdrop-blur-xl" : "sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur"} data-testid="site-nav">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3">
        <Link href="/" className="inline-flex items-center gap-2.5" aria-label={t("brand.homeLabel")}>
          <LogoMark className="size-9" />
          <Wordmark />
        </Link>
        <nav className="hidden md:flex items-center gap-1 text-sm font-semibold" aria-label={t("nav.main")}>
          {NAV_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={cls(l.href)} aria-current={pathname === l.href ? "page" : undefined}>{t(l.label)}</Link>
          ))}
        </nav>
        <div className="hidden md:flex items-center gap-2 text-sm font-semibold">
          <LanguageSelect compact />
          <Link href="/login" className={dark ? "rounded-full px-3.5 py-2 text-[#c5d3ee] hover:bg-white/10 hover:text-white" : "rounded-lg px-3 py-2 hover:bg-black/5"} data-testid="nav-login">{t("nav.login")}</Link>
          <Link href="/signup" className="btn btn-primary" data-testid="nav-trial">{t("nav.startTrial")}</Link>
        </div>
        <button type="button" className={`md:hidden rounded-lg p-2 ${hover}`} aria-label={open ? t("nav.closeMenu") : t("nav.openMenu")}
          aria-expanded={open} aria-controls="mobile-menu" onClick={() => setOpen((o) => !o)} data-testid="menu-toggle">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </div>
      {open ? (
        <nav id="mobile-menu" className={dark ? "md:hidden border-t border-white/10 bg-[#060d22] px-5 pb-5 pt-2 text-base font-semibold" : "md:hidden border-t border-line bg-paper px-5 pb-5 pt-2 text-base font-semibold"} aria-label={t("nav.mobile")}>
          <ul className="grid">
            {NAV_LINKS.map((l) => (
              <li key={l.href}><Link href={l.href} className="block py-3" onClick={() => setOpen(false)} aria-current={pathname === l.href ? "page" : undefined}>{t(l.label)}</Link></li>
            ))}
            <li><Link href="/login" className="block py-3" onClick={() => setOpen(false)}>{t("nav.login")}</Link></li>
          </ul>
          <LanguageSelect className="mt-2" />
          <Link href="/signup" className="btn btn-primary mt-3 w-full" onClick={() => setOpen(false)}>{t("nav.startTrial")}</Link>
        </nav>
      ) : null}
    </header>
  );
}
