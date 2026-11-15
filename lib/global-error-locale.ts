import { readLocaleCookie, type Locale } from "@/lib/i18n/locales";

/**
 * R14-01: app/global-error.tsx replaces the root layout, so LocaleProvider is gone.
 * Pick the language straight from the pekko_locale cookie (English when unset), same rule as the server.
 */
export function globalErrorLocale(cookie: string | null | undefined): Locale {
  return readLocaleCookie(cookie) ?? "en";
}
