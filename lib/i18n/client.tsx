"use client";
import { useContext, useMemo } from "react";
import { makeT, type T } from "./index";
import { LocaleContext } from "./locale-context";
import type { Locale } from "./locales";

// The provider and the language code live in ./locale-context (no dictionaries), so public pages that only render
// server-side text don't download both message tables. Everything that translates in the browser imports from here.
export { LocaleProvider, currentLocale, onLocaleChange, useLocaleCode } from "./locale-context";

export function useLocale(): { locale: Locale; t: T; setLocale: (next: Locale) => void } {
  const { locale, setLocale } = useContext(LocaleContext);
  const t = useMemo(() => makeT(locale), [locale]);
  return { locale, t, setLocale };
}

export function useT(): T {
  return useLocale().t;
}
