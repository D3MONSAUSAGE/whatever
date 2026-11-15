"use client";
import { useRouter } from "next/navigation";
import { useId } from "react";
import { useLocale } from "@/lib/i18n/client";
import { LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n/locales";

/**
 * English / Español selector. Labels are always shown in their own language.
 * `refresh` re-renders server components (public pages) in place; client state is kept.
 */
export function LanguageSelect({ className = "", refresh = true, compact = false }: { className?: string; refresh?: boolean; compact?: boolean }) {
  const { locale, setLocale, t } = useLocale();
  const router = useRouter();
  const id = useId();
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <label htmlFor={id} className={compact ? "sr-only" : "text-sm text-muted"}>{t("lang.label")}</label>
      <select
        id={id}
        data-testid="language-select"
        className="rounded-lg border border-line bg-paper px-2 py-1.5 text-sm font-semibold"
        value={locale}
        aria-label={compact ? t("lang.label") : undefined}
        onChange={(e) => {
          setLocale(e.target.value as Locale);
          if (refresh) router.refresh();
        }}
      >
        {LOCALES.map((l) => (
          <option key={l} value={l} lang={l}>{LOCALE_LABELS[l]}</option>
        ))}
      </select>
    </span>
  );
}
