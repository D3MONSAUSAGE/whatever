"use client";
import { usePathname, useRouter } from "next/navigation";
import { clearDeveloperAccess, useDeveloperAccess } from "@/lib/dev-access";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase-browser";
import { ToastProvider } from "@/components/toast";
import { AccountLocaleSync } from "@/components/i18n/account-locale-sync";
import { UploadProgress, UploadsProvider } from "@/components/uploads";
import { LogoMark, PRODUCT_NAME } from "@/components/brand";
import { isRecoveryUrl } from "@/components/auth-frame";
import { ContentNav } from "@/components/content-nav";
import { AccountNav } from "@/components/account-nav";
import { isAccountPath } from "@/lib/account-nav";
import { BillingChip, NotificationBell, NotificationsProvider, type NotificationsFixture } from "@/components/notifications";
import { clearSlideSrcCache, onDashboardAuthChange } from "@/lib/slide-src-cache";
import { clearLayoutStudioDraftsOnSignOut, shouldClearStudioDraftsOnAuthEvent } from "@/lib/layout-studio-draft";
import { cleanPath, isContentPath, isMainNavActive, MAIN_NAV } from "@/lib/content-nav";
import { StudioGuardedLink, StudioLeaveProvider, useStudioRequestLeave } from "@/components/studio-leave";
import {
  IconBell, IconBrush, IconCalendar, IconCard, IconChart, IconGear, IconGlobe, IconGrid, IconHelp, IconHome, IconImage, IconList, IconMore, IconSignOut, IconTv,
} from "@/components/icons";
import { useLocale, useT } from "@/lib/i18n/client";
import type { Locale } from "@/lib/i18n/locales";
import type { MessageKey } from "@/lib/i18n/index";

/**
 * Signed-in app shell (redesign phase 1): navy sidebar (icon rail on tablets and in the menu-board editor),
 * a top bar with the page name, billing chip, notification bell and account menu, and five phone tabs plus
 * "More". Every link goes through StudioGuardedLink, so an editor with unsaved changes still asks first.
 * The alert and billing banners that used to sit above every page now live in the notification center.
 */

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
const OVERVIEW = { href: "/dashboard", labelKey: "dash.nav.overview" as MessageKey, icon: IconHome };
/** Sidebar order: Overview, then the main sections. Account sits at the bottom with Developer. */
const SIDE_TOP = [OVERVIEW, ...NAV.filter((item) => item.href !== "/dashboard/account")];
const ACCOUNT = NAV.find((item) => item.href === "/dashboard/account")!;
/** Phone tabs: four sections plus More (Overview, Playlists, Account and the rest live in More). */
const PHONE_TABS = ["/dashboard/screens", "/dashboard/media/menus", "/dashboard/content", "/dashboard/schedule"].map((href) => NAV.find((item) => item.href === href)!);
const MORE_PATHS = ["/dashboard/playlists", "/dashboard/account", "/dashboard/settings", "/dashboard/billing", "/dashboard/alerts", "/dashboard/notifications", "/dashboard/analytics", "/developer"];

function isNotifications(path: string) {
  const p = cleanPath(path);
  return p.startsWith("/dashboard/alerts") || p.startsWith("/dashboard/notifications");
}
function isActive(href: string, path: string) {
  if (href === "/dashboard") return cleanPath(path) === "/dashboard";
  return isMainNavActive(href, path);
}
/** The phone "More" tab is current for the pages that live behind it. */
export function moreIsActive(path: string) {
  const p = cleanPath(path);
  return p === "/dashboard" || MORE_PATHS.some((m) => p === m || p.startsWith(`${m}/`));
}

