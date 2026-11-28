import Link from "next/link";
import { preload } from "react-dom";
import { rich } from "@/components/i18n/rich";
import { GuestDemoLink, LiveDemo, StickyCta, TrialLink } from "@/components/site/marketing/home-b-client";
import { PeekHeroBoards } from "@/components/site/peek/client";
import { Arrow, PeekFace } from "@/components/site/peek/shell";
import { createMenuHref, guestEditorEnabled } from "@/lib/guest-editor-flag";
import { Icon, PeekFinal, PeekPricingCards } from "@/components/site/peek/sections";
import { LEGAL_COPYRIGHT, SUPPORT_EMAIL } from "@/lib/legal";
import { TRIAL } from "@/lib/plans";
import { PLAYBACK_GRACE_DAYS } from "@/lib/server/entitlements";
import { designById } from "@/lib/menu-designs";
import { DEMO_TEMPLATES, HERO_SIZES, HERO_TEMPLATES, heroImage, heroSrcSet, type HomeTemplate } from "@/lib/marketing-home";
import type { Locale, MessageKey, T } from "@/lib/i18n/index";

/**
 * Peek home page (pekko-marketing-site-handoff, approved November 2026). Real Pekko boards are the main visual; Peek is
 * a supporting touch (hero TV corner, support card, final CTA). Every claim is an existing approved string except the
 * hero subheadline (home2.peekHeroSub) and the Features headings, approved with the design. Prices come from
 * lib/plans.ts and trial terms from TRIAL / PLAYBACK_GRACE_DAYS, as on the Option B home.
 */
/** The TV player's own pairing screen text (public/player.html, English on every TV). */
const PLAYER_PAIR_LINE = "Enter this code in Pekko to connect this TV.";

