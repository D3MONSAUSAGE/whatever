"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { useT } from "@/lib/i18n/client";
import { LanguageSelect } from "@/components/i18n/language-select";
import { useDeveloperAccess } from "@/lib/dev-access";
import { useApi } from "@/lib/api";
import { BillingStatusBanner, type EntitlementsStatus } from "@/components/billing-status-banner";
import { usePeekWeb } from "@/lib/peek-flag";
import { btnClass } from "@/components/peek/ui";
import { IconBrush, IconCard, IconGear, IconHelp } from "@/components/icons";

// Peek web (flag only): decorative icon tile per card.
const PEEK_ICONS = { settings: <IconGear />, brand: <IconBrush />, billing: <IconCard />, support: <IconHelp /> } as const;

// I18N-2: copy lives in the dictionary (acct.<id>.title/body/action).
const CARDS = [
  { id: "settings", href: "/dashboard/settings" },
  { id: "brand", href: "/dashboard/account/brand-kit" },
  { id: "billing", href: "/dashboard/billing" },
  { id: "support", href: "/support" },
] as const;

export default function AccountHub() {
  const t = useT();
  const developer = useDeveloperAccess();
  const ent = useApi<EntitlementsStatus>("/api/entitlements");
  const peek = usePeekWeb();
  return (
    <section className={`min-w-0 pb-28 lg:pb-0${peek ? " acct-hub" : ""}`}>
      <PageHeader title={t("acct.title")} lede={t("acct.lede")} />
      {ent.data ? <div className="mb-4"><BillingStatusBanner entitlements={ent.data} variant="card" /></div> : null}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 items-stretch">
        {CARDS.map((card) => (
          <li key={card.id} className="card ps-hub-card flex flex-col p-5">
            {peek ? <span className="acct-icon" aria-hidden="true">{PEEK_ICONS[card.id]}</span> : null}
            <h2 className="font-display font-bold text-ink">{t(`acct.${card.id}.title`)}</h2>
            <p className="text-sm text-muted mt-1 flex-1">{t(`acct.${card.id}.body`)}</p>
            <Link href={card.href} className={peek ? btnClass("tint", "default", "min-h-11 mt-4 w-full") : "btn btn-quiet min-h-11 mt-4 w-full"}>{t(`acct.${card.id}.action`)}</Link>
          </li>
        ))}
        {/* Saved to the account by AccountLocaleSync. */}
        <li className="card ps-hub-card flex flex-col p-5" data-testid="language-card">
          <h2 className="font-display font-bold text-ink">{t("lang.accountTitle")}</h2>
          <p className="text-sm text-muted mt-1 flex-1">{t("lang.accountBody")}</p>
          <LanguageSelect refresh={false} className="mt-auto" />
        </li>
        {/* Developer-only (developer_users, checked on the server). Phones only: desktop has it in the sidebar. */}
        {developer ? (
          <li className="card ps-hub-card flex flex-col p-5 md:hidden" data-testid="developer-card">
            <h2 className="font-display font-bold text-ink">{t("acct.developer.title")}</h2>
            <p className="text-sm text-muted mt-1 flex-1">{t("acct.developer.body")}</p>
            <Link href="/developer/analytics" className="btn btn-quiet min-h-11 mt-4 w-full">{t("acct.developer.action")}</Link>
          </li>
        ) : null}
      </ul>
    </section>
  );
}
