import type { Metadata } from "next";
import Link from "next/link";
import { PublicPage } from "@/components/public-page";
import { FaqList, TrialCta } from "@/components/site/sections";
import { ContactBlock } from "@/components/contact-block";

export const metadata: Metadata = {
  title: "FAQ · Pekko",
  description: "Answers about the Pekko free trial, plans, screens, devices and account deletion.",
  alternates: { canonical: "/faq" },
};

export default function Faq() {
  return (
    <PublicPage bare>
      <section className="px-5 pt-14 pb-6 text-center">
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">Frequently asked questions</h1>
        <p className="mt-4 text-muted text-lg">Need help with a screen? See <Link href="/support" className="underline font-semibold">Support</Link>.</p>
      </section>
      <section className="px-5 pb-6"><FaqList /></section>
      <div className="mx-auto max-w-3xl px-5"><ContactBlock /></div>
      <TrialCta />
    </PublicPage>
  );
}
