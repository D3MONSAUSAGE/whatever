import type { Metadata } from "next";
import Link from "next/link";
import { PublicPage } from "@/components/public-page";
import { PLANS, TRIAL } from "@/lib/plans";

export const metadata: Metadata = { title: "Pricing · Pekko", description: "Simple digital signage for your business. Try Pekko free for 14 days." };

export default function Pricing() {
  return (
    <PublicPage wide>
      <section className="text-center">
        <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">Your menu and offers on every screen</h1>
        <p className="mt-3 text-muted text-lg">Upload, build a playlist, and publish to your TVs from your phone or computer.</p>
        <Link href="/login?mode=up" className="btn btn-primary mt-6 text-base px-6" data-testid="start-trial">Start free trial</Link>
        <p className="mt-3 text-sm text-muted">{TRIAL.days} days free · up to {TRIAL.screens} screens · no card needed</p>
      </section>
      <section className="mt-10 grid gap-4 md:grid-cols-3" aria-label="Plans">
        {PLANS.map((p) => (
          <article key={p.id} className="card p-6 flex flex-col" data-testid={`plan-${p.id}`}>
            <h2 className="font-semibold text-lg">{p.name}</h2>
            <p className="mt-2"><span className="text-3xl font-extrabold">${p.price}</span><span className="text-muted"> / month</span></p>
            <p className="mt-1 text-sm text-muted">{p.screens} screen{p.screens === 1 ? "" : "s"}</p>
            <ul className="mt-4 text-sm grid gap-1 flex-1">
              <li>✓ Images, video and menu boards</li>
              <li>✓ Playlists and schedules</li>
              <li>✓ Offline playback and screen alerts</li>
            </ul>
            <Link href="/login?mode=up" className="btn btn-quiet mt-5">Start free trial</Link>
          </article>
        ))}
      </section>
      <section className="mt-10 card p-6 text-sm grid gap-2">
        <h2 className="font-semibold text-base">How the trial works</h2>
        <p>Your {TRIAL.days}-day trial starts when you create your account and includes every feature on up to {TRIAL.screens} screens. We don&apos;t ask for a card.</p>
        <p>When the trial ends, your screens keep playing for 3 more days. If you don&apos;t choose a plan, they pause. Your content and settings are kept, and choosing a plan turns them back on.</p>
        <p>Prices are in US dollars, billed monthly. Taxes may apply.</p>
      </section>
    </PublicPage>
  );
}
