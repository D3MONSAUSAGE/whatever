"use client";
import { usePathname, useRouter } from "next/navigation";
import { clearDeveloperAccess, useDeveloperAccess } from "@/lib/dev-access";
import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase-browser";
import { ToastProvider } from "@/components/toast";
import { AccountLocaleSync } from "@/components/i18n/account-locale-sync";
import { UploadProgress, UploadsProvider } from "@/components/uploads";
import { BrandLockup, PRODUCT_NAME } from "@/components/brand";
import { AlertsBanner } from "@/components/alerts";
import { BillingBanner } from "@/components/billing-banner";
import { isRecoveryUrl } from "@/components/auth-frame";
import { ContentNav } from "@/components/content-nav";
import { clearSlideSrcCache, onDashboardAuthChange } from "@/lib/slide-src-cache";
import { clearLayoutStudioDraftsOnSignOut, shouldClearStudioDraftsOnAuthEvent } from "@/lib/layout-studio-draft";
import { isContentPath, isMainNavActive, MAIN_NAV } from "@/lib/content-nav";
import { StudioGuardedLink, StudioLeaveProvider, useStudioRequestLeave } from "@/components/studio-leave";
import { IconCalendar, IconGear, IconGrid, IconImage, IconList, IconTv } from "@/components/icons";
import { useT } from "@/lib/i18n/client";

const NAV_ICONS: Record<string, () => React.ReactElement> = {
  "/dashboard/screens": IconTv,
  "/dashboard/media/menus": IconGrid,
  "/dashboard/content": IconImage,
  "/dashboard/playlists": IconList,
  "/dashboard/schedule": IconCalendar,
  "/dashboard/account": IconGear,
};
/** Phone bar: when the short label differs, screen readers also hear the full name. */
export function phoneAria(short: string, full: string): string | undefined {
  return short !== full ? `${short} (${full})` : undefined;
}

const NAV = MAIN_NAV.map((item) => ({ ...item, icon: NAV_ICONS[item.href] ?? IconGrid }));

function SignOutButton({ onSignOut, className, children }: { onSignOut: () => void | Promise<void>; className?: string; children: React.ReactNode }) {
  const requestLeave = useStudioRequestLeave();
  return (
    <button type="button" className={className} onClick={() => requestLeave(() => void onSignOut())}>
      {children}
    </button>
  );
}