export function DashboardShell({ children, preview = false, pathOverride, notifications }: { children: React.ReactNode; preview?: boolean; pathOverride?: string; notifications?: NotificationsFixture }) {
  const router = useRouter();
  const pathname = usePathname();
  const path = pathOverride ?? pathname;
  const [ready, setReady] = useState(preview);
  const [email, setEmail] = useState<string | null>(preview ? "owner@demo-cafe.example" : null);
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
        setEmail(data.session?.user?.email ?? null);
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
    // Don't wait on a stuck auth call.
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
  const showAccountNav = isAccountPath(path);
  const brandKit = path.startsWith("/dashboard/account/brand-kit");
  const activeItem = [OVERVIEW, ...NAV].find((item) => isActive(item.href, path));
  const current = brandKit ? t("dash.nav.brandKit") : isNotifications(path) ? t("dash.nav.notifications") : activeItem ? t(activeItem.labelKey) : PRODUCT_NAME;
  const sideLink = (item: { href: string; labelKey: MessageKey; icon: () => React.ReactElement }, testId?: string) => (
    <StudioGuardedLink key={item.href} href={item.href} aria-current={isActive(item.href, path) ? "page" : undefined} aria-label={t(item.labelKey)} title={t(item.labelKey)} className="ps-nav-link" data-testid={testId}>
      <item.icon />
      <span className="ps-nav-label">{t(item.labelKey)}</span>
    </StudioGuardedLink>
  );

  return (
    <StudioLeaveProvider>
    <ToastProvider>
    {preview ? null : <AccountLocaleSync />}
    <UploadsProvider>
    <NotificationsProvider preview={preview} fixture={notifications}>
    <div className="min-h-dvh md:flex">
      <nav aria-label={t("nav.main")} className="ps-side hidden md:flex">
        <StudioGuardedLink href="/dashboard" className="ps-brand" aria-label={PRODUCT_NAME}>
          <LogoMark className="size-8 shrink-0" />
          <span className="ps-nav-label">{PRODUCT_NAME}</span>
        </StudioGuardedLink>
        {SIDE_TOP.map((item) => sideLink(item))}
        <span className="flex-1" />
        {developer ? sideLink({ href: "/developer/analytics", labelKey: "dash.nav.developer", icon: IconChart }, "nav-developer") : null}
        {sideLink(ACCOUNT)}
      </nav>
      <div className="flex-1 min-w-0">
        <header className="ps-topbar">
          <StudioGuardedLink href="/dashboard" className="md:hidden shrink-0" aria-label={PRODUCT_NAME}>
            <LogoMark className="size-8" />
          </StudioGuardedLink>
          <span className="ps-title" data-testid="shell-title">{current}</span>
          <BillingChip />
          <NotificationBell />
          <AccountMenu email={email} onSignOut={signOut} />
        </header>
        {/* Standard pages sit in one centred column (max 1360px) inside the space next to the sidebar.
            The menu-board workspaces opt out via StudioStyles and use their own wider cap. */}
        <main className={`shell-main ${studio ? "studio-shell max-w-none px-0 pt-0 md:px-3 md:pt-3 pb-4" : "w-full max-w-[1360px] mx-auto px-4 pt-5 pb-28 md:px-8 md:pt-8 md:pb-12"}`}>
          <UploadProgress />
          {showContentNav ? <ContentNav pathOverride={pathOverride} /> : null}
          {showAccountNav ? <AccountNav path={path} /> : null}
          {children}
        </main>
      </div>
      {studio ? null : <PhoneTabs path={path} developer={developer} onSignOut={signOut} />}
    </div>
    </NotificationsProvider>
    </UploadsProvider>
    </ToastProvider>
    </StudioLeaveProvider>
  );
}

/* ---------------- Account menu ---------------- */

function useMenuKeys(open: boolean, close: (refocus?: boolean) => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    ref.current?.querySelector<HTMLElement>("[role^=menuitem]")?.focus();
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.parentElement?.contains(e.target as Node)) close(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, close]);
  const onKeyDown = (e: React.KeyboardEvent) => {
    const items = Array.from(ref.current?.querySelectorAll<HTMLElement>("[role^=menuitem]") ?? []);
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "Tab") close(false);
    else if (e.key === "ArrowDown") { e.preventDefault(); items[(i + 1) % items.length]?.focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
    else if (e.key === "Home") { e.preventDefault(); items[0]?.focus(); }
    else if (e.key === "End") { e.preventDefault(); items[items.length - 1]?.focus(); }
  };
  return { ref, onKeyDown };
}

