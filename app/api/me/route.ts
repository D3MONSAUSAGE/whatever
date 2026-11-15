import { db } from "@/lib/server/supabase";
import { requireAdmin } from "@/lib/server/auth";
import { fail, json, readJson } from "@/lib/server/http";
import { isMissingSchema } from "@/lib/server/schema";
import { stripControls } from "@/lib/server/validate";
import { accountLocale, withLocalizedErrors } from "@/lib/server/locale";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/locales";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * { email, accountName, locale, localeChosen }. locale is "en" | "es" (I18N-1): the saved choice, else "en".
 * localeChosen is false until the owner picks a language (or before 0028).
 */
export const GET = withLocalizedErrors(async (req: Request) => {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const [{ data }, locale] = await Promise.all([
    db().from("accounts").select("name").eq("id", admin.accountId).single(),
    accountLocale(admin.accountId),
  ]);
  return json({ email: admin.email, accountName: data?.name ?? "", locale: locale ?? DEFAULT_LOCALE, localeChosen: locale !== null });
});

/**
 * Rename the business ({accountName}) and/or save the language ({locale: "en" | "es"}).
 * A rename also marks the onboarding "business" step done (when 0005 is applied).
 * A body without either field keeps the old reply ("Enter your business name.").
 */
export const PATCH = withLocalizedErrors(async (req: Request) => {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const body = await readJson(req);
  const hasLocale = body.locale !== undefined;
  const hasName = body.accountName !== undefined || !hasLocale;

  let name: string | null = null;
  if (hasName) {
    if (typeof body.accountName !== "string") return fail("Enter your business name.", 400);
    name = stripControls(body.accountName).trim();
    if (!name) return fail("Enter your business name.", 400);
    if (name.length > 80) return fail("Keep the business name under 80 characters.", 400);
  }
  if (hasLocale && !isLocale(body.locale)) return fail("Choose English or Español.", 400);

  if (hasLocale) {
    const saved = await db().from("accounts").update({ locale: body.locale }).eq("id", admin.accountId);
    if (saved.error) return fail("Couldn't save your language. Try again.", isMissingSchema(saved.error) ? 503 : 500);
  }
  if (name !== null) {
    const updated = await db().from("accounts").update({ name }).eq("id", admin.accountId);
    if (updated.error) return fail("Couldn't save the business name. Try again.", 500);
    const flag = await db().from("accounts").update({ business_confirmed_at: new Date().toISOString() }).eq("id", admin.accountId);
    if (flag.error && !isMissingSchema(flag.error)) return fail("Couldn't save the business name. Try again.", 500);
  }
  const current = name ?? (await db().from("accounts").select("name").eq("id", admin.accountId).single()).data?.name ?? "";
  const saved = hasLocale ? (body.locale as string) : await accountLocale(admin.accountId);
  return json({ email: admin.email, accountName: current, locale: saved ?? DEFAULT_LOCALE, localeChosen: saved !== null });
});
