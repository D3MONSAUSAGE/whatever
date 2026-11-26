import Link from "next/link";
import { rich } from "@/components/i18n/rich";
import { getLocale, getT } from "@/lib/i18n/server";
import { marketingHref } from "@/lib/seo";
import { TRIAL } from "@/lib/plans";
import { FAQ_IDS, FAQ_VARS, FEATURE_IDS, faqKeys, featureKeys, SHOTS } from "@/lib/marketing";
import { ENGLISH_ONLY, type MessageKey } from "@/lib/i18n/index";
import { TrialDetails } from "@/components/site/sections";
import { ContactBlock } from "@/components/contact-block";
import { Arrow, SIGNUP_HREF } from "@/components/site/peek/shell";
import { PeekFinal, PeekPricingCards } from "@/components/site/peek/sections";
import { heroImage, heroSrcSet } from "@/lib/marketing-home";
import { designById } from "@/lib/menu-designs";

/**
 * Standalone Peek marketing pages. Same copy keys, prices, trial terms, FAQ answers, test ids and structured data as
 * the current /features, /pricing and /faq pages (app/<page>/page.tsx keeps rendering those when the variant is "b").
 */

async function PageHead({ eyebrow, title, lede, cta = true, secondary }: { eyebrow: string; title: string; lede: React.ReactNode; cta?: boolean; secondary?: React.ReactNode }) {
  const t = await getT();
  return (
    <section className="pkm-wrap">
      <div className="pkm-page-head">
        <p className="pkm-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="pkm-lede">{lede}</p>
        {cta ? (
          <div className="pkm-cta-zone">
            <Link href={SIGNUP_HREF} className="pkm-cta pkm-cta-block" data-testid="start-trial">{t("home2.cta")}<Arrow /></Link>
            <p className="pkm-trial">{t("site.trialNote", { days: TRIAL.days, screens: TRIAL.screens })}</p>
            {secondary}
          </div>
        ) : null}
      </div>
    </section>
  );
}

export async function PeekPricingPage({ canBuy }: { canBuy: boolean }) {
  const t = await getT();
  const locale = await getLocale();
  return (
    <>
      <PageHead eyebrow={t("home.pricingEyebrow")} title={t("pricing.title")} lede={t("pricing.lede")} />
      <section className="pkm-wrap" aria-labelledby="pkm-plans-title" style={{ marginTop: 8 }}>
        <h2 id="pkm-plans-title" className="sr-only">{t("pricing.plansLabel")}</h2>
        <PeekPricingCards canBuy={canBuy} />
        <TrialDetails />
        <p className="pkm-links">{rich(t("pricing.questions"), { link: (c) => <Link href={marketingHref("/faq", locale)} className="pkm-link">{c}</Link> })}</p>
      </section>
      <PeekFinal title={t("mk.cta.title")} body={t("mk.cta.body", { days: TRIAL.days, screens: TRIAL.screens })} />
    </>
  );
}

const englishOnly = (key: MessageKey) => ((ENGLISH_ONLY as readonly string[]).includes(key) ? "en" : undefined);
/** Billing answers carry lang="en" on English pages, exactly as FaqList. */
const BILLING_ANSWERS: readonly string[] = ["faq.trial.a", "faq.trialEnd.a", "faq.plans.a", "faq.cancel.a"];

export async function PeekFaqPage() {
  const t = await getT();
  const locale = await getLocale();
  return (
    <>
      <PageHead eyebrow={t("home.faqEyebrow")} title={t("faq.title")} cta={false}
        lede={rich(t("faq.lede"), { link: (c) => <Link href={marketingHref("/support", locale)} className="pkm-link">{c}</Link> })} />
      <section className="pkm-wrap" style={{ marginTop: 8 }}>
        <div className="pkm-faq" data-testid="faq-list" style={{ maxWidth: 860 }}>
          {FAQ_IDS.map((id, i) => {
            const k = faqKeys(id);
            return (
              <details key={id} className="pkm-card" data-testid={`faq-${id}`} open={i === 0}>
                <summary>{t(k.q)}</summary>
                <p lang={englishOnly(k.a) ?? (locale === "en" && BILLING_ANSWERS.includes(k.a) ? "en" : undefined)}>{t(k.a, FAQ_VARS)}</p>
              </details>
            );
          })}
        </div>
        <div style={{ maxWidth: 860 }}><ContactBlock /></div>
      </section>
      <PeekFinal title={t("mk.cta.title")} body={t("mk.cta.body", { days: TRIAL.days, screens: TRIAL.screens })} />
    </>
  );
}