function AccountMenu({ email, onSignOut }: { email: string | null; onSignOut: () => void | Promise<void> }) {
  const { t, locale, setLocale } = useLocale();
  const router = useRouter();
  const requestLeave = useStudioRequestLeave();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const close = useCallback((refocus = true) => { setOpen(false); if (refocus) button.current?.focus(); }, []);
  const keys = useMenuKeys(open, close);
  const initial = (email ?? "P").trim().charAt(0).toUpperCase() || "P";
  const switchTo = (next: Locale) => { setLocale(next); router.refresh(); close(); };
  const item = (href: string, label: string, icon: React.ReactNode) => (
    <StudioGuardedLink href={href} role="menuitem" tabIndex={-1} className="ps-menu-item" onClick={() => setOpen(false)}>{icon}{label}</StudioGuardedLink>
  );
  return (
    <div className="relative">
      <button ref={button} type="button" className="ps-avatar" aria-label={t("shell.accountMenu")} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined} data-testid="account-menu" onClick={() => (open ? close() : setOpen(true))}>
        {initial}
      </button>
      {open ? (
        <div id={menuId} ref={keys.ref} role="menu" aria-label={t("shell.accountMenu")} className="ps-menu" onKeyDown={keys.onKeyDown}>
          {email ? <p className="ps-menu-head" role="presentation">{email}</p> : null}
          {item("/dashboard/account", t("dash.nav.account"), <IconGear />)}
          {item("/dashboard/account/brand-kit", t("dash.nav.brandKit"), <IconBrush />)}
          {item("/dashboard/billing", t("shell.billing"), <IconCard />)}
          {item("/dashboard/notifications", t("dash.nav.notifications"), <IconBell />)}
          <div className="ps-menu-sep" role="separator" />
          <p className="ps-menu-label" role="presentation"><IconGlobe />{t("lang.label")}</p>
          <button type="button" role="menuitemradio" aria-checked={locale === "en"} tabIndex={-1} lang="en" className="ps-menu-item ps-menu-radio" onClick={() => switchTo("en")}>English</button>
          <button type="button" role="menuitemradio" aria-checked={locale === "es"} tabIndex={-1} lang="es" className="ps-menu-item ps-menu-radio" onClick={() => switchTo("es")}>Español</button>
          <div className="ps-menu-sep" role="separator" />
          {item("/support", t("shell.help"), <IconHelp />)}
          <button type="button" role="menuitem" tabIndex={-1} className="ps-menu-item" data-testid="sign-out" onClick={() => { setOpen(false); requestLeave(() => void onSignOut()); }}>
            <IconSignOut />{t("dash.signOut")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/* ---------------- Phone tabs and More sheet ---------------- */

function PhoneTabs({ path, developer, onSignOut }: { path: string; developer: boolean; onSignOut: () => void | Promise<void> }) {
  const t = useT();
  const requestLeave = useStudioRequestLeave();
  const [more, setMore] = useState(false);
  const moreButton = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const pathname = usePathname();
  // A tab in the sheet navigates; close the sheet when the page changes.
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) { setSeenPath(pathname); if (more) setMore(false); }

  useEffect(() => {
    if (!more) return;
    sheet.current?.querySelector<HTMLElement>("a, button")?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [more]);
  const close = () => { setMore(false); moreButton.current?.focus(); };
  const sheetLink = (href: string, labelKey: MessageKey, Icon: () => React.ReactElement) => (
    <StudioGuardedLink href={href} className="ps-menu-item" aria-current={isActive(href, path) || (href === "/dashboard/notifications" && isNotifications(path)) ? "page" : undefined} onClick={() => setMore(false)}>
      <Icon />{t(labelKey)}
    </StudioGuardedLink>
  );

  return (
    <>
      <nav aria-label={t("nav.mobile")} className="ps-mtabs md:hidden">
        {PHONE_TABS.map((item) => (
          <StudioGuardedLink key={item.href} href={item.href} aria-label={phoneAria(t(item.shortKey ?? item.labelKey), t(item.labelKey))} aria-current={isActive(item.href, path) ? "page" : undefined} className="ps-mtab">
            <item.icon />
            <span>{t(item.shortKey ?? item.labelKey)}</span>
          </StudioGuardedLink>
        ))}
        <button ref={moreButton} type="button" className="ps-mtab" aria-haspopup="dialog" aria-expanded={more} aria-current={moreIsActive(path) ? "page" : undefined} onClick={() => setMore(true)} data-testid="nav-more">
          <IconMore />
          <span>{t("dash.nav.more")}</span>
        </button>
      </nav>
      {more ? (
        <div className="ps-sheet-wrap md:hidden" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
          <div ref={sheet} className="ps-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={(e) => {
            if (e.key === "Escape") { e.preventDefault(); close(); }
            if (e.key === "Tab") {
              const f = Array.from(sheet.current?.querySelectorAll<HTMLElement>("a, button") ?? []);
              if (!f.length) return;
              if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
              else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
            }
          }}>
            <h2 id={titleId} className="ps-sheet-title">{t("shell.moreTitle")}</h2>
            {sheetLink("/dashboard", "dash.nav.overview", IconHome)}
            {sheetLink("/dashboard/playlists", "dash.nav.playlists", IconList)}
            {sheetLink("/dashboard/notifications", "dash.nav.notifications", IconBell)}
            {sheetLink("/dashboard/account", "dash.nav.account", IconGear)}
            {sheetLink("/dashboard/account/brand-kit", "dash.nav.brandKit", IconBrush)}
            {developer ? sheetLink("/developer/analytics", "dash.nav.developer", IconChart) : null}
            <div className="ps-menu-sep" role="separator" />
            <button type="button" className="ps-menu-item" onClick={() => { setMore(false); requestLeave(() => void onSignOut()); }}>
              <IconSignOut />{t("dash.signOut")}
            </button>
            <button type="button" className="btn btn-quiet w-full mt-1" onClick={close}>{t("shell.close")}</button>
          </div>
        </div>
      ) : null}
    </>
  );
}

