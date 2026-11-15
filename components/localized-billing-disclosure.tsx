"use client";
import { BillingDisclosure } from "@/components/billing-disclosure";
import { useLocale } from "@/lib/i18n/client";

/** The billing disclosure in the dashboard language (Spanish courtesy translation for "es"). */
export function LocalizedBillingDisclosure({ className }: { className?: string }) {
  const { locale } = useLocale();
  return <BillingDisclosure className={className} locale={locale} />;
}
