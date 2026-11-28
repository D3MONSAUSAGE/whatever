import type { MessageKey } from "@/lib/i18n/index";

/** The shared site nav's links. A plain module (not "use client") so server components can read it too. */
export const NAV_LINKS: readonly { href: string; label: MessageKey }[] = [
  { href: "/", label: "nav.home" },
  { href: "/features", label: "nav.features" },
  { href: "/pricing", label: "nav.pricing" },
  { href: "/faq", label: "nav.faq" },
];

/** Every string SiteNav shows, translated on the server by PublicPage (so public pages don't ship the dictionaries). */
export const SITE_NAV_KEYS: readonly MessageKey[] = [
  ...NAV_LINKS.map((l) => l.label), "brand.homeLabel", "nav.main", "nav.login", "nav.startTrial", "nav.openMenu", "nav.closeMenu", "nav.mobile", "lang.label",
];
