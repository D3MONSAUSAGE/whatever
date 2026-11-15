"use client";

import Link from "next/link";
import { IconGear } from "@/components/icons";
import { PageHeader } from "@/components/ui";
import { useT } from "@/lib/i18n/client";
import { LanguageSelect } from "@/components/i18n/language-select";

const CARDS = [
  {
    title: "Settings",
    body: "Name, password, alerts, and signing out.",
    href: "/dashboard/settings",
    action: "Open settings",
  },
  {
    title: "Brand Kit",
    body: "Logo, main colour, and highlight colour for new menus and promotions.",
    href: "/dashboard/account/brand-kit",
    action: "Open Brand Kit",
  },
  {
    title: "Billing",
    body: "Your plan, invoices, and payment method.",
    href: "/dashboard/billing",
    action: "Open billing",
  },
  {
    title: "Support",
    body: "Get help from the support page.",
    href: "/support",
    action: "Contact support",
  },
] as const;

export default function AccountHub() {
  const t = useT();
  return (
    <section className="min-w-0 pb-28 lg:pb-0">
      <PageHeader title="Account" eyebrow="Pekko" lede="Settings, your brand, the plan you already have, and how to reach support." icon={<IconGear />} />
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 items-stretch">
        {CARDS.map((card) => (
          <li key={card.title} className="card flex flex-col p-5 min-h-[13.5rem]">
            <h2 className="font-semibold">{card.title}</h2>
            <p className="text-sm text-muted mt-1 flex-1">{card.body}</p>
            <Link href={card.href} className="btn btn-primary min-h-11 mt-auto w-full">{card.action}</Link>
          </li>
        ))}
        {/* I18N-1: the rest of Account is translated in I18N-2. Saved to the account by AccountLocaleSync. */}
        <li className="card flex flex-col p-5 min-h-[13.5rem]" data-testid="language-card">
          <h2 className="font-semibold">{t("lang.accountTitle")}</h2>
          <p className="text-sm text-muted mt-1 flex-1">{t("lang.accountBody")}</p>
          <LanguageSelect refresh={false} className="mt-auto" />
        </li>
      </ul>
    </section>
  );
}
