import type { Metadata } from "next";
import Link from "next/link";
import { PublicPage } from "@/components/public-page";
import { TRIAL } from "@/lib/plans";
import { SHOTS } from "@/lib/marketing";
import { FaqList, FeatureGrid, PricingCards, Screenshot, SectionHeading, SIGNUP_HREF, TrialCta, TrialNote } from "@/components/site/sections";

export const metadata: Metadata = {
  title: "Pekko · Digital signage for your business",
  description: `Menus, offers, and presentations on your screens. Try Pekko free for ${TRIAL.days} days, no card needed.`,
  alternates: { canonical: "/" },
};

// Signed-in visitors keep going straight to /dashboard, as before. The session lives in
// localStorage (supabase-js default key sb-<ref>-auth-token), so this runs before paint.
const SIGNED_IN_REDIRECT = `try{for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(k&&/^sb-.+-auth-token$/.test(k)){location.replace('/dashboard');break}}}catch(e){}`;

const STEPS = [
  { title: "Open the player on your screen", body: "Open the Pekko player in the screen's web browser. It shows a 6-digit code." },
  { title: "Connect it to your account", body: "Enter the code in your dashboard to pair the screen." },
  { title: "Add your content", body: "Upload images, videos, or a presentation, arrange your playlist, and publish it to your connected screens." },
];

const HIGHLIGHTS = [
  { title: "Build playlists and menus in minutes", body: "Upload images and videos, make menu boards from templates, and arrange slides into playlists.", shot: SHOTS.playlists },
  { title: "The right content at the right time", body: "Schedule breakfast, lunch and dinner by day and time, for one screen or a group of screens in each location.", shot: SHOTS.schedule },
  { title: "Know every screen is working", body: "See which screens are online and what they're showing, and get an alert when one goes offline.", shot: SHOTS.displays },
];

export default function Home() {
  return (
    <PublicPage bare>
      <script dangerouslySetInnerHTML={{ __html: SIGNED_IN_REDIRECT }} />
      <section className="px-5 pt-14 pb-16 md:pt-20" data-testid="landing-hero">
        <div className="mx-auto max-w-6xl grid gap-10 lg:grid-cols-2 lg:items-center">
          <div className="text-center lg:text-left">
            <p className="text-sm font-semibold uppercase tracking-wider text-primary">Digital signage made simple</p>
            <h1 className="mt-3 text-4xl md:text-5xl font-extrabold tracking-tight">Menus, offers, and presentations on your screens.</h1>
            <p className="mt-4 text-muted text-lg max-w-xl mx-auto lg:mx-0">Show restaurant specials, business promotions, and team updates. Bring images, videos, and presentations together in playlists, and manage your screens from your phone or computer.</p>
            <div className="mt-7 flex flex-wrap justify-center lg:justify-start gap-3">
              <Link href={SIGNUP_HREF} className="btn btn-primary text-base px-6" data-testid="start-trial">Start free trial</Link>
              <Link href="/pricing" className="btn btn-quiet text-base px-6">See pricing</Link>
            </div>
            <TrialNote className="mt-3" />
          </div>
          <div className="relative">
            <Screenshot shot={SHOTS.dashboard} priority />
            <div className="hidden sm:block absolute -bottom-8 -left-6 w-2/5"><Screenshot shot={SHOTS.tvMenu} priority /></div>
          </div>
        </div>
      </section>

      <section className="px-5 py-16 bg-white/60 border-y border-line" aria-labelledby="how">
        <div className="mx-auto max-w-6xl">
          <SectionHeading id="how" eyebrow="How it works" title="On screen in three steps" />
          <ol className="mt-10 grid gap-4 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="card p-6">
                <div className="text-primary font-extrabold text-2xl">{i + 1}</div>
                <h3 className="mt-2 font-semibold">{s.title}</h3>
                <p className="mt-1 text-sm text-muted">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="px-5 py-16" aria-labelledby="features" id="features-section">
        <div className="mx-auto max-w-6xl">
          <SectionHeading id="features" eyebrow="Features" title="Everything you need to run your screens" intro="Works on smart TVs, tablets, computers and TV sticks, anything with a web browser." />
          <div className="mt-12 grid gap-14">
            {HIGHLIGHTS.map((h, i) => (
              <div key={h.title} className="grid gap-8 lg:grid-cols-2 lg:items-center">
                <div className={i % 2 ? "lg:order-2" : ""}>
                  <h3 className="text-2xl font-bold">{h.title}</h3>
                  <p className="mt-3 text-muted text-lg">{h.body}</p>
                </div>
                <Screenshot shot={h.shot} />
              </div>
            ))}
          </div>
          <FeatureGrid />
          <p className="mt-6 text-center"><Link href="/features" className="font-semibold underline">See all features</Link></p>
        </div>
      </section>

      <section className="px-5 py-16 bg-white/60 border-y border-line" aria-labelledby="plans">
        <div className="mx-auto max-w-5xl">
          <SectionHeading id="plans" eyebrow="Pricing" title="Simple monthly plans" intro={`Every plan starts with a ${TRIAL.days}-day free trial of every feature on up to ${TRIAL.screens} screens. No card needed.`} />
          <PricingCards testPrefix="landing-plan" />
          <p className="mt-6 text-center text-sm text-muted"><Link href="/pricing" className="underline font-semibold">Full pricing details</Link></p>
        </div>
      </section>

      <section className="px-5 py-16" aria-labelledby="faq">
        <SectionHeading id="faq" eyebrow="FAQ" title="Questions, answered" />
        <FaqList limit={5} />
        <p className="mt-6 text-center text-sm"><Link href="/faq" className="underline font-semibold">All questions</Link> · <Link href="/support" className="underline font-semibold">Support</Link> · <Link href="/contact" className="underline font-semibold">Contact</Link></p>
      </section>

      <TrialCta />
    </PublicPage>
  );
}
