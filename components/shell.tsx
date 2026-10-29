"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase-browser";
import { ToastProvider } from "@/components/toast";
import { UploadProgress, UploadsProvider } from "@/components/uploads";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: IconGrid },
  { href: "/dashboard/media", label: "Media", icon: IconImage },
  { href: "/dashboard/displays", label: "Displays", icon: IconTv },
  { href: "/dashboard/playlists", label: "Playlists", icon: IconList },
  { href: "/dashboard/schedule", label: "Schedule", icon: IconCalendar },
  { href: "/dashboard/settings", label: "Settings", icon: IconGear },
];

export function DashboardShell({ children, preview = false, pathOverride }: { children: React.ReactNode; preview?: boolean; pathOverride?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const path = pathOverride ?? pathname;
  const [ready, setReady] = useState(preview);

  useEffect(() => {
    if (preview) return;
    let sub: { unsubscribe: () => void } | null = null;
    try {
      getSupabase().auth.getSession().then(({ data }) => (data.session ? setReady(true) : router.replace("/login")));
      sub = getSupabase().auth.onAuthStateChange((_event, session) => {
        if (!session) router.replace("/login");
      }).data.subscription;
    } catch {
      router.replace("/login");
    }
    return () => sub?.unsubscribe();
  }, [preview, router]);

  if (!ready) return <div className="min-h-dvh grid place-items-center text-muted">Loading…</div>;

  const isActive = (href: string) => (href === "/dashboard" ? path === href : path.startsWith(href));
  const current = NAV.find((item) => isActive(item.href))?.label ?? "Pantalla";

  return (
    <ToastProvider>
    <UploadsProvider>
    <div className="min-h-dvh md:flex">
      <nav aria-label="Main" className="hidden md:flex md:flex-col md:w-60 md:shrink-0 md:border-r md:border-line md:bg-white md:px-4 md:py-6 md:gap-1">
        <Link href="/dashboard" className="font-semibold text-lg px-3 mb-6 tracking-tight">Pantalla</Link>
        {NAV.map((item) => (
          <Link key={item.href} href={item.href} aria-current={isActive(item.href) ? "page" : undefined} className="nav-link">
            <item.icon />
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="flex-1 min-w-0">
        <header className="md:hidden sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-paper/95 px-4 h-14 backdrop-blur">
          <span className="font-semibold tracking-tight">Pantalla</span>
          <span className="text-sm text-muted">{current}</span>
        </header>
        <main className="px-4 pt-5 pb-28 md:px-8 md:pt-8 md:pb-12 max-w-6xl">
          <UploadProgress />
          {children}
        </main>
      </div>
      <nav aria-label="Mobile" className="md:hidden fixed bottom-0 inset-x-0 z-40 grid grid-cols-6 border-t border-line bg-white pb-[env(safe-area-inset-bottom)]">
        {NAV.map((item) => (
          <Link key={item.href} href={item.href} aria-current={isActive(item.href) ? "page" : undefined}
            className={`flex min-w-0 flex-col items-center justify-center gap-0.5 min-h-14 px-0.5 text-[10px] font-semibold leading-tight ${isActive(item.href) ? "text-ink" : "text-muted"}`}>
            <item.icon />
            <span className="max-w-full truncate">{item.label}</span>
          </Link>
        ))}
      </nav>
    </div>
    </UploadsProvider>
    </ToastProvider>
  );
}

function IconGrid() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </svg>
  );
}
function IconImage() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.4" fill="currentColor" stroke="none" />
      <path d="M7 16.5 11 12l2.5 2.5L16 12l3.5 4.5" />
    </svg>
  );
}
function IconTv() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M8 20h8" />
    </svg>
  );
}
function IconList() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M9 7h11M9 12h11M9 17h11" />
      <circle cx="5" cy="7" r="1" fill="currentColor" stroke="none" />
      <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="5" cy="17" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
function IconCalendar() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M8 3.5v3M16 3.5v3M3.5 10h17" />
    </svg>
  );
}
function IconGear() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2.2M12 18.3v2.2M4.8 6.6l1.6 1.6M17.6 15.8l1.6 1.6M3.5 12h2.2M18.3 12h2.2M4.8 17.4l1.6-1.6M17.6 8.2l1.6-1.6" />
    </svg>
  );
}
