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
  // RFC 9110: comma-separated ranges with optional ;q= weights (default 1, 0 = not acceptable).
  // Highest weight wins; ties keep header order. es-MX, es-419 etc. count as es; en-* as en.
  const ranges = header.split(",").map((part, index) => {
    const [tag = "", ...params] = part.split(";").map((x) => x.trim().toLowerCase());
    const qParam = params.find((x) => x.startsWith("q="));
    const q = qParam === undefined ? 1 : Number(qParam.slice(2));
    return { base: tag.split("-")[0] ?? "", q: Number.isFinite(q) ? q : 0, index };
  });
  ranges.sort((a, b) => b.q - a.q || a.index - b.index);
  for (const r of ranges) if (r.q > 0 && isLocale(r.base)) return r.base;
  return DEFAULT_LOCALE;
}

/** Secure on https (production); left off on http://localhost so local dev and tests still store it. */
function secureSuffix(): string {
  if (typeof location !== "undefined") return location.protocol === "https:" ? "; Secure" : "";
  return process.env.NODE_ENV === "production" ? "; Secure" : "";
}

/** Cookie string for document.cookie / Set-Cookie. */
export function localeCookie(locale: Locale): string {
  return `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=${LOCALE_COOKIE_MAX_AGE}; SameSite=Lax${secureSuffix()}`;
}

export function readLocaleCookie(cookieHeader: string | null | undefined): Locale | null {
  const match = (cookieHeader ?? "").match(new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=([a-z]{2})`));
  return match && isLocale(match[1]) ? match[1] : null;
}

/** I18N-1F-07: how long after sign-up the pre-sign-up language choice may still be adopted into accounts.locale. */
export const NEW_ACCOUNT_WINDOW_MS = 24 * 60 * 60 * 1000;

/** True when the account was created within NEW_ACCOUNT_WINDOW_MS. Unknown or invalid dates count as not new. */
export function isNewAccount(createdAt: string | null | undefined, now: number = Date.now()): boolean {
  if (!createdAt) return false;
  const at = Date.parse(createdAt);
  if (Number.isNaN(at)) return false;
  return now - at >= -60_000 && now - at < NEW_ACCOUNT_WINDOW_MS;
}
