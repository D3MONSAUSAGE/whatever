"use client";
import { useT } from "@/lib/i18n/client";
import { LanguageSelectBase } from "@/components/i18n/language-select-base";

/** English / Español selector for pages that already translate in the browser (sign-in, account). See LanguageSelectBase. */
export function LanguageSelect(props: { className?: string; refresh?: boolean; compact?: boolean }) {
  const t = useT();
  return <LanguageSelectBase {...props} label={t("lang.label")} />;
}
