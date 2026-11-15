import { db } from "./supabase";
import type { Locale } from "@/lib/i18n/locales";

/**
 * I18N-4: language for Pekko's own emails and push text, from accounts.locale.
 * Only an exact "es" picks Spanish. NULL, "en", a missing column, or any read error means English,
 * so a failed lookup never blocks or delays a send, and never changes who gets what.
 */
export function notificationLocaleOf(value: unknown): Locale {
  return value === "es" ? "es" : "en";
}

export async function notificationLocale(accountId: string): Promise<Locale> {
  try {
    const { data, error } = await db().from("accounts").select("locale").eq("id", accountId).maybeSingle();
    if (error) return "en";
    return notificationLocaleOf((data as { locale?: unknown } | null)?.locale);
  } catch {
    return "en";
  }
}
