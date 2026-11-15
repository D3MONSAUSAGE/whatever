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
    <PublicPage>
      <h1 className="text-2xl font-semibold tracking-tight">{t("contact.title")}</h1>
      <p className="text-muted mt-1">{rich(t("contact.lede"), { link: (c) => <Link className="underline" href="/support">{c}</Link> })}</p>
      <ContactBlock />
    </PublicPage>
  );
}
