import Link from "next/link";
import { TRIAL } from "@/lib/plans";
import { HOME_FAQ_IDS } from "@/lib/marketing";
import type { SampleCopy } from "@/lib/marketing-samples";
import type { T } from "@/lib/i18n/index";
import { FaqList, PricingCards, SectionHeading, TrialCta } from "@/components/site/sections";
import { ArtworkSection, BrandSection, Examples, FeatureCards, Hero, MakeSection, Steps, VideoSection } from "@/components/site/marketing/showcase";

/**
 * The previous home page, kept unchanged as the planned rollback for the Option B home (components/site/
 * marketing/home-b.tsx). Served when HOME_VARIANT=classic (see lib/home-variant.ts).
 */
export function ClassicHome({ t, c, href }: { t: T; c: SampleCopy; href: (path: string) => string }) {
  return (
    <>
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
          <p className="mt-8 text-center text-sm text-muted"><Link href={href("/pricing")} className="underline font-semibold text-white">{t("home.fullPricing")}</Link></p>
        </div>
      </section>

      <section className="mk-section" aria-labelledby="faq-title" id="faq">
        <SectionHeading id="faq-title" eyebrow={t("home.faqEyebrow")} title={t("home.faqTitle")} />
        <FaqList only={HOME_FAQ_IDS} />
        <p className="mt-8 text-center text-sm text-muted"><Link href={href("/faq")} className="underline font-semibold text-white">{t("home.allQuestions")}</Link> · <Link href={href("/support")} className="underline font-semibold text-white">{t("common.support")}</Link> · <Link href={href("/contact")} className="underline font-semibold text-white">{t("footer.contact")}</Link></p>
      </section>

      <TrialCta />
    </>
  );
}
