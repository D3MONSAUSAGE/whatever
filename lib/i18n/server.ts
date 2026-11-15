import { cookies } from "next/headers";
import { makeT, type T } from "./index";
import { LOCALE_COOKIE, toLocale, type Locale } from "./locales";

/**
 * Locale for server-rendered pages: the pekko_locale cookie, else English.
 * Accept-Language is deliberately not used here (first visits stay English unless the visitor picks Español).
 */
export async function getLocale(): Promise<Locale> {
  const jar = await cookies();
  return toLocale(jar.get(LOCALE_COOKIE)?.value);
}

export async function getT(): Promise<T> {
  return makeT(await getLocale());
}