export function DashboardShell({ children, preview = false, pathOverride }: { children: React.ReactNode; preview?: boolean; pathOverride?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const path = pathOverride ?? pathname;
  const [ready, setReady] = useState(preview);
  const t = useT();
  // Developer-only link (developer_users, checked on the server). Customers never see it.
  const developer = useDeveloperAccess() && !preview;

  useEffect(() => {
    if (preview) return;
    if (isRecoveryUrl()) { location.replace(`/reset-password${location.search}${location.hash}`); return; }
    let sub: { unsubscribe: () => void } | null = null;
    try {
      // Return to the page after sign-in (e.g. /dashboard/billing opened from a phone browser).
      const back = `/login?next=${encodeURIComponent(location.pathname + location.search)}`;
      let lastUserId: string | null = null;
      getSupabase().auth.getSession().then(({ data }) => {
        lastUserId = data.session?.user?.id ?? null;
        if (data.session) setReady(true);
        else router.replace(back);
      });
      sub = getSupabase().auth.onAuthStateChange((event, session) => {
        onDashboardAuthChange();
        const nextUserId = session?.user?.id ?? null;
        if (shouldClearStudioDraftsOnAuthEvent(event, lastUserId, nextUserId)) {
          clearLayoutStudioDraftsOnSignOut();
        }
        lastUserId = nextUserId;
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
    clearLayoutStudioDraftsOnSignOut();
    clearDeveloperAccess();
    const done = getSupabase().auth.signOut({ scope: "local" }).catch(() => undefined);
    await Promise.race([done, new Promise((resolve) => setTimeout(resolve, 1200))]);
    location.assign("/login");
  }

  if (!ready) return <div className="min-h-dvh grid place-items-center text-muted">{t("common.loading")}</div>;

  const studio = path.startsWith("/dashboard/media/layout-studio") || path.startsWith("/layout-studio");
  const showContentNav = isContentPath(path);
  const isActive = (href: string) => isMainNavActive(href, path);
  const brandKit = path.startsWith("/dashboard/account/brand-kit");
  const activeItem = NAV.find((item) => isActive(item.href));
  const current = brandKit ? t("dash.nav.brandKit") : (activeItem ? t(activeItem.labelKey) : PRODUCT_NAME);

  return (
    <StudioLeaveProvider>
    <ToastProvider>
    {preview ? null : <AccountLocaleSync />}
    <UploadsProvider>
    <div className="min-h-dvh md:flex">
      <nav aria-label={t("nav.main")} className="hidden md:flex md:flex-col md:w-60 md:shrink-0 md:sticky md:top-0 md:h-dvh md:overflow-y-auto md:border-r md:border-line md:bg-white md:px-4 md:py-6 md:gap-1">
        <StudioGuardedLink href="/dashboard" className="px-1 mb-6" aria-label={PRODUCT_NAME}>
          <BrandLockup size="sm" />
        </StudioGuardedLink>
        {NAV.map((item) => (
          <StudioGuardedLink key={item.href} href={item.href} aria-current={isActive(item.href) && !(item.href === "/dashboard/account" && brandKit) ? "page" : undefined} className="nav-link">
            <span className="icon-tile size-8">
              <item.icon />
            </span>
            {t(item.labelKey)}
          </StudioGuardedLink>
        ))}
        {/* Brand Kit lives inside Account, so it is a sub-item of Account rather than a top-level section. */}
        <StudioGuardedLink
          href="/dashboard/account/brand-kit"
          aria-current={brandKit ? "page" : undefined}
          className="nav-link nav-sublink"
        >
          {t("dash.nav.brandKit")}
        </StudioGuardedLink>
        {developer ? (
          <StudioGuardedLink href="/developer/analytics" className="nav-link mt-auto" data-testid="nav-developer">
            <span className="icon-tile size-8" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19V5M4 19h16M8 15v-4M12 15V8M16 15v-6" /></svg>
            </span>
            {t("dash.nav.developer")}
          </StudioGuardedLink>
        ) : null}
        <SignOutButton onSignOut={signOut} className={`nav-link ${developer ? "" : "mt-auto"} text-left`}>
          <span className="icon-tile size-8" aria-hidden="true">↩</span>
          {t("dash.signOut")}
        </SignOutButton>
      </nav>
      <div className="flex-1 min-w-0">
        <header className="md:hidden sticky top-0 z-50 flex items-center justify-between gap-3 border-b border-line bg-white/95 px-4 h-14 backdrop-blur">
          <StudioGuardedLink href="/dashboard" className="min-w-0">
            <BrandLockup size="sm" markClassName="size-8" />
          </StudioGuardedLink>
          <span className="flex items-center gap-3 shrink-0">
            <span className="text-sm text-muted">{current}</span>
            <SignOutButton onSignOut={signOut} className="text-sm font-semibold text-primary underline underline-offset-4">{t("dash.signOut")}</SignOutButton>
          </span>
        </header>
        {/* Standard pages sit in one centred column (max 1360px) inside the space next to the sidebar.
            The menu-board workspaces opt out via StudioStyles and use their own wider cap. */}
        <main className={`shell-main ${studio ? "studio-shell max-w-none px-0 pt-0 md:px-3 md:pt-3 pb-4" : "w-full max-w-[1360px] mx-auto px-4 pt-5 pb-28 md:px-8 md:pt-8 md:pb-12"}`}>
          <UploadProgress />
          {preview || studio ? null : <BillingBanner />}
          {preview || studio ? null : <AlertsBanner />}
          {showContentNav ? <ContentNav pathOverride={pathOverride} /> : null}
          {children}
        </main>
      </div>
      <nav aria-label={t("nav.mobile")} className={`${studio ? "hidden" : "md:hidden"} fixed bottom-0 inset-x-0 z-40 grid grid-cols-6 border-t border-line bg-white shadow-[0_-6px_20px_rgb(11_18_32/0.06)] pb-[env(safe-area-inset-bottom)]`}>
        {NAV.map((item) => (
          <StudioGuardedLink key={item.href} href={item.href} aria-label={phoneAria(t(item.shortKey ?? item.labelKey), t(item.labelKey))} aria-current={isActive(item.href) ? "page" : undefined}
            className={`flex min-w-0 flex-col items-center justify-center gap-1 min-h-16 px-0.5 text-[10px] font-semibold leading-tight ${isActive(item.href) ? "text-primary" : "text-muted"}`}>
            <span className={`icon-tile size-7 rounded-lg ${isActive(item.href) ? "icon-tile-active" : ""}`}>
              <item.icon />
            </span>
            <span className="max-w-full truncate">{t(item.shortKey ?? item.labelKey)}</span>
          </StudioGuardedLink>
        ))}
      </nav>
    </div>
    </UploadsProvider>
    </ToastProvider>
    </StudioLeaveProvider>
  );
}