/** One row per feature: the approved copy beside a real board or a real dashboard screenshot. */
export async function PeekFeaturesPage() {
  const t = await getT();
  const locale = await getLocale();
  const board = (id: string) => (
    <div className="pkm-bezel"><div className="pkm-screen">
      <img src={heroImage(id, 640)} srcSet={heroSrcSet(id)} sizes="(min-width: 1100px) 680px, 92vw" width={1280} height={720} loading="lazy" decoding="async" alt={t("home2.heroAlt", { name: designById(id)?.name[locale] ?? id })} />
    </div></div>
  );
  const shot = (s: (typeof SHOTS)[keyof typeof SHOTS]) => (
    <div className="pkm-shot"><img src={s.src} width={s.w} height={s.h} loading="lazy" decoding="async" alt={t(s.altKey)} /></div>
  );
  const rows: { title: MessageKey; body: MessageKey; visual: React.ReactNode }[] = [
    { title: "mk.fx.menuTitle", body: "mk.fx.menuBody", visual: board("modern-restaurant") },
    { title: "mk.fx.artTitle", body: "mk.fx.artBody", visual: shot(SHOTS.tvPromo) },
    { title: "features.row1Title", body: "features.row1Body", visual: shot(SHOTS.dashboard) },
    { title: "features.row2Title", body: "features.row2Body", visual: shot(SHOTS.media) },
    { title: "features.row3Title", body: "features.row3Body", visual: shot(SHOTS.playlists) },
    { title: "features.row4Title", body: "features.row4Body", visual: shot(SHOTS.schedule) },
    { title: "features.row5Title", body: "features.row5Body", visual: shot(SHOTS.displays) },
    { title: "features.row6Title", body: "features.row6Body", visual: board("smokehouse-bbq") },
  ];
  return (
    <>
      <PageHead eyebrow={t("home.featuresEyebrow")} title={t("features.title")} lede={t("features.lede")}
        secondary={<Link href={marketingHref("/pricing", locale)} className="pkm-link">{t("site.seePricing")} →</Link>} />
      <section className="pkm-wrap">
        <div className="pkm-rows">
          {rows.map((r) => (
            <div key={r.title} className="pkm-row">
              <div><h2>{t(r.title)}</h2><p>{t(r.body)}</p></div>
              {r.visual}
            </div>
          ))}
        </div>
        <p className="pkm-samples" style={{ marginTop: 28 }}>{t("mk.samplesNote")}</p>
      </section>
      <section className="pkm-wrap pkm-sec" aria-labelledby="pkm-all">
        <h2 id="pkm-all" className="pkm-h2">{t("features.allTitle")}</h2>
        <ul className="pkm-feats" data-testid="feature-grid">
          {FEATURE_IDS.map((id) => (
            <li key={id} className="pkm-card pkm-feat"><h3>{t(featureKeys(id).title)}</h3><p>{t(featureKeys(id).body)}</p></li>
          ))}
        </ul>
        <ul className="pkm-terms" style={{ gridTemplateColumns: "none" }}>
          <li className="pkm-check">{t("mk.hero.check1")}</li><li className="pkm-check">{t("mk.hero.check2")}</li><li className="pkm-check">{t("mk.hero.check3")}</li>
        </ul>
      </section>
      <PeekFinal title={t("mk.cta.title")} body={t("mk.cta.body", { days: TRIAL.days, screens: TRIAL.screens })} />
    </>
  );
}
