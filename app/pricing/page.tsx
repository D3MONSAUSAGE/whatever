import type { Metadata } from "next";
import Link from "next/link";
import { PublicPage } from "@/components/public-page";
import { checkoutAvailable } from "@/lib/server/stripe";
import { getT } from "@/lib/i18n/server";
import { rich } from "@/components/i18n/rich";
import { PricingCards, SIGNUP_HREF, TrialCta, TrialDetails, TrialNote } from "@/components/site/sections";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("pricing.metaTitle"), description: t("pricing.metaDescription"), alternates: { canonical: "/pricing" } };
}

export default async function Pricing() {
  const t = await getT();
  return (
    <PublicPage bare>
      <section className="px-5 pt-14 text-center">
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">{t("pricing.title")}</h1>
        <p className="mt-3 text-muted text-lg">{t("pricing.lede")}</p>
        <Link href={SIGNUP_HREF} className="btn btn-primary mt-6 text-base px-6" data-testid="start-trial">{t("site.startTrial")}</Link>
        <TrialNote className="mt-3" />
      </section>
      <section className="px-5 pb-6" aria-label={t("pricing.plansLabel")}>
        <div className="mx-auto max-w-5xl">
          <PricingCards canBuy={checkoutAvailable()} />
          <TrialDetails />
          <p className="mt-4 text-center text-sm text-muted">{rich(t("pricing.questions"), { link: (c) => <Link href="/faq" className="underline font-semibold">{c}</Link> })}</p>
        </div>
      </section>
      <TrialCta />
    </PublicPage>
  );
}
