import Link from "next/link";
import { preload } from "react-dom";
import { rich } from "@/components/i18n/rich";
import { PricingCards, SIGNUP_HREF } from "@/components/site/sections";
import { HeroSwitcher, HowTabs, LiveDemo, StickyCta, TrackSignupClicks, TrialLink } from "@/components/site/marketing/home-b-client";
import { LEGAL_COPYRIGHT, SUPPORT_EMAIL } from "@/lib/legal";
import { TRIAL } from "@/lib/plans";
import { PLAYBACK_GRACE_DAYS } from "@/lib/server/entitlements";
import { designById } from "@/lib/menu-designs";
import { DEMO_TEMPLATES, HERO_SIZES, HERO_TEMPLATES, heroImage, heroSrcSet, type HomeTemplate } from "@/lib/marketing-home";
import type { Locale, T } from "@/lib/i18n/index";
import "@/components/site/marketing/home-b.css";

/**
 * Home page, Option B ("Beautiful digital menus on your TV in minutes."), approved November 2026.
 * The TV is the thesis: on a phone the first screen is the headline, a real Pekko template on a TV, one CTA,
 * the trial line and the Smart TV line. Every board shown is a real template rendered by the production
 * renderer with Pekko's own sample content. Copy never states a fixed number of templates.
 * The previous home page stays in components/site/marketing/home-classic.tsx (HOME_VARIANT=classic).
 */
/** The TV player's own pairing screen text (public/player.html, English on every TV). */
const PLAYER_PAIR_LINE = "Enter this code in Pekko to connect this TV.";
const PLAYER_PAIR_NOTE = "A new code appears every 10 minutes.";

