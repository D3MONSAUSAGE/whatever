"use client";
import { useT } from "@/lib/i18n/client";
import { StudioGuardedLink } from "@/components/studio-leave";
import { ACCOUNT_TABS, activeAccountTab } from "@/lib/account-nav";

/** Account section tabs, styled like the Content tabs. Shown by the shell on every Account page. */
export function AccountNav({ path }: { path: string }) {
  const t = useT();
  const current = activeAccountTab(path);
  return (
    <nav aria-label={t("anav.aria")} className="content-nav" data-testid="account-nav">
      <ul className="content-nav-list">
        {ACCOUNT_TABS.map((tab) => (
          <li key={tab.id} className="shrink-0">
            <StudioGuardedLink href={tab.href} aria-current={tab.id === current ? "page" : undefined} className="content-nav-link">
              {t(tab.labelKey)}
            </StudioGuardedLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
