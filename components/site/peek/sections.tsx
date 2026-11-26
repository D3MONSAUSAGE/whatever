import { PLANS, TRIAL } from "@/lib/plans";
import { getT } from "@/lib/i18n/server";
import { rich } from "@/components/i18n/rich";
import { TrackSignupClicks, TrialLink } from "@/components/site/marketing/home-b-client";
import { Arrow, PeekFace, SIGNUP_HREF } from "@/components/site/peek/shell";

/**
 * Peek pricing cards (home #pricing and /pricing). Prices, screen counts, "Popular" and the plan features come from
 * lib/plans.ts and the existing site.* strings, exactly as PricingCards; only the look and the approved button
 * label ("Create my free menu", home2.cta) differ. `canBuy` keeps /pricing's signed-in "Choose …" link.
 */
export async function PeekPricingCards({ canBuy, testPrefix = "plan", track = false }: { canBuy?: boolean; testPrefix?: string; track?: boolean }) {
  const t = await getT();
  const cards = (
      <div className="pkm-plans">
        {PLANS.map((p) => {
          const featured = p.id === "business";
          return (
            <article key={p.id} className={`pkm-card pkm-plan ${featured ? "is-featured" : ""}`} data-testid={`${testPrefix}-${p.id}`}>
              {featured ? <span className="pkm-sticker">{t("site.popular")}</span> : null}
              <h3>{p.name}</h3>
              <p className="pkm-price">${p.price}<span>{t("site.perMonth")}</span></p>
              <p className="pkm-plan-screens">{p.screens === 1 ? t("site.oneScreen") : t("site.upToScreens", { screens: p.screens })}</p>
              <ul>
                {(["site.planFeature1", "site.planFeature2", "site.planFeature3"] as const).map((k) => (
                  <li key={k} className="pkm-check">{t(k).replace(/^✓\s*/, "")}</li>
                ))}
              </ul>
              <a href={SIGNUP_HREF} className={featured ? "pkm-btn-pri" : "pkm-btn-line"}>{t("home2.cta")}</a>
              {canBuy === undefined ? null : canBuy ? (
                <a href="/dashboard/billing" className="pkm-link pkm-buy" data-testid={`buy-${p.id}`}>{t("site.choosePlan", { plan: p.name })}</a>
              ) : (
                <p className="pkm-buy pkm-muted" data-testid={`buy-${p.id}`}>{t("site.checkoutSoon")}</p>
              )}
            </article>
          );
        })}
      </div>
  );
  // The home page counts pricing CTA clicks (location "pricing"); /pricing never did, so it stays untracked.
  return track ? <TrackSignupClicks location="pricing">{cards}</TrackSignupClicks> : cards;
}

/** Indigo closing CTA with Peek (home and the standalone pages). */
/** `home` shows the home trial line (home2.trialLine); the standalone pages keep their own line (site.trialNote), as before. */
export async function PeekFinal({ title, body, track = false, home = false }: { title: string; body: string; track?: boolean; home?: boolean }) {
  const t = await getT();
  return (
    <section className="pkm-wrap pkm-sec" aria-labelledby="pkm-final-title">
      <div className="pkm-final">
        <PeekFace className="pkm-final-peek" />
        <div><h2 id="pkm-final-title">{title}</h2><p>{body}</p></div>
        <div className="pkm-final-actions">
          {track
            ? <TrialLink href={SIGNUP_HREF} location="final" className="pkm-cta pkm-cta-block" testId="final-cta">{t("home2.cta")}<Arrow /></TrialLink>
            : <a href={SIGNUP_HREF} className="pkm-cta pkm-cta-block" data-testid="final-cta">{t("home2.cta")}<Arrow /></a>}
          <p className="pkm-trial">{home ? rich(t("home2.trialLine", { days: TRIAL.days })) : t("site.trialNote", { days: TRIAL.days, screens: TRIAL.screens })}</p>
        </div>
      </div>
      <p className="pkm-samples">{t("home2.samplesNote")}</p>
    </section>
  );
}

const ICONS = {
  phone: <path d="M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM11 18h2" />,
  box: <><path d="M3 7l9-4 9 4-9 4z" /><path d="M3 7v10l9 4 9-4V7" /><path d="M4 4l16 16" /></>,
  tool: <><path d="M14 7l3-3 3 3-3 3" /><path d="M17 10L7 20l-3-3L14 7" /></>,
  screens: <><rect x="2" y="4" width="9" height="7" rx="1.5" /><rect x="13" y="4" width="9" height="7" rx="1.5" /><rect x="7.5" y="14" width="9" height="7" rx="1.5" /></>,
  upload: <><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v4h16v-4" /></>,
  bell: <><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z" /><path d="M10 21h4" /></>,
  tv: <><rect x="2" y="4" width="20" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></>,
} as const;

export function Icon({ name }: { name: keyof typeof ICONS }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{ICONS[name]}</svg>;
}