export function HomeB({ t, locale, href }: { t: T; locale: Locale; href: (path: string) => string }) {
  const named = (list: readonly HomeTemplate[]) => list.map((c) => ({ id: c.id, label: t(c.chip), name: designById(c.id)?.name[locale] ?? c.id }));
  const hero = named(HERO_TEMPLATES);
  const demo = named(DEMO_TEMPLATES);
  const altFor = Object.fromEntries(hero.map((c) => [c.id, t("home2.heroAlt", { name: c.name })]));
  // Performance: the first board is the largest element on first paint (LCP), so fetch it with the HTML.
  preload(heroImage(hero[0].id, 640), { as: "image", imageSrcSet: heroSrcSet(hero[0].id), imageSizes: HERO_SIZES, fetchPriority: "high" });
  const em = { em: (c: React.ReactNode) => <span className="hb-grad">{c}</span> };

  const steps = [
    { id: "choose", label: t("home2.howTab1"), panel: <StepPanel who={t("home2.howWhoDevice")} title={t("home2.how1Title")} body={t("home2.how1Body")}
      pic={<img src="/marketing/how/gallery.webp" width={960} height={560} loading="lazy" decoding="async" alt={t("home2.how1Alt")} />} /> },
    { id: "menu", label: t("home2.howTab2"), panel: <StepPanel who={t("home2.howWhoDevice")} title={t("home2.how2Title")} body={t("home2.how2Body")}
      pic={<img src="/marketing/how/editor.webp" width={960} height={560} loading="lazy" decoding="async" alt={t("home2.how2Alt")} />} /> },
    { id: "tv", label: t("home2.howTab3"), panel: <StepPanel who={t("home2.howWhoTv")} title={t("home2.how3Title")} body={rich(t("home2.how3Body"))}
      pic={(
        <div className="hb-duo">
          {/* The player's own pairing screen text (the TV player is in English). */}
          <div className="hb-tvcode" role="img" aria-label={t("home2.how3TvLabel")} lang="en">
            <div><p className="l">{PLAYER_PAIR_LINE}</p><p className="c">482 910</p><p className="m">{PLAYER_PAIR_NOTE}</p></div>
          </div>
          <img src="/marketing/how/pair.webp" width={480} height={241} loading="lazy" decoding="async" alt={t("home2.how3Alt")} />
        </div>
      )} /> },
    { id: "publish", label: t("home2.howTab4"), panel: <StepPanel who={t("home2.howWhoTap")} title={t("home2.how4Title")} body={t("home2.how4Body")} fit
      pic={<img src="/marketing/how/publish.webp" width={480} height={507} loading="lazy" decoding="async" alt={t("home2.how4Alt")} />} /> },
  ];

  return (
    <div className="hb">
      <section className="hb-hero" aria-labelledby="hb-hero-title">
        <div className="hb-wrap hb-hero-grid">
          <div className="hb-hero-copy">
            <div className="hb-hero-head">
              <h1 id="hb-hero-title" data-testid="home-title">{rich(t("home2.heroTitle"), em)}</h1>
              <p className="hb-hero-sub">{rich(t("home2.heroSub"))}</p>
            </div>
            <div className="hb-cta-block" id="hb-hero-cta">
              <TrialLink href={SIGNUP_HREF} location="hero" className="btn btn-primary hb-btn" testId="hero-cta">{t("home2.cta")}</TrialLink>
              <p className="hb-trial">{rich(t("home2.trialLine", { days: TRIAL.days }))}</p>
              <p className="hb-tvline"><TvIcon />{t("home2.tvLine")}</p>
            </div>
          </div>
          <HeroSwitcher chips={hero} chipsLabel={t("home2.chipsLabel")} altFor={altFor} badge={t("home2.realTemplate")} />
        </div>
      </section>

      <section className="hb-sec" id="templates" aria-labelledby="hb-tpl-title">
        <div className="hb-wrap">
          <div className="hb-head">
            <p className="hb-eyebrow">{t("home2.demoEyebrow")}</p>
            <h2 id="hb-tpl-title">{t("home2.demoTitle")}</h2>
            <p className="hb-lede">{t("home2.demoLede")}</p>
          </div>
          <LiveDemo chips={demo} text={{ name: t("home2.demoName"), item: t("home2.demoItem"), price: t("home2.demoPrice"), chipsLabel: t("home2.demoChipsLabel"),
            note: t("home2.demoNote"), loading: t("home2.demoLoading"), failed: t("home2.demoFailed"), preview: t("home2.demoPreview") }}>
            <ul className="hb-facts"><li>{t("home2.fact1")}</li><li>{t("home2.fact2")}</li><li>{t("home2.fact3")}</li></ul>
            <TrialLink href={SIGNUP_HREF} location="demo" className="btn btn-quiet hb-demo-cta">{t("home2.demoCta")}</TrialLink>
          </LiveDemo>
        </div>
      </section>

      <section className="hb-sec hb-sec-tight" id="how" aria-labelledby="hb-how-title">
        <div className="hb-wrap">
          <div className="hb-head">
            <p className="hb-eyebrow">{t("home2.howEyebrow")}</p>
            <h2 id="hb-how-title">{t("home2.howTitle")}</h2>
          </div>
          <HowTabs steps={steps} label={t("home2.howTabs")} />
        </div>
      </section>

      <section className="hb-sec hb-band" aria-labelledby="hb-tv-title">
        <div className="hb-wrap">
          <div className="hb-head">
            <p className="hb-eyebrow">{t("home2.tvEyebrow")}</p>
            <h2 id="hb-tv-title">{t("home2.tvLine")}</h2>
            <p className="hb-lede">{t("home2.tvLede")}</p>
          </div>
          <ol className="hb-tvsteps">
            <li>{t("home2.tvStep1")}</li>
            <li>{rich(t("home2.tvStep2"), { b: (c) => <code>{c}</code> })}</li>
            <li>{t("home2.tvStep3")}</li>
            <li>{t("home2.tvStep4")}</li>
          </ol>
          <div className="hb-benefits">
            {([1, 2, 3, 4] as const).map((n) => (
              <div className="hb-benefit" key={n}><h3>{t(`home2.benefit${n}Title`)}</h3><p>{t(`home2.benefit${n}Body`)}</p></div>
            ))}
          </div>
          <p className="hb-fine">{t("home2.tvFine")}</p>
        </div>
      </section>

      <section className="hb-sec" id="pricing" aria-labelledby="hb-price-title">
        <div className="hb-wrap">
          <div className="hb-head">
            <p className="hb-eyebrow">{t("home2.pricingEyebrow")}</p>
            <h2 id="hb-price-title">{t("home2.pricingTitle")}</h2>
          </div>
          <TrackSignupClicks location="pricing"><PricingCards testPrefix="landing-plan" /></TrackSignupClicks>
          <ul className="hb-terms">
            <li>{t("home2.term1", { days: TRIAL.days, screens: TRIAL.screens })}</li>
            <li>{t("home2.term2", { grace: PLAYBACK_GRACE_DAYS })}</li>
            <li>{t("home2.term3")}</li>
            <li>{t("home2.term4")}</li>
          </ul>
          <p className="hb-more"><Link href={href("/pricing")}>{t("home.fullPricing")}</Link></p>
        </div>
      </section>

      <section className="hb-sec hb-sec-flush" id="faq" aria-labelledby="hb-faq-title">
        <div className="hb-wrap">
          <h2 id="hb-faq-title">{t("home2.faqTitle")}</h2>
          <div className="hb-faq">
            {([1, 2, 3, 4] as const).map((n) => (
              <details key={n} data-testid={`home-faq-${n}`}><summary>{t(`home2.faq${n}q`)}</summary><p>{t(`home2.faq${n}a`)}</p></details>
            ))}
          </div>
          <p className="hb-more">
            <Link href={href("/faq")}>{t("home.allQuestions")}</Link> · <Link href={href("/support")}>{t("common.support")}</Link> · <Link href={href("/contact")}>{t("footer.contact")}</Link>
          </p>
        </div>
      </section>

      <section className="hb-sec hb-sec-flush" aria-labelledby="hb-who-title">
        <div className="hb-wrap">
          <div className="hb-who" data-testid="home-who">
            <div>
              <h2 id="hb-who-title">{t("home2.whoTitle")}</h2>
              <p>{t("home2.whoBody", { owner: LEGAL_COPYRIGHT })}</p>
            </div>
            <a className="hb-mail" href={`mailto:${SUPPORT_EMAIL}`} aria-label={`${t("home2.whoEmail")}: ${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
          </div>
        </div>
      </section>

      <section className="hb-sec hb-sec-flush hb-final" aria-labelledby="hb-final-title">
        <div className="hb-wrap">
          <div className="hb-final-box">
            <div><h2 id="hb-final-title">{t("home2.finalTitle")}</h2><p>{t("home2.finalBody")}</p></div>
            <TrialLink href={SIGNUP_HREF} location="final" className="btn hb-btn hb-btn-white" testId="final-cta">{t("home2.cta")}</TrialLink>
          </div>
          <p className="hb-samples">{t("home2.samplesNote")}</p>
        </div>
      </section>

      <StickyCta href={SIGNUP_HREF} label={t("home2.cta")} days={t("home2.stickyDays", { days: TRIAL.days })} card={t("home2.stickyCard")} watch="hb-hero-cta" />
    </div>
  );
}

function StepPanel({ who, title, body, pic, fit }: { who: string; title: string; body: React.ReactNode; pic: React.ReactNode; fit?: boolean }) {
  return (
    <>
      <div className={`hb-pic ${fit ? "is-fit" : ""}`}>{pic}</div>
      <div className="hb-step-copy"><p className="hb-who-tag">{who}</p><h3>{title}</h3><p>{body}</p></div>
    </>
  );
}

function TvIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="2" y="4" width="20" height="13" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M8 21h8M12 17v4" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
