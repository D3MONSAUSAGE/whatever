"use client";
import { usePathname, useRouter } from "next/navigation";
import { useId } from "react";
import { LocaleContext } from "@/lib/i18n/locale-context";
import { LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n/locales";
import { localizedPath, marketingBaseOf } from "@/lib/seo";
import { useContext } from "react";

/**
 * English / Español selector. Labels are always shown in their own language.
 * `refresh` re-renders server components (public pages) in place; client state is kept.
 * On a marketing page it instead loads the same page's URL in the new language (/pricing ↔ /es/pricing),
 * so the address bar, canonical URL and language always match. Signed-in pages keep the in-place switch.
 * `label` is the translated "Language" text, passed in so this file never loads the dictionaries.
 */
export function LanguageSelectBase({ label, className = "", refresh = true, compact = false }: { label: string; className?: string; refresh?: boolean; compact?: boolean }) {
  const { locale, setLocale } = useContext(LocaleContext);
  const router = useRouter();
  const pathname = usePathname();
  const id = useId();
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <label htmlFor={id} className={compact ? "sr-only" : "text-sm text-muted"}>{label}</label>
      <select
        id={id}
        data-testid="language-select"
        className="rounded-lg border border-line bg-paper px-2 py-1.5 text-sm font-semibold"
        value={locale}
        aria-label={compact ? label : undefined}
        onChange={(e) => {
          const next = e.target.value as Locale;
          setLocale(next);
          const base = marketingBaseOf(pathname ?? "");
          // Full load through the server (middleware saves the language and redirects to the clean URL), not
          // router.push: the client router may reuse a cached render of the other language.
          if (base) window.location.assign(`${localizedPath(base, next)}?lang=${next}${window.location.hash}`);
          else if (refresh) router.refresh();
        }}
      >
        {LOCALES.map((l) => (
          <option key={l} value={l} lang={l}>{LOCALE_LABELS[l]}</option>
        ))}
      </select>
    </span>
  );
}
