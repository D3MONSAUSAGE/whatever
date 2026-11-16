import type { Metadata } from "next";
import Link from "next/link";
import { PublicPage } from "@/components/public-page";
import { TRIAL } from "@/lib/plans";
import { HOME_FAQ_IDS } from "@/lib/marketing";
import { sampleCopy } from "@/lib/marketing-samples";
import { getLocale, getT } from "@/lib/i18n/server";
import { FaqList, PricingCards, SectionHeading, TrialCta } from "@/components/site/sections";
import { ArtworkSection, BrandSection, Examples, FeatureCards, Hero, MakeSection, Steps, VideoSection } from "@/components/site/marketing/showcase";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: t("home.metaTitle"),
    description: t("home.metaDescription", { days: TRIAL.days }),
    alternates: { canonical: "/" },
  };
}

// Signed-in visitors keep going straight to /dashboard, as before. The session lives in
// localStorage (supabase-js default key sb-<ref>-auth-token), so this runs before paint.
const SIGNED_IN_REDIRECT = `try{for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(k&&/^sb-.+-auth-token$/.test(k)){location.replace('/dashboard');break}}}catch(e){}`;

export default async function Home() {
  const t = await getT();
  const c = sampleCopy(await getLocale());
  return (
    <PublicPage bare theme="dark">
      <script dangerouslySetInnerHTML={{ __html: SIGNED_IN_REDIRECT }} />
      <Hero t={t} c={c} />
      <MakeSection t={t} c={c} />
      <Steps t={t} c={c} />
      <BrandSection t={t} c={c} />
      <VideoSection t={t} c={c} />
      <ArtworkSection t={t} c={c} />
      <Examples t={t} c={c} />
      <FeatureCards t={t} intro={t("home.featuresIntro")} />

      <section className="mk-section" aria-labelledby="plans" id="pricing">
        <div className="mx-auto max-w-5xl">
          <SectionHeading id="plans" eyebrow={t("home.pricingEyebrow")} title={t("home.pricingTitle")} intro={t("home.pricingIntro", { days: TRIAL.days, screens: TRIAL.screens })} />
          <PricingCards testPrefix="landing-plan" />
          <p className="mt-8 text-center text-sm text-muted"><Link href="/pricing" className="underline font-semibold text-white">{t("home.fullPricing")}</Link></p>
        </div>
      </section>

      <section className="mk-section" aria-labelledby="faq-title" id="faq">
        <SectionHeading id="faq-title" eyebrow={t("home.faqEyebrow")} title={t("home.faqTitle")} />
        <FaqList only={HOME_FAQ_IDS} />
        <p className="mt-8 text-center text-sm text-muted"><Link href="/faq" className="underline font-semibold text-white">{t("home.allQuestions")}</Link> · <Link href="/support" className="underline font-semibold text-white">{t("common.support")}</Link> · <Link href="/contact" className="underline font-semibold text-white">{t("footer.contact")}</Link></p>
      </section>

      <TrialCta />
    </PublicPage>
  );
}
