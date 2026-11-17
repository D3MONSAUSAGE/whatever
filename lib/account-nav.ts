import type { MessageKey } from "@/lib/i18n/index";
import { cleanPath } from "@/lib/content-nav";

export type AccountTabId = "overview" | "settings" | "brand" | "billing";

/** Account section tabs (redesign phase 4): one place for profile settings, Brand Kit and billing.
 *  The URLs are the existing pages; nothing moves. */
export const ACCOUNT_TABS: { id: AccountTabId; href: string; labelKey: MessageKey }[] = [
  { id: "overview", href: "/dashboard/account", labelKey: "anav.overview" },
  { id: "settings", href: "/dashboard/settings", labelKey: "acct.settings.title" },
  { id: "brand", href: "/dashboard/account/brand-kit", labelKey: "dash.nav.brandKit" },
  { id: "billing", href: "/dashboard/billing", labelKey: "shell.billing" },
];

export function activeAccountTab(rawPath: string): AccountTabId | null {
  const path = cleanPath(rawPath);
  if (path === "/dashboard/account") return "overview";
  if (path.startsWith("/dashboard/account/brand-kit")) return "brand";
  if (path === "/dashboard/settings" || path.startsWith("/dashboard/settings/")) return "settings";
  if (path === "/dashboard/billing" || path.startsWith("/dashboard/billing/")) return "billing";
  return null;
}

export function isAccountPath(path: string): boolean {
  return activeAccountTab(path) !== null;
}
