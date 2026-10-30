"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase-browser";
import { ToastProvider } from "@/components/toast";
import { UploadProgress, UploadsProvider } from "@/components/uploads";
import { BrandLockup } from "@/components/brand";
import { isRecoveryUrl } from "@/components/auth-frame";
import { IconCalendar, IconChart, IconGear, IconGrid, IconImage, IconList, IconTv } from "@/components/icons";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: IconGrid },
  { href: "/dashboard/media", label: "Media", icon: IconImage },
  { href: "/dashboard/displays", label: "Displays", icon: IconTv },
  { href: "/dashboard/playlists", label: "Playlists", icon: IconList },
  { href: "/dashboard/schedule", label: "Schedule", icon: IconCalendar },
  { href: "/dashboard/analytics", label: "Analytics", icon: IconChart },
  { href: "/dashboard/settings", label: "Settings", icon: IconGear },
];

export function DashboardShell({ children, preview = false, pathOverride }: { children: React.ReactNode; preview?: boolean; pathOverride?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const path = pathOverride ?? pathname;
  const [ready, setReady] = useState(preview);

  useEffect(() => {
    if (preview) return;
    if (isRecoveryUrl()) { location.replace(`/reset-password${location.search}${location.hash}`); return; }
    let sub: { unsubscribe: () => void } | null = null;
    try {
      getSupabase().auth.getSession().then(({ data }) => (data.session ? setReady(true) : router.replace("/login")));
      sub = getSupabase().auth.onAuthStateChange((event, session) => {
        if (event === "PASSWORD_RECOVERY") { router.replace("/reset-password"); return; }
        if (!session) router.replace("/login");
      }).data.subscription;
    } catch {
      router.replace("/login");
    }
    return () => sub?.unsubscribe();
  }, [preview, router]);

  if (!ready) return <div className="min-h-dvh grid place-items-center text-muted">Loading…</div>;

  const isActive = (href: string) => (href === "/dashboard" ? path === href : path.startsWith(href));
  const current = NAV.find((item) => isActive(item.href))?.label ?? "Seemple";

  return (
    <ToastProvider>
    <UploadsProvider>
    <div className="min-h-dvh md:flex">
      <nav aria-label="Main" className="hidden md:flex md:flex-col md:w-60 md:shrink-0 md:border-r md:border-line md:bg-white md:px-4 md:py-6 md:gap-1">
        <Link href="/dashboard" className="px-1 mb-6">
          <BrandLockup size="sm" />
        </Link>
        {NAV.map((item) => (
          <Link key={item.href} href={item.href} aria-current={isActive(item.href) ? "page" : undefined} className="nav-link">
            <span className="icon-tile size-8">
              <item.icon />
            </span>
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="flex-1 min-w-0">
        <header className="md:hidden sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-white/95 px-4 h-14 backdrop-blur">
          <Link href="/dashboard" className="min-w-0">
            <BrandLockup size="sm" markClassName="size-8" />
          </Link>
          <span className="text-sm text-muted shrink-0">{current}</span>
        </header>
        <main className="px-4 pt-5 pb-28 md:px-8 md:pt-8 md:pb-12 max-w-6xl">
          <UploadProgress />
          {children}
        </main>
      </div>
      <nav aria-label="Mobile" className="md:hidden fixed bottom-0 inset-x-0 z-40 grid grid-cols-7 border-t border-line bg-white shadow-[0_-6px_20px_rgb(11_18_32/0.06)] pb-[env(safe-area-inset-bottom)]">
        {NAV.map((item) => (
          <Link key={item.href} href={item.href} aria-current={isActive(item.href) ? "page" : undefined}
            className={`flex min-w-0 flex-col items-center justify-center gap-1 min-h-16 px-0.5 text-[10px] font-semibold leading-tight ${isActive(item.href) ? "text-primary" : "text-muted"}`}>
            <span className={`icon-tile size-7 rounded-lg ${isActive(item.href) ? "icon-tile-active" : ""}`}>
              <item.icon />
            </span>
            <span className="max-w-full truncate">{item.label}</span>
          </Link>
        ))}
      </nav>
    </div>
    </UploadsProvider>
    </ToastProvider>
  );
}
