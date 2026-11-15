"use client";

import Link from "next/link";
import { IconGear } from "@/components/icons";
import { PageHeader } from "@/components/ui";
import { useT } from "@/lib/i18n/client";
import { LanguageSelect } from "@/components/i18n/language-select";

// I18N-2: copy lives in the dictionary (acct.<id>.title/body/action).
const CARDS = [
  { id: "settings", href: "/dashboard/settings" },
  { id: "brand", href: "/dashboard/account/brand-kit" },
  { id: "billing", href: "/dashboard/billing" },
  { id: "support", href: "/support" },
] as const;

export default function AccountHub() {
  const t = useT();
  return (
    <section className="min-w-0 pb-28 lg:pb-0">
      <PageHeader title={t("acct.title")} eyebrow="Pekko" lede={t("acct.lede")} icon={<IconGear />} />
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 items-stretch">
        {CARDS.map((card) => (
          <li key={card.id} className="card flex flex-col p-5 min-h-[13.5rem]">
            <h2 className="font-semibold">{t(`acct.${card.id}.title`)}</h2>
            <p className="text-sm text-muted mt-1 flex-1">{t(`acct.${card.id}.body`)}</p>
            <Link href={card.href} className="btn btn-primary min-h-11 mt-auto w-full">{t(`acct.${card.id}.action`)}</Link>
          </li>
        ))}
        {/* Saved to the account by AccountLocaleSync. */}
        <li className="card flex flex-col p-5 min-h-[13.5rem]" data-testid="language-card">
          <h2 className="font-semibold">{t("lang.accountTitle")}</h2>
          <p className="text-sm text-muted mt-1 flex-1">{t("lang.accountBody")}</p>
          <LanguageSelect refresh={false} className="mt-auto" />
        </li>
      </ul>
    </section>
  );
}
