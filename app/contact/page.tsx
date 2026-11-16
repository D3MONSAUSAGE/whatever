import type { Metadata } from "next";
import Link from "next/link";
import { PublicPage } from "@/components/public-page";
import { ContactBlock } from "@/components/contact-block";
import { getT } from "@/lib/i18n/server";
import { rich } from "@/components/i18n/rich";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("contact.metaTitle") };
}

export default async function Contact() {
  const t = await getT();
  return (
    <PublicPage theme="dark">
      <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight"><span className="mk-gradient-text">{t("contact.title")}</span></h1>
      <p className="text-muted mt-3 text-lg">{rich(t("contact.lede"), { link: (c) => <Link className="underline" href="/support">{c}</Link> })}</p>
      <ContactBlock />
    </PublicPage>
  );
}
