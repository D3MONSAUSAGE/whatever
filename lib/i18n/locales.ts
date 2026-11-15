/**
 * I18N-1: supported UI languages. English is the default for everyone; Spanish only when chosen.
 * Customer-entered content (menus, item names, prices, media/screen/playlist names) is never translated.
 */
export const LOCALES = ["en", "es"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
/** Mirrors the account preference for logged-out pages. Not httpOnly: the client sets it on switch. */
export const LOCALE_COOKIE = "pekko_locale";
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
export const LOCALE_LABELS: Record<Locale, string> = { en: "English", es: "Español" };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function toLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/**
 * Accept-Language → locale, used only for API error messages (clients send their chosen locale).
 * Not used to pick the UI language for first-time visitors (auto-detection is off).
 */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale {
  if (!header) return DEFAULT_LOCALE;
  const first = header.split(",")[0]?.trim().toLowerCase() ?? "";
  return first === "es" || first.startsWith("es-") ? "es" : DEFAULT_LOCALE;
}

/** Cookie string for document.cookie / Set-Cookie. */
export function localeCookie(locale: Locale): string {
  return `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=${LOCALE_COOKIE_MAX_AGE}; SameSite=Lax`;
}

export function readLocaleCookie(cookieHeader: string | null | undefined): Locale | null {
  const match = (cookieHeader ?? "").match(new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=([a-z]{2})`));
  return match && isLocale(match[1]) ? match[1] : null;
}