export function HomePeek({ t, locale, href }: { t: T; locale: Locale; href: (path: string) => string }) {
  const named = (list: readonly HomeTemplate[]) => list.map((c) => ({ id: c.id, label: t(c.chip), name: designById(c.id)?.name[locale] ?? c.id }));
  const hero = named(HERO_TEMPLATES);
  const demo = named(DEMO_TEMPLATES);
  const guest = guestEditorEnabled();
  const start = createMenuHref();
  // Performance: the first board is the largest element on first paint (LCP), so fetch it with the HTML.
  preload(heroImage(hero[0].id, 640), { as: "image", imageSrcSet: heroSrcSet(hero[0].id), imageSizes: HERO_SIZES, fetchPriority: "high" });
  const em = { em: (c: React.ReactNode) => <em>{c}</em> };

  const steps: { who: MessageKey; n: 1 | 2 | 3 | 4; pic: React.ReactNode }[] = [
    { who: "home2.howWhoDevice", n: 1, pic: <div className="pkm-step-pic"><img src="/marketing/how/gallery.webp" width={960} height={560} loading="lazy" decoding="async" alt={t("home2.how1Alt")} /></div> },
    { who: "home2.howWhoDevice", n: 2, pic: <div className="pkm-step-pic"><img src="/marketing/how/editor.webp" width={960} height={560} loading="lazy" decoding="async" alt={t("home2.how2Alt")} /></div> },
    { who: "home2.howWhoTv", n: 3, pic: (
      <div className="pkm-step-duo">
        <div className="pkm-tvcode" role="img" aria-label={t("home2.how3TvLabel")} lang="en"><span className="l">{PLAYER_PAIR_LINE}</span><b className="c">482 910</b></div>
        <div className="pkm-step-pic"><img src="/marketing/how/pair.webp" width={480} height={241} loading="lazy" decoding="async" alt={t("home2.how3Alt")} /></div>
      </div>
    ) },
    { who: "home2.howWhoTap", n: 4, pic: <div className="pkm-step-pic is-fit"><img src="/marketing/how/publish.webp" width={480} height={507} loading="lazy" decoding="async" alt={t("home2.how4Alt")} /></div> },
  ];
  const feats: { icon: Parameters<typeof Icon>[0]["name"]; title: MessageKey; body: MessageKey }[] = [
    { icon: "phone", title: "home2.benefit3Title", body: "home2.benefit3Body" },
    { icon: "box", title: "home2.benefit1Title", body: "home2.benefit1Body" },
    { icon: "tool", title: "home2.benefit2Title", body: "home2.benefit2Body" },
    { icon: "screens", title: "home2.benefit4Title", body: "home2.benefit4Body" },
    { icon: "upload", title: "home2.feat5Title", body: "home2.faq3a" },
    { icon: "bell", title: "home2.feat6Title", body: "home2.feat6Body" },
  ];

  return (
    <>
      {/* 1 · Hero: a real board on a TV, the promise, one CTA and the trial terms above the fold. */}
      <section className="pkm-wrap pkm-hero" aria-labelledby="pkm-hero-title" data-testid="landing-hero">
        <div className="pkm-hero-grid">
          <div className="pkm-hero-copy">
            <h1 id="pkm-hero-title" data-testid="home-title">{rich(t("home2.heroTitle"), em)}</h1>
            <p className="pkm-hero-sub">{rich(t("home2.peekHeroSub"))}</p>
          </div>
          <div className="pkm-hero-visual">
            <PeekHeroBoards slides={hero.map((c) => ({ id: c.id, label: c.label, alt: t("home2.heroAlt", { name: c.name }) }))}
              chipsLabel={t("home2.chipsLabel")} swipeLabel={t("home2.heroSwipe")} slideLabel={t("home2.heroSlide")}
              badge={t("home2.realTemplate")} corner={<PeekFace className="pkm-peek-corner" />} />
          </div>
          <div className="pkm-cta-zone" id="hb-hero-cta">
            <TrialLink href={start} location="hero" className="pkm-cta pkm-cta-block" testId="hero-cta">{t("home2.cta")}<Arrow /></TrialLink>
            {guest ? (
              <>
                {/* Guest editor: say plainly there's nothing to commit to; trial terms come at sign-up. */}
                <p className="pkm-trial" data-testid="hero-trial">{t("home2.startLine")}</p>
                <p className="pkm-hw" data-testid="hero-hw"><Icon name="tv" /><span><b>{t("home2.hwLead")}</b> {t("home2.hwBody")}</span></p>
              </>
            ) : (
              <>
                <p className="pkm-trial" data-testid="hero-trial">{rich(t("home2.trialLine", { days: TRIAL.days }))}</p>
                <p className="pkm-tvline"><Icon name="tv" />{t("home2.tvLine")}</p>
              </>
            )}
          </div>
        </div>
      </section>

      {/* 2 · Interactive menu demo (the real renderer), opening on a second real board. */}
      <section className="pkm-wrap pkm-sec" id="templates" aria-labelledby="pkm-demo-title">
        <p className="pkm-eyebrow">{t("home2.demoEyebrow")}</p>
        <h2 id="pkm-demo-title" className="pkm-h2">{t("home2.demoTitle")}</h2>
        <p className="pkm-lede">{t("home2.demoLede")}</p>
        <LiveDemo ns="pkm" initial="taqueria-specials" chips={demo} text={{ name: t("home2.demoName"), item: t("home2.demoItem"), price: t("home2.demoPrice"), chipsLabel: t("home2.demoChipsLabel"),
          note: t("home2.demoNote"), loading: t("home2.demoLoading"), failed: t("home2.demoFailed"), preview: t("home2.demoPreview") }}>
          <div className="pkm-demo-tv-wrap" style={{ marginTop: 22 }}>
            <ul className="pkm-facts"><li className="pkm-check">{t("home2.fact1")}</li><li className="pkm-check">{t("home2.fact2")}</li><li className="pkm-check">{t("home2.fact3")}</li></ul>
            {guest
              ? <GuestDemoLink className="pkm-btn-line pkm-demo-cta" names={Object.fromEntries(demo.map((c) => [c.id, c.name]))}>{t("home2.demoCta")}</GuestDemoLink>
              : <TrialLink href={start} location="demo" className="pkm-btn-line pkm-demo-cta">{t("home2.demoCta")}</TrialLink>}
          </div>
        </LiveDemo>
      </section>

      {/* 3 · How setup works: all four steps, then the tested-TV note. */}
      <section className="pkm-wrap pkm-sec" id="how" aria-labelledby="pkm-how-title">
        <p className="pkm-eyebrow">{t("home2.howEyebrow")}</p>
        <h2 id="pkm-how-title" className="pkm-h2">{t("home2.howTitle")}</h2>
        <ol className="pkm-steps">
          {steps.map((s) => (
            <li key={s.n} className="pkm-card pkm-step">
              {s.pic}
              <div className="pkm-step-body"><span className="pkm-num" aria-hidden="true">{s.n}</span>
                <div><p className="pkm-who">{t(s.who)}</p><h3>{t(`home2.how${s.n}Title`)}</h3><p>{rich(t(`home2.how${s.n}Body`))}</p></div>
              </div>
            </li>
          ))}
        </ol>
        <div className="pkm-card pkm-tvcard">
          <h3><Icon name="tv" />{t("home2.tvEyebrow")}</h3>
          <p>{t("home2.tvFine")}</p>
        </div>
      </section>

      {/* 4 · Features: real boards, then six cards (existing benefit copy plus two approved titles). */}
      <section className="pkm-wrap pkm-sec" id="features" aria-labelledby="pkm-feat-title">
        <p className="pkm-eyebrow">{t("nav.features")}</p>
        <h2 id="pkm-feat-title" className="pkm-h2">{t("home2.featTitle")}</h2>
        <p className="pkm-lede">{t("home2.featLede")}</p>
        <div className="pkm-boards">
          {["happy-hour", "coffee-shop", "taqueria-specials", "brunch-house"].map((id) => (
            <div key={id} className="pkm-bezel"><div className="pkm-screen">
              <img src={heroImage(id, 640)} srcSet={heroSrcSet(id)} sizes="(min-width: 1100px) 300px, 45vw" width={1280} height={720} loading="lazy" decoding="async"
                alt={t("home2.heroAlt", { name: designById(id)?.name[locale] ?? id })} />
            </div></div>
          ))}
        </div>
        <ul className="pkm-feats">
          {feats.map((f) => (
            <li key={f.title} className="pkm-card pkm-feat"><span className="pkm-ficon"><Icon name={f.icon} /></span><h3>{t(f.title)}</h3><p>{t(f.body)}</p></li>
          ))}
        </ul>
      </section>

      {/* 5 · Pricing: same plans, prices and terms. */}
      <section className="pkm-wrap pkm-sec" id="pricing" aria-labelledby="pkm-price-title">
        <p className="pkm-eyebrow">{t("home2.pricingEyebrow")}</p>
        <h2 id="pkm-price-title" className="pkm-h2">{t("home2.pricingTitle")}</h2>
        <PeekPricingCards testPrefix="landing-plan" track />
        <ul className="pkm-terms">
          <li className="pkm-check">{t("home2.term1", { days: TRIAL.days, screens: TRIAL.screens })}</li>
          <li className="pkm-check">{t("home2.term2", { grace: PLAYBACK_GRACE_DAYS })}</li>
          <li className="pkm-check">{t("home2.term3")}</li>
          <li className="pkm-check">{t("home2.term4")}</li>
        </ul>
        <p className="pkm-links"><Link href={href("/pricing")} className="pkm-link">{t("home.fullPricing")} →</Link></p>
      </section>

      {/* 6 · FAQ and the support card. */}
      <section className="pkm-wrap pkm-sec" id="faq" aria-labelledby="pkm-faq-title">
        <h2 id="pkm-faq-title" className="pkm-h2">{t("home2.faqTitle")}</h2>
        <div className="pkm-faq is-two">
          {([1, 2, 3, 4] as const).map((n) => (
            <details key={n} className="pkm-card" data-testid={`home-faq-${n}`}><summary>{t(`home2.faq${n}q`)}</summary><p>{t(`home2.faq${n}a`)}</p></details>
          ))}
        </div>
        <p className="pkm-links">
          <Link href={href("/faq")} className="pkm-link">{t("home.allQuestions")}</Link> · <Link href={href("/support")} className="pkm-link">{t("common.support")}</Link> · <Link href={href("/contact")} className="pkm-link">{t("footer.contact")}</Link>
        </p>
        <div className="pkm-card pkm-who-card" data-testid="home-who">
          <PeekFace mood="open" className="pkm-who-peek" />
          <div><h2>{t("home2.whoTitle")}</h2><p>{t("home2.whoBody", { owner: LEGAL_COPYRIGHT })}</p></div>
          <a className="pkm-btn-line pkm-btn-sm" href={`mailto:${SUPPORT_EMAIL}`} aria-label={`${t("home2.whoEmail")}: ${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
        </div>
      </section>

      {/* 7 · Final CTA */}
      <PeekFinal title={t("home2.finalTitle")} body={t("home2.finalBody")} track home />

      <StickyCta ns="pkm" btnClass="pkm-cta" href={start} label={t("home2.cta")} days={t("home2.stickyDays", { days: TRIAL.days })} card={t("home2.stickyCard")} watch="hb-hero-cta" />
    </>
  );
}
