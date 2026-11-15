import { en, es, type MessageKey } from "@/lib/i18n/index";
import { localeFromAcceptLanguage, toLocale, type Locale } from "@/lib/i18n/locales";

/**
 * Stable machine codes for API errors (I18N-1). Every `fail()` response is `{error, code}`.
 * - Specific codes come from the exact English message (en.ts `apiError.<code>`), so existing
 *   `fail("…", status)` calls get a code without touching each route (or lib/server/auth.ts).
 * - Anything else gets a generic code by HTTP status. Only an exact catalog message is ever translated,
 *   so a generic code never replaces a more specific English message.
 * `error` stays the exact English text unless the request asks for Spanish (see localizeError).
 */
const PREFIX = "apiError.";

const BY_MESSAGE: ReadonlyMap<string, string> = new Map(
  (Object.keys(en) as MessageKey[])
    .filter((k) => k.startsWith(PREFIX))
    .map((k) => [en[k], k.slice(PREFIX.length)]),
);

export const GENERIC_BY_STATUS: Readonly<Record<number, string>> = {
  400: "validation_failed",
  401: "auth_required",
  403: "forbidden",
  404: "not_found",
  409: "conflict",
  413: "too_large",
  415: "unsupported_type",
  429: "rate_limited",
  503: "unavailable",
};

const CODES: ReadonlySet<string> = new Set(BY_MESSAGE.values());

/** Codes with a catalog message, so an exact match can be swapped for its translation. */
export function isSpecificCode(code: string): boolean {
  return CODES.has(code);
}

export function codeForMessage(message: string, status: number): string {
  const specific = BY_MESSAGE.get(message);
  if (specific) return specific;
  if (GENERIC_BY_STATUS[status]) return GENERIC_BY_STATUS[status];
  return status >= 500 ? "server_error" : "validation_failed";
}

/** All codes the API can return today, for the Android/web contract. */
export function errorCatalog(): { code: string; en: string; es: string; specific: boolean }[] {
  return (Object.keys(en) as MessageKey[])
    .filter((k) => k.startsWith(PREFIX))
    .map((k) => {
      const code = k.slice(PREFIX.length);
      return { code, en: en[k], es: es[k], specific: BY_MESSAGE.has(en[k]) };
    });
}

/** Message for a specific code in the given locale; null for generic or unknown codes. */
export function messageFor(code: string, englishMessage: string, locale: Locale): string | null {
  if (BY_MESSAGE.get(englishMessage) !== code) return null; // only swap the exact text we know
  const key = `${PREFIX}${code}` as MessageKey;
  return locale === "es" ? es[key] : en[key];
}

export function requestLocale(req: Request): Locale {
  return localeFromAcceptLanguage(req.headers.get("accept-language"));
}

export type LocaleLookup = (req: Request) => Promise<Locale | null>;

/**
 * Rewrites the `error` text of a JSON error response into the caller's language.
 * Locale: the signed-in account's saved locale when `accountLocale` resolves one, else Accept-Language.
 * Status, headers and `code` are unchanged; English requests get the response back untouched.
 */
export async function localizeError(req: Request, res: Response, accountLocale?: LocaleLookup): Promise<Response> {
  if (res.status < 400 || !(res.headers.get("content-type") || "").includes("application/json")) return res;
  let body: unknown;
  try { body = await res.clone().json(); } catch { return res; }
  if (!body || typeof body !== "object") return res;
  const { error, code } = body as { error?: unknown; code?: unknown };
  if (typeof error !== "string" || typeof code !== "string" || !isSpecificCode(code)) return res;
  let locale: Locale | null = null;
  if (accountLocale) {
    try { locale = await accountLocale(req); } catch { locale = null; }
  }
  locale = toLocale(locale ?? requestLocale(req));
  if (locale === "en") return res;
  const text = messageFor(code, error, locale);
  if (!text) return res;
  const headers = new Headers(res.headers);
  headers.delete("content-length");
  return new Response(JSON.stringify({ ...(body as object), error: text }), { status: res.status, headers });
}
