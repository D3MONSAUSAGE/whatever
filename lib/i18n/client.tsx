"use client";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { makeT, type T } from "./index";
import { DEFAULT_LOCALE, isLocale, localeCookie, type Locale } from "./locales";

type Ctx = { locale: Locale; t: T; setLocale: (next: Locale) => void };

const LocaleContext = createContext<Ctx>({
  locale: DEFAULT_LOCALE,
  t: makeT(DEFAULT_LOCALE),
  setLocale: () => undefined,
});

/** Listeners run after a switch (e.g. save to the account, refresh server-rendered text). */
type Listener = (next: Locale) => void;
const listeners = new Set<Listener>();
export function onLocaleChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Current UI language for client code outside React (e.g. lib/api.ts sends it as Accept-Language). */
let current: Locale = DEFAULT_LOCALE;
export function currentLocale(): Locale {
  return current;
}

/**
 * Holds the UI language. Switching only changes React context and the cookie: no navigation and no
 * remount, so unsaved editor state and drafts stay as they are.
 */
export function LocaleProvider({ initial, children }: { initial: Locale; children: React.ReactNode }) {
  const [locale, setState] = useState<Locale>(initial);
  current = locale;
  const setLocale = useCallback((next: Locale) => {
    if (!isLocale(next)) return;
    current = next;
    document.cookie = localeCookie(next);
    document.documentElement.lang = next;
    setState(next);
    for (const fn of listeners) {
      try { fn(next); } catch { /* a listener must not block the switch */ }
    }
  }, []);
  const value = useMemo<Ctx>(() => ({ locale, t: makeT(locale), setLocale }), [locale, setLocale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  return useContext(LocaleContext);
}

export function useT(): T {
  return useContext(LocaleContext).t;
}
