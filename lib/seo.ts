import type { Metadata } from "next";
import { publicAppOrigin } from "@/lib/public-url";
import type { Locale } from "@/lib/i18n/locales";

/**
 * Search-engine helpers for the public marketing site.
 *
 * Spanish marketing pages have real, crawlable URLs under /es (for example /es/pricing). middleware.ts
 * rewrites them to the same page with the Spanish locale, so Google can index both languages; the
 * pekko_locale cookie still works for visitors as before. Legal pages keep their own ?lang handling.
 */
export const SITE_NAME = "Pekko";

/** Marketing pages that exist in English and under /es. Order is the sitemap order. */
export const MARKETING_PATHS = ["/", "/features", "/pricing", "/faq", "/support", "/contact"] as const;
export type MarketingPath = (typeof MARKETING_PATHS)[number];

/** English-only public pages that are still worth indexing. */
export const ENGLISH_ONLY_PUBLIC_PATHS = ["/terms", "/privacy", "/account-deletion"] as const;

export const SPANISH_PREFIX = "/es";

export function siteOrigin(env: NodeJS.ProcessEnv = process.env): string {
  return publicAppOrigin(env);
}

export function isMarketingPath(path: string): path is MarketingPath {
  return (MARKETING_PATHS as readonly string[]).includes(path);
}

/** /es/pricing → { base: "/pricing", locale: "es" }. Anything else that is not a localized marketing URL → null. */
export function parseSpanishPath(pathname: string): { base: MarketingPath } | null {
  if (pathname === SPANISH_PREFIX || pathname === `${SPANISH_PREFIX}/`) return { base: "/" };
  if (!pathname.startsWith(`${SPANISH_PREFIX}/`)) return null;
  const base = pathname.slice(SPANISH_PREFIX.length).replace(/\/+$/, "") || "/";
  return isMarketingPath(base) && base !== "/" ? { base } : null;
}

/** The URL of a marketing page in a language: "/pricing" + es → "/es/pricing", "/" + es → "/es". */
export function localizedPath(base: MarketingPath, locale: Locale): string {
  if (locale !== "es") return base;
  return base === "/" ? SPANISH_PREFIX : `${SPANISH_PREFIX}${base}`;
}

/** Href for a link to a marketing page from a page in `locale`. Non-marketing hrefs are returned unchanged. */
export function marketingHref(href: string, locale: Locale): string {
  const [path, hash = ""] = href.split("#");
  if (!isMarketingPath(path)) return href;
  return localizedPath(path, locale) + (hash ? `#${hash}` : "");
}

/** The marketing page a browser path shows, in either language. */
export function marketingBaseOf(pathname: string): MarketingPath | null {
  const es = parseSpanishPath(pathname);
  if (es) return es.base;
  const trimmed = pathname.replace(/\/+$/, "") || "/";
  return isMarketingPath(trimmed) ? trimmed : null;
}

const OG_LOCALE: Record<Locale, string> = { en: "en_US", es: "es_US" };

/**
 * Title, description, canonical, hreflang alternates, Open Graph and Twitter tags for a marketing page.
 * Canonical is the page's own language URL; both languages and x-default (English) are listed as alternates.
 * The share image comes from app/opengraph-image.png.
 */
export function marketingMetadata({ path, locale, title, description }: {
  path: MarketingPath; locale: Locale; title: string; description: string;
}): Metadata {
  const url = localizedPath(path, locale);
  return {
    title: { absolute: title },
    description,
    alternates: {
      canonical: url,
      languages: { en: localizedPath(path, "en"), es: localizedPath(path, "es"), "x-default": localizedPath(path, "en") },
    },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title,
      description,
      url,
      locale: OG_LOCALE[locale],
      alternateLocale: [OG_LOCALE[locale === "es" ? "en" : "es"]],
    },
    twitter: { card: "summary_large_image", title, description },
  };
}
