"use client";

import Link from "next/link";
import { IconGear } from "@/components/icons";
import { PageHeader } from "@/components/ui";
import { useT } from "@/lib/i18n/client";
import { LanguageSelect } from "@/components/i18n/language-select";

// I18N-2: copy lives in the dictionary (acct.<id>.title/body/action).
// Parity Phase 1 (t353u): Analytics and Alerts had no way in from navigation, so they are listed here.
const CARDS = [
  { id: "settings", href: "/dashboard/settings" },
  { id: "brand", href: "/dashboard/account/brand-kit" },
  { id: "billing", href: "/dashboard/billing" },
  { id: "analytics", href: "/dashboard/analytics" },
  { id: "alerts", href: "/dashboard/alerts" },
  { id: "support", href: "/support" },
] as const;

export default function AccountHub() {
  const t = useT();
  return (
    <section className="min-w-0 pb-28 lg:pb-0">
      <PageHeader title={t("acct.title")} eyebrow="Pekko" lede={t("acct.lede")} icon={<IconGear />} />
      {/* Phone: each destination is one compact row and the whole row is the link (Parity Phase 1, W3).
          sm and up: the card grid with its button. One LanguageSelect either way. */}
      <ul className="grid gap-2 sm:gap-3 sm:grid-cols-2 lg:grid-cols-4 items-stretch" data-testid="account-hub">
        {CARDS.map((card) => (
          <li key={card.id} className="card relative min-w-0 flex items-center gap-3 px-4 py-3 sm:flex-col sm:items-stretch sm:p-5 sm:min-h-[11rem]">
            <div className="min-w-0 flex-1 sm:flex sm:flex-col">
              <h2 className="font-semibold">{t(`acct.${card.id}.title`)}</h2>
              <p className="text-sm text-muted mt-0.5 truncate sm:whitespace-normal sm:mt-1 sm:flex-1">{t(`acct.${card.id}.body`)}</p>
            </div>
            <span aria-hidden="true" className="sm:hidden text-muted text-xl leading-none">›</span>
            <Link href={card.href} className="sm:hidden absolute inset-0 rounded-[inherit]" aria-label={t(`acct.${card.id}.title`)} />
            <div className="hidden sm:block mt-auto">
              <Link href={card.href} className="btn btn-primary min-h-11 mt-auto w-full">{t(`acct.${card.id}.action`)}</Link>
            </div>
          </li>
        ))}
        {/* Saved to the account by AccountLocaleSync. */}
        <li className="card min-w-0 flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:flex-col sm:flex-nowrap sm:items-stretch sm:p-5 sm:min-h-[11rem]" data-testid="language-card">
          <div className="hidden sm:flex sm:flex-col sm:flex-1 min-w-0">
            <h2 className="font-semibold">{t("lang.accountTitle")}</h2>
            <p className="hidden sm:block text-sm text-muted mt-1 flex-1">{t("lang.accountBody")}</p>
          </div>
          <LanguageSelect refresh={false} className="sm:mt-auto" />
        </li>
      </ul>
    </section>
  );
}
