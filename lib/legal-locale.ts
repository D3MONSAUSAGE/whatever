import { getLocale } from "@/lib/i18n/server";

export type LegalParams = Promise<Record<string, string | string[] | undefined>>;
export type LegalSearch = LegalParams | undefined;

/** The Spanish courtesy translation shows only for locale "es"; ?lang=en always shows the governing English original. */
export async function showSpanishLegal(searchParams?: LegalSearch): Promise<boolean> {
  if ((await getLocale()) !== "es") return false;
  const params = searchParams ? await searchParams : {};
  return params.lang !== "en";
}
