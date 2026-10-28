"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase-browser";

const NAV = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/media", label: "Media" },
  { href: "/dashboard/displays", label: "Displays" },
  { href: "/dashboard/settings", label: "Settings" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let sub: { unsubscribe: () => void } | null = null;
    try {
      getSupabase().auth.getSession().then(({ data }) => (data.session ? setReady(true) : router.replace("/login")));
      sub = getSupabase().auth.onAuthStateChange((_e, s) => { if (!s) router.replace("/login"); }).data.subscription;
    } catch {
      router.replace("/login");
    }
    return () => sub?.unsubscribe();
  }, [router]);

  if (!ready) return <div className="min-h-dvh grid place-items-center text-muted">Loading…</div>;

  const isActive = (href: string) => (href === "/dashboard" ? path === href : path.startsWith(href));
  return (
    <div className="min-h-dvh md:flex">
      <nav className="hidden md:flex md:flex-col md:w-56 md:shrink-0 md:border-r md:border-line md:p-5 md:gap-1">
        <span className="font-semibold text-lg mb-6 px-3">Pantalla</span>
        {NAV.map((n) => (
          <Link key={n.href} href={n.href}
            className={`rounded-lg px-3 py-2 ${isActive(n.href) ? "bg-ink text-white" : "hover:bg-line/60"}`}>{n.label}</Link>
        ))}
      </nav>
      <main className="flex-1 px-4 pt-6 pb-28 md:px-10 md:pb-10 max-w-5xl">{children}</main>
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 grid grid-cols-4 border-t border-line bg-white pb-[env(safe-area-inset-bottom)]">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href}
            className={`py-4 text-center text-sm font-medium ${isActive(n.href) ? "text-ink" : "text-muted"}`}>
            <span className={isActive(n.href) ? "border-b-2 border-ink pb-1" : ""}>{n.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
