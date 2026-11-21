import { db } from "./supabase";
import { requireAdmin } from "./auth";
import { localizeError, requestLocale } from "./error-codes";
import { rewriteAndroidStatusCopy } from "./android-status-copy";
import { isLocale, type Locale } from "@/lib/i18n/locales";
export type { Locale };
import { isMissingSchema } from "./schema";

/** The signed-in account's saved language (accounts.locale, 0028). Null without a valid session or column. */
export async function accountLocale(accountId: string): Promise<Locale | null> {
  try {
    const { data, error } = await db().from("accounts").select("locale").eq("id", accountId).maybeSingle();
    if (error) {
      if (!isMissingSchema(error)) console.info("account locale read failed");
      return null;
    }
    const value = (data as { locale?: unknown } | null)?.locale;
    return isLocale(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * Locale for entitlement warnings and status_detail.
 * Precedence: the account's saved locale, then Accept-Language, then English.
 * There is no locale query parameter; a `locale` request param is ignored.
 */
export async function entitlementsLocale(accountId: string, req: Request): Promise<Locale> {
  const saved = await accountLocale(accountId);
  if (saved) return saved;
  return requestLocale(req);
}

/** Locale for error text: the session's account locale; runs only when a route has already failed. */
export async function sessionLocale(req: Request): Promise<Locale | null> {
  if (!req.headers.get("authorization")) return null;
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return null;
  return accountLocale(admin.accountId);
}

/**
 * Wrap a route handler so error responses with a catalog `code` carry their message in the caller's
 * language (account locale, else Accept-Language). Success responses and English callers are untouched.
 * Android-app requests then get status-only wording for any warning or error sentence that would
 * steer the user to pay on the web; web responses stay byte-identical.
 */
// Returns the handler's own type so Next's route typing and the tests see the same signature.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withLocalizedErrors<H extends (req: Request, ...rest: any[]) => Promise<Response>>(handler: H): H {
  const wrapped = async (req: Request, ...rest: unknown[]): Promise<Response> =>
    rewriteAndroidStatusCopy(req, await localizeError(req, await handler(req, ...rest), sessionLocale));
  return wrapped as H;
}
