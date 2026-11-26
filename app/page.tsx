import type { Metadata } from "next";
import { PublicPage } from "@/components/public-page";
import { TRIAL } from "@/lib/plans";
import { sampleCopy } from "@/lib/marketing-samples";
import { marketingHref, marketingMetadata } from "@/lib/seo";
import { getLocale, getT } from "@/lib/i18n/server";
import { homeVariant } from "@/lib/home-variant";
import { HomeStructuredData } from "@/components/site/structured-data";
import { HomeB } from "@/components/site/marketing/home-b";
import { ClassicHome } from "@/components/site/marketing/home-classic";
import { HomePeek } from "@/components/site/peek/home-peek";
import { PeekPage } from "@/components/site/peek/shell";

export async function generateMetadata(): Promise<Metadata> {
  const [t, locale] = [await getT(), await getLocale()];
  return marketingMetadata({ path: "/", locale, title: t("home.metaTitle"), description: t("home.metaDescription", { days: TRIAL.days }) });
}

// Signed-in visitors keep going straight to /dashboard, as before. The session lives in
// localStorage (supabase-js default key sb-<ref>-auth-token), so this runs before paint.
const SIGNED_IN_REDIRECT = `try{for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(k&&/^sb-.+-auth-token$/.test(k)){location.replace('/dashboard');break}}}catch(e){}`;

export default async function Home() {
  const t = await getT();
  const locale = await getLocale();
  const href = (path: string) => marketingHref(path, locale);
  const variant = homeVariant();
  if (variant === "peek") {
    return (
      <PeekPage base="/">
        <script dangerouslySetInnerHTML={{ __html: SIGNED_IN_REDIRECT }} />
        <HomeStructuredData locale={locale} t={t} />
        <HomePeek t={t} locale={locale} href={href} />
      </PeekPage>
    );
  }
  return (
    <PublicPage bare theme="dark">
      <script dangerouslySetInnerHTML={{ __html: SIGNED_IN_REDIRECT }} />
      <HomeStructuredData locale={locale} t={t} />
      {variant === "classic"
        ? <ClassicHome t={t} c={sampleCopy(locale)} href={href} />
        : <HomeB t={t} locale={locale} href={href} />}
    </PublicPage>
  );
}
