"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LogoMark, Wordmark } from "@/components/brand";

export const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/faq", label: "FAQ" },
] as const;

export function SiteNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  const cls = (href: string) =>
    `rounded-lg px-3 py-2 hover:bg-black/5 ${pathname === href ? "text-primary" : ""}`;
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur" data-testid="site-nav">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3">
        <Link href="/" className="inline-flex items-center gap-2.5" aria-label="Pekko home">
          <LogoMark className="size-9" />
          <Wordmark />
        </Link>
        <nav className="hidden md:flex items-center gap-1 text-sm font-semibold" aria-label="Main">
          {NAV_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={cls(l.href)} aria-current={pathname === l.href ? "page" : undefined}>{l.label}</Link>
          ))}
        </nav>
        <div className="hidden md:flex items-center gap-2 text-sm font-semibold">
          <Link href="/login" className="rounded-lg px-3 py-2 hover:bg-black/5" data-testid="nav-login">Login</Link>
          <Link href="/signup" className="btn btn-primary" data-testid="nav-trial">Start Free Trial</Link>
        </div>
        <button type="button" className="md:hidden rounded-lg p-2 hover:bg-black/5" aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open} aria-controls="mobile-menu" onClick={() => setOpen((o) => !o)} data-testid="menu-toggle">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </div>
      {open ? (
        <nav id="mobile-menu" className="md:hidden border-t border-line bg-paper px-5 pb-5 pt-2 text-base font-semibold" aria-label="Mobile">
          <ul className="grid">
            {NAV_LINKS.map((l) => (
              <li key={l.href}><Link href={l.href} className="block py-3" onClick={() => setOpen(false)} aria-current={pathname === l.href ? "page" : undefined}>{l.label}</Link></li>
            ))}
            <li><Link href="/login" className="block py-3" onClick={() => setOpen(false)}>Login</Link></li>
          </ul>
          <Link href="/signup" className="btn btn-primary mt-2 w-full" onClick={() => setOpen(false)}>Start Free Trial</Link>
        </nav>
      ) : null}
    </header>
  );
}
