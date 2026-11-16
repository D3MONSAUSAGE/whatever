import type { Metadata } from "next";
import Link from "next/link";
import { PublicPage } from "@/components/public-page";
import { FaqList, TrialCta } from "@/components/site/sections";
import { ContactBlock } from "@/components/contact-block";
import { getT } from "@/lib/i18n/server";
import { rich } from "@/components/i18n/rich";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("faq.metaTitle"), description: t("faq.metaDescription"), alternates: { canonical: "/faq" } };
}

export default async function Faq() {
  const t = await getT();
  return (
    <PublicPage bare theme="dark">
      <section className="px-5 pt-16 md:pt-24 pb-6 text-center mk-rise">
        <p className="mk-eyebrow">{t("home.faqEyebrow")}</p>
        <h1 className="mt-4 text-4xl md:text-6xl font-extrabold tracking-tight text-balance"><span className="mk-gradient-text">{t("faq.title")}</span></h1>
        <p className="mt-5 text-muted text-lg">{rich(t("faq.lede"), { link: (c) => <Link href="/support" className="underline font-semibold">{c}</Link> })}</p>
      </section>
      <section className="px-5 pb-6"><FaqList /></section>
      <div className="mx-auto max-w-3xl px-5"><ContactBlock /></div>
      <TrialCta />
    </PublicPage>
  );
}
