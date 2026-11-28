import Link from "next/link";
import { createMenuHref } from "@/lib/guest-editor-flag";
import { getLocale, getT } from "@/lib/i18n/server";
import { localizedPath, marketingHref, type MarketingPath } from "@/lib/seo";
import { LEGAL_COPYRIGHT } from "@/lib/legal";
import { TRIAL } from "@/lib/plans";
import { rich } from "@/components/i18n/rich";
import type { Locale, MessageKey } from "@/lib/i18n/index";
import { TrafficBeacon } from "@/components/site/traffic-beacon";
import { TrialLink } from "@/components/site/marketing/home-b-client";
import { PeekMenu } from "@/components/site/peek/client";
import "@/components/site/peek/peek-marketing.css";

/**
 * Peek marketing shell (handoff 01-SPEC §1–§3): its own header, phone menu and footer, used only by the Peek home,
 * /features, /pricing and /faq. The shared SiteNav, SiteFooter and PublicPage are not used or changed, so support,
 * contact, legal pages and the Option B rollback render exactly as before.
 * The lockup is Pantalla's /peek/brand file and the fonts come from app/peek.css; both are only read here.
 */
/** Sign-up page. Trial CTAs use createMenuHref() (lib/guest-editor-flag.ts): /create when GUEST_EDITOR=on. */
export const SIGNUP_HREF = "/signup";
const OTHER: Record<Locale, { locale: Locale; short: string; name: string }> = {
  en: { locale: "es", short: "ES", name: "Español" },
  es: { locale: "en", short: "EN", name: "English" },
};

/** Peek, the brand character (64-unit artwork shared with the app). Decorative only. */
export function PeekFace({ mood = "happy", className }: { mood?: "happy" | "open"; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <rect x="6" y="14" width="52" height="40" rx="14" fill="#FFC53D" stroke="#251A3A" strokeWidth="1.5" />
      <rect x="25" y="55" width="14" height="5" rx="2.5" fill="#FFC53D" stroke="#251A3A" strokeWidth="1.2" />
      {mood === "happy"
        ? <path d="M19 37Q24 31 29 37M35 37Q40 31 45 37" stroke="#251A3A" strokeWidth="3.4" fill="none" strokeLinecap="round" />
        : <><ellipse cx="25.5" cy="35" rx="4.2" ry="6" fill="#251A3A" /><ellipse cx="41.5" cy="35" rx="4.2" ry="6" fill="#251A3A" /></>}
    </svg>
  );
}

export function Arrow() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
}

function Globe() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></svg>;
}

/** Same page in the other language. Goes through the server (?lang=) like LanguageSelect, so the choice is saved. */
function LangLink({ base, locale, long }: { base: MarketingPath; locale: Locale; long?: boolean }) {
  const o = OTHER[locale];
  return (
    <a className="pkm-lang" href={`${localizedPath(base, o.locale)}?lang=${o.locale}`} hrefLang={o.locale} lang={o.locale} data-testid="pkm-lang">
      <Globe /><span>{long ? o.name : o.short}</span>
    </a>
  );
}

const SECTION_LINKS: [MessageKey, string][] = [["nav.features", "features"], ["nav.pricing", "pricing"], ["nav.faq", "faq"]];

export async function PeekPage({ base, children }: { base: MarketingPath; children: React.ReactNode }) {
  const t = await getT();
  const locale = await getLocale();
  const home = localizedPath("/", locale);
  // On the home page the nav jumps to its sections; elsewhere it opens those sections on the home page.
  const section = (id: string) => (base === "/" ? `#${id}` : `${home}#${id}`);
  const cta = t("home2.cta");
  const start = createMenuHref();
  return (
    <div className="pkm" lang={locale} data-testid="pkm-root">
      <header className="pkm-header" data-testid="site-nav">
        <div className="pkm-wrap pkm-header-row">
          <Link href={home} className="pkm-logo" aria-label={t("brand.homeLabel")}>
            <img src="/peek/brand/pekko-lockup-light.svg" alt="Pekko" width={133} height={35} />
          </Link>
          <nav className="pkm-nav" aria-label={t("nav.main")}>
            {SECTION_LINKS.map(([k, id]) => <a key={id} href={section(id)}>{t(k)}</a>)}
          </nav>
          <span className="pkm-spacer" />
          <LangLink base={base} locale={locale} />
          <Link href="/login" className="pkm-login" data-testid="nav-login">{t("nav.login")}</Link>
          <TrialLink href={start} location="nav" className="pkm-btn-line pkm-btn-sm pkm-header-cta" testId="nav-trial">{cta}</TrialLink>
          <PeekMenu openLabel={t("nav.openMenu")} closeLabel={t("nav.closeMenu")}>
            <nav aria-label={t("nav.mobile")}>
              {SECTION_LINKS.map(([k, id]) => <a key={id} href={section(id)}>{t(k)}</a>)}
              <Link href="/login">{t("nav.login")}</Link>
            </nav>
            <div className="pkm-sheet-cta">
              <TrialLink href={start} location="nav" className="pkm-cta pkm-cta-block">{cta}<Arrow /></TrialLink>
              <p className="pkm-trial">{rich(t("home2.trialLine", { days: TRIAL.days }))}</p>
            </div>
            <div className="pkm-sheet-peek"><PeekFace mood="open" className="pkm-sheet-face" /></div>
          </PeekMenu>
        </div>
      </header>
      <TrafficBeacon />
      <main id="main" className="flex-1">{children}</main>
      <PeekFooter base={base} />
    </div>
  );
}

async function PeekFooter({ base }: { base: MarketingPath }) {
  const t = await getT();
  const locale = await getLocale();
  const cols: { title: MessageKey; links: [string, string][] }[] = [
    { title: "footer.product", links: [[t("nav.features"), "/features"], [t("nav.pricing"), "/pricing"], [t("nav.faq"), "/faq"], [t("home2.cta"), createMenuHref()], [t("nav.login"), "/login"]] },
    { title: "footer.help", links: [[t("common.support"), "/support"], [t("footer.contact"), "/contact"]] },
    { title: "footer.legal", links: [[t("footer.terms"), "/terms"], [t("footer.privacy"), "/privacy"], [t("footer.billingTerms"), "/terms#billing"], [t("footer.deleteAccount"), "/account-deletion"]] },
  ];
  return (
    <footer className="pkm-footer" data-testid="site-footer">
      <div className="pkm-wrap">
        <div className="pkm-footer-grid">
          <div className="pkm-footer-brand">
            <Link href={localizedPath("/", locale)} aria-label={t("brand.homeLabel")}><img src="/peek/brand/pekko-lockup-light.svg" alt="Pekko" width={114} height={30} /></Link>
            <p className="pkm-muted">{t("brand.footerTagline")}</p>
            <LangLink base={base} locale={locale} long />
          </div>
          {cols.map((c) => (
            <nav key={c.title} aria-label={t(c.title)}>
              <h2>{t(c.title)}</h2>
              {c.links.map(([label, href]) => <Link key={href} href={marketingHref(href, locale)}>{label}</Link>)}
            </nav>
          ))}
        </div>
        <p className="pkm-rights">{t("footer.rights", { year: new Date().getFullYear(), owner: LEGAL_COPYRIGHT })}</p>
      </div>
    </footer>
  );
}
