"use client";
import { useEffect, useSyncExternalStore } from "react";
import type { Locale } from "@/lib/i18n/locales";
import { globalErrorLocale } from "@/lib/global-error-locale";
import { GlobalErrorView } from "@/components/global-error-view";
import { reloadOnceOnChunkErrorInBrowser } from "@/lib/chunk-reload";

const noSubscribe = () => () => {};
const clientLocale = (): Locale => globalErrorLocale(typeof document === "undefined" ? null : document.cookie);
const serverLocale = (): Locale => "en";

// Last-resort page when the root layout itself fails. Plain styles, no app CSS.
// R14-01: no LocaleProvider here, so the language comes from the pekko_locale cookie (English when unset).
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const locale = useSyncExternalStore(noSubscribe, clientLocale, serverLocale);
  // R14-01: a dashboard chunk-load failure gets one reload per build; once the flag is set this never reloads.
  useEffect(() => { reloadOnceOnChunkErrorInBrowser(error); }, [error]);
  return <GlobalErrorView locale={locale} digest={error.digest} reset={reset} />;
}
