import Link from "next/link";
import { BillingDisclosure } from "@/components/billing-disclosure";
import { PLANS, TRIAL } from "@/lib/plans";
import { FAQ_IDS, FAQ_VARS, FEATURE_IDS, faqKeys, featureKeys, SHOTS } from "@/lib/marketing";
import { getLocale, getT } from "@/lib/i18n/server";
import { ENGLISH_ONLY, type T } from "@/lib/i18n/index";

export const SIGNUP_HREF = "/signup";
type Shot = (typeof SHOTS)[keyof typeof SHOTS];

export async function Screenshot({ shot, className = "", priority }: { shot: Shot; className?: string; priority?: boolean }) {
  const t = await getT();
  return (
    <img src={shot.src} alt={t(shot.altKey)} width={shot.w} height={shot.h} loading={priority ? "eager" : "lazy"} decoding="async"
      className={`w-full h-auto rounded-xl border border-line shadow-lg bg-white ${className}`} />
  );
}

export function SectionHeading({ id, eyebrow, title, intro }: { id: string; eyebrow?: string; title: string; intro?: string }) {
  return (
    <div className="text-center max-w-2xl mx-auto">
      {eyebrow ? <p className="text-sm font-semibold uppercase tracking-wider text-primary">{eyebrow}</p> : null}
      <h2 id={id} className="mt-2 text-3xl md:text-4xl font-extrabold tracking-tight">{title}</h2>
      {intro ? <p className="mt-3 text-muted text-lg">{intro}</p> : null}
    </div>
  );
}

export async function TrialNote({ className = "" }: { className?: string }) {
  const t = await getT();
  return <p className={`text-sm text-muted ${className}`}>{t("site.trialNote", { days: TRIAL.days, screens: TRIAL.screens })}</p>;
}

export async function FeatureGrid() {
  const t = await getT();
  return (
    <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="feature-grid">
      {FEATURE_IDS.map((id) => (
        <li key={id} className="card p-6">
          <h3 className="font-semibold text-lg">{t(featureKeys(id).title)}</h3>
          <p className="mt-2 text-sm text-muted leading-relaxed">{t(featureKeys(id).body)}</p>
        </li>
      ))}
    </ul>
  );
}

/** Plan names and prices are never translated (prices are USD, set in lib/plans.ts). */
export async function PricingCards({ testPrefix = "plan", canBuy }: { testPrefix?: string; canBuy?: boolean }) {
  const t = await getT();
  return (
    <div className="mt-10 grid gap-4 md:grid-cols-3">
      {PLANS.map((p) => {
        const featured = p.id === "business";
        return (
          <article key={p.id} className={`card p-6 flex flex-col ${featured ? "ring-2 ring-primary" : ""}`} data-testid={`${testPrefix}-${p.id}`}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold text-lg">{p.name}</h3>
              {featured ? <span className="text-xs font-semibold rounded-full bg-primary text-white px-2 py-0.5">{t("site.popular")}</span> : null}
            </div>
            <p className="mt-2"><span className="text-4xl font-extrabold">${p.price}</span><span className="text-muted">{t("site.perMonth")}</span></p>
            <p className="mt-1 text-sm text-muted">{p.screens === 1 ? t("site.oneScreen") : t("site.upToScreens", { screens: p.screens })}</p>
            <ul className="mt-4 text-sm grid gap-1.5 flex-1">
              <li>{t("site.planFeature1")}</li>
              <li>{t("site.planFeature2")}</li>
              <li>{t("site.planFeature3")}</li>
            </ul>
            <Link href={SIGNUP_HREF} className={`btn mt-5 ${featured ? "btn-primary" : "btn-quiet"}`}>{t("site.startTrial")}</Link>
            {canBuy === undefined ? null : canBuy ? (
              <Link href="/dashboard/billing" className="btn btn-quiet mt-2" data-testid={`buy-${p.id}`}>{t("site.choosePlan", { plan: p.name })}</Link>
            ) : (
              <p className="mt-2 text-center text-sm text-muted" data-testid={`buy-${p.id}`}>{t("site.checkoutSoon")}</p>
            )}
          </article>
        );
      })}
    </div>
  );
}

/**
 * Trial and billing terms. English only until the reviewed Spanish courtesy translation lands
 * (Francisco t278: batch (c)/(d), with "the English version governs"). Spanish visitors see a note.
 */
export async function TrialDetails() {
  const locale = await getLocale();
  const t = await getT();
  return (
    <div className="mt-8 card p-6 text-sm grid gap-2" data-testid="trial-details" lang="en">
      {locale !== "en" ? <p className="text-muted" lang={locale} data-testid="english-only-note">{t("common.englishOnlyNote")}</p> : null}
      <h3 className="font-semibold text-base">How the trial works</h3>
      <p>Your {TRIAL.days}-day trial starts when you create your account and includes every feature on up to {TRIAL.screens} screens, the full Multi-screen experience. We don&apos;t ask for a card.</p>
      <p>When the trial ends, your screens keep playing for 3 more days. If you don&apos;t choose a plan, they pause. Your content and settings are kept, and choosing a plan turns them back on.</p>
      <p>Prices are in US dollars, billed monthly. Taxes may apply. These pages do not set a tax rate.</p>
      <BillingDisclosure />
    </div>
  );
}

function englishOnly(key: Parameters<T>[0]) {
  return (ENGLISH_ONLY as readonly string[]).includes(key) ? "en" : undefined;
}

export async function FaqList({ limit }: { limit?: number }) {
  const t = await getT();
  const ids = limit ? FAQ_IDS.slice(0, limit) : FAQ_IDS;
  return (
    <div className="mt-10 grid gap-3 max-w-3xl mx-auto" data-testid="faq-list">
      {ids.map((id) => {
        const k = faqKeys(id);
        return (
          <details key={id} className="card p-5 group" lang={englishOnly(k.a)}>
            <summary className="font-semibold cursor-pointer">{t(k.q)}</summary>
            <p className="mt-2 text-sm leading-relaxed text-muted">{t(k.a, FAQ_VARS)}</p>
          </details>
        );
      })}
    </div>
  );
}

export async function TrialCta() {
  const t = await getT();
  return (
    <section className="px-5 py-16" aria-labelledby="cta">
      <div className="mx-auto max-w-4xl rounded-3xl bg-ink text-white p-10 text-center">
        <h2 id="cta" className="text-3xl font-extrabold tracking-tight">{t("site.ctaTitle", { days: TRIAL.days })}</h2>
        <p className="mt-3 text-white/80">{t("site.ctaBody", { screens: TRIAL.screens })}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href={SIGNUP_HREF} className="btn btn-primary text-base px-6">{t("site.startTrial")}</Link>
          <Link href="/support" className="btn text-base px-6 bg-white/10 text-white hover:bg-white/20">{t("site.getHelp")}</Link>
        </div>
      </div>
    </section>
  );
}
