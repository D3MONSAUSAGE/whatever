"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase-browser";
import { ToastProvider } from "@/components/toast";
import { UploadProgress, UploadsProvider } from "@/components/uploads";
import { BrandLockup, PRODUCT_NAME } from "@/components/brand";
import { AlertsBanner } from "@/components/alerts";
import { BillingBanner } from "@/components/billing-banner";
import { isRecoveryUrl } from "@/components/auth-frame";
import { clearSlideSrcCache, onDashboardAuthChange } from "@/lib/slide-src-cache";
import { IconCalendar, IconGear, IconImage, IconList, IconTv } from "@/components/icons";

const NAV = [
  { href: "/dashboard/screens", label: "My Screens", icon: IconTv },
  { href: "/dashboard/media", label: "Content", icon: IconImage },
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
    if (isRecoveryUrl()) { location.replace(`/reset-password${location.search}${location.hash}`); return; }
    let sub: { unsubscribe: () => void } | null = null;
    try {
      // Return to the page after sign-in (e.g. /dashboard/billing opened from a phone browser).
      const back = `/login?next=${encodeURIComponent(location.pathname + location.search)}`;
      getSupabase().auth.getSession().then(({ data }) => (data.session ? setReady(true) : router.replace(back)));
      sub = getSupabase().auth.onAuthStateChange((event, session) => {
        onDashboardAuthChange();
        if (event === "PASSWORD_RECOVERY") { router.replace("/reset-password"); return; }
        if (!session) router.replace("/login");
      }).data.subscription;
    } catch {
      router.replace("/login");
    }
    return () => sub?.unsubscribe();
  }, [preview, router]);

  async function signOut() {
    // This device only; "Sign out everywhere" stays in Settings.
    clearSlideSrcCache();
    try { await getSupabase().auth.signOut({ scope: "local" }); } catch { /* still leave the dashboard */ }
    location.assign("/login");
  }

  if (!ready) return <div className="min-h-dvh grid place-items-center text-muted">Loading…</div>;

  const isActive = (href: string) => (href === "/dashboard" ? path === href : path.startsWith(href));
  const current = NAV.find((item) => isActive(item.href))?.label ?? "Pekko";

  return (
    <ToastProvider>
    <UploadsProvider>
    <div className="min-h-dvh md:flex">
      <nav aria-label="Main" className="hidden md:flex md:flex-col md:w-60 md:shrink-0 md:sticky md:top-0 md:h-dvh md:overflow-y-auto md:border-r md:border-line md:bg-white md:px-4 md:py-6 md:gap-1">
        <Link href="/dashboard" className="px-1 mb-6" aria-label={PRODUCT_NAME}>
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
        <button type="button" onClick={signOut} className="nav-link mt-auto text-left">
          <span className="icon-tile size-8" aria-hidden="true">↩</span>
          Sign out
        </button>
      </nav>
      <div className="flex-1 min-w-0">
        <header className="md:hidden sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-white/95 px-4 h-14 backdrop-blur">
          <Link href="/dashboard" className="min-w-0">
            <BrandLockup size="sm" markClassName="size-8" />
          </Link>
          <span className="flex items-center gap-3 shrink-0">
            <span className="text-sm text-muted">{current}</span>
            <button type="button" onClick={signOut} className="text-sm font-semibold text-primary underline underline-offset-4">Sign out</button>
          </span>
        </header>
        <main className="px-4 pt-5 pb-28 md:px-8 md:pt-8 md:pb-12 max-w-6xl">
          <UploadProgress />
          {preview ? null : <BillingBanner />}
          {preview ? null : <AlertsBanner />}
          {children}
        </main>
      </div>
      <nav aria-label="Mobile" className="md:hidden fixed bottom-0 inset-x-0 z-40 grid grid-cols-5 border-t border-line bg-white shadow-[0_-6px_20px_rgb(11_18_32/0.06)] pb-[env(safe-area-inset-bottom)]">
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
