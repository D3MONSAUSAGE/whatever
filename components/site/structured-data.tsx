import { PLANS } from "@/lib/plans";
import { SUPPORT_EMAIL } from "@/lib/legal";
import { FAQ_IDS, FAQ_VARS, faqKeys } from "@/lib/marketing";
import { localizedPath, siteOrigin, SITE_NAME } from "@/lib/seo";
import type { Locale } from "@/lib/i18n/locales";
import type { T } from "@/lib/i18n/index";

/**
 * schema.org JSON-LD for search engines. Facts only: name, URLs, support email, the real plan prices.
 * No ratings, reviews or customer counts are ever added here (tests/unit/seo.test.ts guards this).
 */
function JsonLd({ data }: { data: unknown }) {
  // "<" is escaped so the JSON can never close the script element.
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}

function ids(origin: string) {
  return { org: `${origin}/#organization`, site: `${origin}/#website`, app: `${origin}/#software` };
}

export function softwareApplication(locale: Locale, t: T) {
  const origin = siteOrigin();
  const id = ids(origin);
  return {
    "@type": "SoftwareApplication",
    "@id": id.app,
    name: SITE_NAME,
    url: `${origin}${localizedPath("/", locale)}`,
    description: t("home.metaDescription", { days: FAQ_VARS.days }),
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "Digital signage",
    operatingSystem: "Web browser",
    inLanguage: ["en", "es"],
    publisher: { "@id": id.org },
    featureList: [t("mk.feat.menuTitle"), t("mk.feat.uploadTitle"), t("mk.feat.scheduleTitle"), t("mk.feat.monitorTitle"), t("mk.feat.alertsTitle")],
    offers: PLANS.map((plan) => ({
      "@type": "Offer",
      name: plan.name,
      price: plan.price.toFixed(2),
      priceCurrency: "USD",
      url: `${origin}${localizedPath("/pricing", locale)}`,
      priceSpecification: { "@type": "UnitPriceSpecification", price: plan.price.toFixed(2), priceCurrency: "USD", billingDuration: "P1M", unitText: "MONTH" },
      eligibleQuantity: { "@type": "QuantitativeValue", maxValue: plan.screens, unitText: "screens" },
    })),
  };
}

/** Home page: who we are, the site, and the product with its monthly plans. */
export function HomeStructuredData({ locale, t }: { locale: Locale; t: T }) {
  const origin = siteOrigin();
  const id = ids(origin);
  return (
    <JsonLd data={{
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "Organization", "@id": id.org, name: SITE_NAME, url: `${origin}/`, logo: `${origin}/brand/pekko-p-512.png`, email: SUPPORT_EMAIL,
          contactPoint: { "@type": "ContactPoint", contactType: "customer support", email: SUPPORT_EMAIL, availableLanguage: ["English", "Spanish"] } },
        { "@type": "WebSite", "@id": id.site, name: SITE_NAME, url: `${origin}/`, inLanguage: ["en", "es"], publisher: { "@id": id.org } },
        softwareApplication(locale, t),
      ],
    }} />
  );
}

/** Pricing page: the product and its plans. */
export function PricingStructuredData({ locale, t }: { locale: Locale; t: T }) {
  return <JsonLd data={{ "@context": "https://schema.org", ...softwareApplication(locale, t) }} />;
}

/** FAQ page: the same questions and answers the page shows. */
export function FaqStructuredData({ t, locale }: { t: T; locale: Locale }) {
  return (
    <JsonLd data={{
      "@context": "https://schema.org",
      "@type": "FAQPage",
      inLanguage: locale,
      mainEntity: FAQ_IDS.map((faq) => ({
        "@type": "Question",
        name: t(faqKeys(faq).q),
        acceptedAnswer: { "@type": "Answer", text: t(faqKeys(faq).a, FAQ_VARS) },
      })),
    }} />
  );
}
