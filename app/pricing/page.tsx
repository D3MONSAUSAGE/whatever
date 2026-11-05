import type { Metadata } from "next";
import Link from "next/link";
import { PublicPage } from "@/components/public-page";
import { PricingCards, SIGNUP_HREF, TrialCta, TrialDetails, TrialNote } from "@/components/site/sections";

export const metadata: Metadata = {
  title: "Pricing · Pekko",
  description: "Simple digital signage for your business. Try Pekko free for 14 days.",
  alternates: { canonical: "/pricing" },
};

export default function Pricing() {
  return (
    <PublicPage bare>
      <section className="px-5 pt-14 text-center">
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">Simple monthly pricing</h1>
        <p className="mt-3 text-muted text-lg">Upload, build a playlist, and publish to your screens from your phone or computer.</p>
        <Link href={SIGNUP_HREF} className="btn btn-primary mt-6 text-base px-6" data-testid="start-trial">Start free trial</Link>
        <TrialNote className="mt-3" />
      </section>
      <section className="px-5 pb-6" aria-label="Plans">
        <div className="mx-auto max-w-5xl">
          <PricingCards />
          <TrialDetails />
          <p className="mt-4 text-center text-sm text-muted">Questions? See the <Link href="/faq" className="underline font-semibold">FAQ</Link>.</p>
        </div>
      </section>
      <TrialCta />
    </PublicPage>
  );
}
