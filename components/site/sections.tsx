import Link from "next/link";
import { BillingDisclosure } from "@/components/billing-disclosure";
import { PLANS, TRIAL } from "@/lib/plans";
import { FAQ_IDS, FAQ_VARS, FEATURE_IDS, faqKeys, featureKeys, SHOTS, type FaqId } from "@/lib/marketing";
import { getLocale, getT } from "@/lib/i18n/server";
import { ENGLISH_ONLY, type T } from "@/lib/i18n/index";
import { marketingHref } from "@/lib/seo";

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
      {eyebrow ? <p className="mk-eyebrow">{eyebrow}</p> : null}
      <h2 id={id} className="mt-3 text-3xl md:text-[2.75rem] md:leading-[1.1] font-extrabold tracking-tight text-balance">{title}</h2>
      {intro ? <p className="mt-4 text-muted text-lg leading-relaxed text-pretty">{intro}</p> : null}
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
    <div className="mt-12 grid gap-5 md:grid-cols-3 md:items-stretch">
      {PLANS.map((p) => {
        const featured = p.id === "business";
        return (
          <article key={p.id} className={`card relative p-7 flex flex-col ${featured ? "ring-2 ring-primary md:-translate-y-2 shadow-[0_30px_80px_-20px_rgb(47_123_255/0.55)]" : ""}`}
            style={featured ? { background: "linear-gradient(180deg, rgb(47 123 255 / 0.22), rgb(255 255 255 / 0.03) 60%)" } : undefined} data-testid={`${testPrefix}-${p.id}`}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display font-bold text-xl">{p.name}</h3>
              {featured ? <span className="text-xs font-bold rounded-full bg-primary text-white px-2.5 py-1">{t("site.popular")}</span> : null}
            </div>
            <p className="mt-4"><span className="font-display text-5xl font-extrabold tracking-tight">${p.price}</span><span className="text-muted">{t("site.perMonth")}</span></p>
            <p className="mt-1 text-sm font-semibold text-primary">{p.screens === 1 ? t("site.oneScreen") : t("site.upToScreens", { screens: p.screens })}</p>
            <ul className="mt-5 text-sm grid gap-2 flex-1 text-muted">
              <li>{t("site.planFeature1")}</li>
              <li>{t("site.planFeature2")}</li>
              <li>{t("site.planFeature3")}</li>
            </ul>
            <Link href={SIGNUP_HREF} className={`btn mt-6 ${featured ? "btn-primary" : "btn-quiet"}`}>{t("site.startTrial")}</Link>
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
 * Trial and billing terms. Spanish visitors get the approved courtesy translation (TrialDetailsEs),
 * whose disclosure carries the "the English version governs" notice. English output is unchanged.
 */
export async function TrialDetails() {
  const locale = await getLocale();
  if (locale === "es") return <TrialDetailsEs />;
  const t = await getT();
  return (
    <div className="mt-8 card p-6 text-sm grid gap-2" data-testid="trial-details" lang="en">
      {locale !== "en" ? <p className="text-muted" lang={locale} data-testid="english-only-note">{t("common.englishOnlyNote")}</p> : null}
      <h3 className="font-semibold text-base">How the trial works</h3>
      <p>Your {TRIAL.days}-day trial starts when you create your account and includes every feature on up to {TRIAL.screens} screens, the full Multi-screen experience. We don&apos;t ask for a card.</p>
      <p>You can choose a plan during the trial without being charged that day, as long as at least 48 hours remain. Your card is saved and the first charge is on the original trial end date; the trial is not extended. If fewer than 48 hours remain, the first charge is due when you confirm.</p>
      <p>When the trial ends, your screens keep playing for 3 more days, but editing, publishing, and new pairings are locked. If you don&apos;t choose a plan, they pause after those 3 days. Your content and settings are kept, and choosing a plan turns them back on.</p>
      <p>Prices are in US dollars, billed monthly. Taxes may apply. These pages do not set a tax rate.</p>
      <BillingDisclosure />
    </div>
  );
}

/** Spanish courtesy translation of TrialDetails (locale "es" only). Days and screens come from the same constants. */
function TrialDetailsEs() {
  return (
    <div className="mt-8 card p-6 text-sm grid gap-2" data-testid="trial-details" lang="es">
      <h3 className="font-semibold text-base">Cómo funciona la prueba</h3>
      <p>Su prueba de {TRIAL.days} días comienza cuando crea su cuenta e incluye todas las funciones en hasta {TRIAL.screens} pantallas, la experiencia completa de Multi-screen. No le pedimos tarjeta.</p>
      <p>Puede elegir un plan durante la prueba sin que se le cobre ese día, siempre que queden al menos 48 horas. Se guarda su tarjeta y el primer cargo se realiza en la fecha original de fin de la prueba; la prueba no se extiende. Si quedan menos de 48 horas, el primer cargo vence cuando usted confirma.</p>
      <p>Cuando termina la prueba, sus pantallas siguen reproduciendo durante 3 días más, pero la edición, la publicación y las vinculaciones nuevas quedan bloqueadas. Si no selecciona un plan, se pausan después de esos 3 días. Su contenido y configuración se conservan, y al seleccionar un plan se vuelven a activar.</p>
      <p>Los precios están en dólares estadounidenses y se facturan mensualmente. Pueden aplicarse impuestos. Estas páginas no fijan una tasa de impuestos.</p>
      <BillingDisclosure locale="es" />
    </div>
  );
}

function englishOnly(key: Parameters<T>[0]) {
  return (ENGLISH_ONLY as readonly string[]).includes(key) ? "en" : undefined;
}

/** Billing answers carried lang="en" before the Spanish courtesy translation; English pages keep it so their HTML is unchanged. */
const BILLING_ANSWERS: readonly string[] = ["faq.trial.a", "faq.trialEnd.a", "faq.plans.a", "faq.cancel.a"];

export async function FaqList({ limit, only }: { limit?: number; only?: readonly FaqId[] }) {
  const t = await getT();
  const locale = await getLocale();
  const ids = only ?? (limit ? FAQ_IDS.slice(0, limit) : FAQ_IDS);
  return (
    <div className="mt-10 grid gap-3 max-w-3xl mx-auto" data-testid="faq-list">
      {ids.map((id) => {
        const k = faqKeys(id);
        return (
          <details key={id} className="card p-5 group" data-testid={`faq-${id}`}>
            <summary className="font-semibold cursor-pointer text-[1.05rem]">{t(k.q)}</summary>
            {/* Answers still listed in ENGLISH_ONLY are marked lang="en" (none since the approved courtesy translation). */}
            <p className="mt-2 text-sm leading-relaxed text-muted" lang={englishOnly(k.a) ?? (locale === "en" && BILLING_ANSWERS.includes(k.a) ? "en" : undefined)}>{t(k.a, FAQ_VARS)}</p>
          </details>
        );
      })}
    </div>
  );
}

export async function TrialCta() {
  const t = await getT();
  const locale = await getLocale();
  return (
    <section className="px-5 py-16 md:py-24" aria-labelledby="cta">
      <div className="relative mx-auto max-w-5xl overflow-hidden rounded-[32px] border border-white/15 p-10 md:p-16 text-center text-white"
        style={{ background: "radial-gradient(80% 120% at 50% 0%, #2f7bff 0%, #1236a8 45%, #071236 100%)" }}>
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-40" style={{ background: "radial-gradient(40% 60% at 15% 100%, rgb(61 214 255 / 0.6), transparent 70%)" }} />
        <h2 id="cta" className="relative text-3xl md:text-5xl font-extrabold tracking-tight text-balance">{t("mk.cta.title")}</h2>
        <p className="relative mt-4 text-lg text-white/85">{t("mk.cta.body", { days: TRIAL.days, screens: TRIAL.screens })}</p>
        <div className="relative mt-8 flex flex-wrap justify-center gap-3">
          <Link href={SIGNUP_HREF} className="btn text-base px-7 bg-white text-[#0b1a4a] hover:bg-[#eaf1ff] shadow-[0_12px_30px_rgb(0_0_0/0.3)]">{t("site.startTrial")}</Link>
          <Link href={marketingHref("/support", locale)} className="btn text-base px-7 bg-white/10 text-white hover:bg-white/20 border border-white/25">{t("site.getHelp")}</Link>
        </div>
      </div>
    </section>
  );
}
