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
import { ContentNav } from "@/components/content-nav";
import { clearSlideSrcCache, onDashboardAuthChange } from "@/lib/slide-src-cache";
import { isContentPath } from "@/lib/content-nav";
import { IconCalendar, IconGear, IconImage, IconList, IconTv } from "@/components/icons";

const NAV = [
  { href: "/dashboard/screens", label: "My Screens", icon: IconTv },
  { href: "/dashboard/content", label: "Content", icon: IconImage },
  { href: "/dashboard/playlists", label: "Playlists", icon: IconList },
  { href: "/dashboard/schedule", label: "Schedules", icon: IconCalendar },
  { href: "/dashboard/account", label: "Account", icon: IconGear },
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
    // Don't wait on a stuck auth call. The first click on Layout Studio was
    // easy to miss while a fixed panel sat above the header.
    clearSlideSrcCache();
    const done = getSupabase().auth.signOut({ scope: "local" }).catch(() => undefined);
    await Promise.race([done, new Promise((resolve) => setTimeout(resolve, 1200))]);
    location.assign("/login");
  }

  if (!ready) return <div className="min-h-dvh grid place-items-center text-muted">Loading…</div>;

  const studio = path.startsWith("/dashboard/media/layout-studio") || path.startsWith("/layout-studio");
  const showContentNav = isContentPath(path);
  const isActive = (href: string) => {
    if (href === "/dashboard/content") return path.startsWith("/dashboard/content") || path.startsWith("/dashboard/media");
    if (href === "/dashboard/account") return path.startsWith("/dashboard/account") || path.startsWith("/dashboard/settings") || path.startsWith("/dashboard/billing");
    return href === "/dashboard" ? path === href : path.startsWith(href);
  };
  const brandKit = path.startsWith("/dashboard/account/brand-kit");
  const current = brandKit ? "Brand Kit" : (NAV.find((item) => isActive(item.href))?.label ?? "Pekko");

  return (
    <ToastProvider>
    <UploadsProvider>
    <div className="min-h-dvh md:flex">
      <nav aria-label="Main" className="hidden md:flex md:flex-col md:w-60 md:shrink-0 md:sticky md:top-0 md:h-dvh md:overflow-y-auto md:border-r md:border-line md:bg-white md:px-4 md:py-6 md:gap-1">
        <Link href="/dashboard" className="px-1 mb-6" aria-label={PRODUCT_NAME}>
          <BrandLockup size="sm" />
        </Link>
        {NAV.map((item) => (
          <Link key={item.href} href={item.href} aria-current={isActive(item.href) && !(item.href === "/dashboard/account" && brandKit) ? "page" : undefined} className="nav-link">
            <span className="icon-tile size-8">
              <item.icon />
            </span>
            {item.label}
          </Link>
        ))}
        <Link
          href="/dashboard/account/brand-kit"
          aria-current={brandKit ? "page" : undefined}
          className="nav-link md:pl-8 text-[13px]"
        >
          Brand Kit
        </Link>
        <button type="button" onClick={signOut} className="nav-link mt-auto text-left">
          <span className="icon-tile size-8" aria-hidden="true">↩</span>
          Sign out
        </button>
      </nav>
      <div className="flex-1 min-w-0">
        <header className="md:hidden sticky top-0 z-50 flex items-center justify-between gap-3 border-b border-line bg-white/95 px-4 h-14 backdrop-blur">
          <Link href="/dashboard" className="min-w-0">
            <BrandLockup size="sm" markClassName="size-8" />
          </Link>
          <span className="flex items-center gap-3 shrink-0">
            <span className="text-sm text-muted">{current}</span>
            <button type="button" onClick={signOut} className="text-sm font-semibold text-primary underline underline-offset-4">Sign out</button>
          </span>
        </header>
        <main className={`shell-main max-w-6xl ${studio ? "studio-shell px-0 pt-3 md:px-8 md:pt-8 pb-4" : "px-4 pt-5 pb-28 md:px-8 md:pt-8 md:pb-12"}`}>
          <UploadProgress />
          {preview || studio ? null : <BillingBanner />}
          {preview || studio ? null : <AlertsBanner />}
          {showContentNav ? <ContentNav pathOverride={pathOverride} /> : null}
          {children}
        </main>
      </div>
      <nav aria-label="Mobile" className={`${studio ? "hidden" : "md:hidden"} fixed bottom-0 inset-x-0 z-40 grid grid-cols-5 border-t border-line bg-white shadow-[0_-6px_20px_rgb(11_18_32/0.06)] pb-[env(safe-area-inset-bottom)]`}>
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
