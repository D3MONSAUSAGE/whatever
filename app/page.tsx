import type { Metadata } from "next";
import Link from "next/link";
import { PublicPage } from "@/components/public-page";
import { PLANS, TRIAL } from "@/lib/plans";

export const metadata: Metadata = {
  title: "Pekko · Digital signage for your business",
  description: `Show your menu, offers and videos on any TV. Try Pekko free for ${TRIAL.days} days, no card needed.`,
};

// Signed-in visitors keep going straight to /dashboard, as before. The session lives in
// localStorage (supabase-js default key sb-<ref>-auth-token), so this runs before paint.
const SIGNED_IN_REDIRECT = `try{for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(k&&/^sb-.+-auth-token$/.test(k)){location.replace('/dashboard');break}}}catch(e){}`;

const STEPS = [
  { title: "Open the player on your TV", body: "Open the Pekko player in the TV's browser. It shows a 6-digit code." },
  { title: "Connect it to your account", body: "Enter the code in your dashboard to pair the screen." },
  { title: "Publish your content", body: "Upload images and videos, build a playlist or menu, and publish. Your screens update on their own." },
];

export default function Home() {
  return (
    <PublicPage wide>
      <script dangerouslySetInnerHTML={{ __html: SIGNED_IN_REDIRECT }} />
      <section className="text-center" data-testid="landing-hero">
        <img src="/brand/icon-512.png" alt="Pekko" width={96} height={96} className="mx-auto size-24 rounded-3xl" />
        <h1 className="mt-6 text-4xl md:text-5xl font-extrabold tracking-tight">Your menu and offers on every screen</h1>
        <p className="mt-4 text-muted text-lg max-w-2xl mx-auto">Pekko is simple digital signage for your business. Upload, build a playlist, and publish to your TVs from your phone or computer.</p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link href="/login?mode=up" className="btn btn-primary text-base px-6" data-testid="start-trial">Start free trial</Link>
          <Link href="/pricing" className="btn btn-quiet text-base px-6">See pricing</Link>
        </div>
        <p className="mt-3 text-sm text-muted">{TRIAL.days} days free · up to {TRIAL.screens} screens · no card needed</p>
      </section>

      <section className="mt-14" aria-labelledby="how">
        <h2 id="how" className="text-2xl font-bold text-center">How it works</h2>
        <ol className="mt-6 grid gap-4 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="card p-6">
              <div className="text-primary font-extrabold text-2xl">{i + 1}</div>
              <h3 className="mt-2 font-semibold">{s.title}</h3>
              <p className="mt-1 text-sm text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-14" aria-labelledby="plans">
        <h2 id="plans" className="text-2xl font-bold text-center">Simple monthly plans</h2>
        <ul className="mt-6 grid gap-4 md:grid-cols-3">
          {PLANS.map((p) => (
            <li key={p.id} className="card p-6 text-center" data-testid={`landing-plan-${p.id}`}>
              <div className="font-semibold">{p.name}</div>
              <div className="mt-1"><span className="text-3xl font-extrabold">${p.price}</span><span className="text-muted"> / month</span></div>
              <div className="text-sm text-muted">{p.screens} screen{p.screens === 1 ? "" : "s"}</div>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-center text-sm text-muted">Every plan starts with a {TRIAL.days}-day free trial of every feature on up to {TRIAL.screens} screens. No card needed. <Link href="/pricing" className="underline font-semibold">Full pricing details</Link></p>
      </section>

      <section className="mt-14 card p-8 text-center">
        <h2 className="text-2xl font-bold">Ready to try it?</h2>
        <Link href="/login?mode=up" className="btn btn-primary mt-5 text-base px-6">Start free trial</Link>
      </section>
    </PublicPage>
  );
}
