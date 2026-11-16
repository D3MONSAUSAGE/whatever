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
    <PublicPage bare theme="dark">
      <section className="px-5 pt-16 md:pt-24 text-center mk-rise">
        <p className="mk-eyebrow">{t("home.pricingEyebrow")}</p>
        <h1 className="mt-4 text-4xl md:text-6xl font-extrabold tracking-tight"><span className="mk-gradient-text">{t("pricing.title")}</span></h1>
        <p className="mt-4 text-muted text-lg md:text-xl">{t("pricing.lede")}</p>
        <Link href={SIGNUP_HREF} className="btn btn-primary mt-8 text-base px-7" data-testid="start-trial">{t("site.startTrial")}</Link>
        <TrialNote className="mt-4" />
      </section>
      <section className="px-5 pb-6 pt-4" aria-label={t("pricing.plansLabel")}>
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
