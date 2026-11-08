import Link from "next/link";
import { PLANS, TRIAL } from "@/lib/plans";
import { FAQ, FEATURES, SHOTS } from "@/lib/marketing";

export const SIGNUP_HREF = "/signup";
type Shot = (typeof SHOTS)[keyof typeof SHOTS];

export function Screenshot({ shot, className = "", priority }: { shot: Shot; className?: string; priority?: boolean }) {
  return (
    <img src={shot.src} alt={shot.alt} width={shot.w} height={shot.h} loading={priority ? "eager" : "lazy"} decoding="async"
      className={`w-full h-auto rounded-xl border border-line shadow-lg bg-white ${className}`} />
  );
}

export function SectionHeading({ id, eyebrow, title, intro }: { id: string; eyebrow?: string; title: string; intro?: string }) {
  return (
    <div className="text-center max-w-2xl mx-auto">
      {eyebrow ? <p className="text-sm font-semibold uppercase tracking-wider text-primary">{eyebrow}</p> : null}
      <h2 id={id} className="mt-2 text-3xl md:text-4xl font-extrabold tracking-tight">{title}</h2>
      {intro ? <p className="mt-3 text-muted text-lg">{intro}</p> : null}
    </div>
  );
}

export function TrialNote({ className = "" }: { className?: string }) {
  return <p className={`text-sm text-muted ${className}`}>{TRIAL.days} days free · up to {TRIAL.screens} screens · no card needed</p>;
}

export function FeatureGrid() {
  return (
    <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="feature-grid">
      {FEATURES.map((f) => (
        <li key={f.id} className="card p-6">
          <h3 className="font-semibold text-lg">{f.title}</h3>
          <p className="mt-2 text-sm text-muted leading-relaxed">{f.body}</p>
        </li>
      ))}
    </ul>
  );
}

export function PricingCards({ testPrefix = "plan", canBuy }: { testPrefix?: string; canBuy?: boolean }) {
  return (
    <div className="mt-10 grid gap-4 md:grid-cols-3">
      {PLANS.map((p) => {
        const featured = p.id === "business";
        return (
          <article key={p.id} className={`card p-6 flex flex-col ${featured ? "ring-2 ring-primary" : ""}`} data-testid={`${testPrefix}-${p.id}`}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold text-lg">{p.name}</h3>
              {featured ? <span className="text-xs font-semibold rounded-full bg-primary text-white px-2 py-0.5">Popular</span> : null}
            </div>
            <p className="mt-2"><span className="text-4xl font-extrabold">${p.price}</span><span className="text-muted"> / month</span></p>
            <p className="mt-1 text-sm text-muted">{p.screens === 1 ? "1 screen" : `Up to ${p.screens} screens`}</p>
            <ul className="mt-4 text-sm grid gap-1.5 flex-1">
              <li>✓ Images, video and menu boards</li>
              <li>✓ Playlists and schedules</li>
              <li>✓ Offline playback and screen alerts</li>
            </ul>
            <Link href={SIGNUP_HREF} className={`btn mt-5 ${featured ? "btn-primary" : "btn-quiet"}`}>Start free trial</Link>
            {canBuy === undefined ? null : canBuy ? (
              <Link href="/dashboard/billing" className="btn btn-quiet mt-2" data-testid={`buy-${p.id}`}>Choose {p.name}</Link>
            ) : (
              <p className="mt-2 text-center text-sm text-muted" data-testid={`buy-${p.id}`}>Online checkout coming soon</p>
            )}
          </article>
        );
      })}
    </div>
  );
}

export function TrialDetails() {
  return (
    <div className="mt-8 card p-6 text-sm grid gap-2" data-testid="trial-details">
      <h3 className="font-semibold text-base">How the trial works</h3>
      <p>Your {TRIAL.days}-day trial starts when you create your account and includes every feature on up to {TRIAL.screens} screens, the full Multi-screen experience. We don&apos;t ask for a card.</p>
      <p>When the trial ends, your screens keep playing for 3 more days. If you don&apos;t choose a plan, they pause. Your content and settings are kept, and choosing a plan turns them back on.</p>
      <p>Prices are in US dollars, billed monthly. Taxes may apply.</p>
    </div>
  );
}

export function FaqList({ limit }: { limit?: number }) {
  const items = limit ? FAQ.slice(0, limit) : FAQ;
  return (
    <div className="mt-10 grid gap-3 max-w-3xl mx-auto" data-testid="faq-list">
      {items.map((f) => (
        <details key={f.q} className="card p-5 group">
          <summary className="font-semibold cursor-pointer">{f.q}</summary>
          <p className="mt-2 text-sm leading-relaxed text-muted">{f.a}</p>
        </details>
      ))}
    </div>
  );
}

export function TrialCta() {
  return (
    <section className="px-5 py-16" aria-labelledby="cta">
      <div className="mx-auto max-w-4xl rounded-3xl bg-ink text-white p-10 text-center">
        <h2 id="cta" className="text-3xl font-extrabold tracking-tight">Try Pekko free for {TRIAL.days} days</h2>
        <p className="mt-3 text-white/80">Every feature on up to {TRIAL.screens} screens. No card needed.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href={SIGNUP_HREF} className="btn btn-primary text-base px-6">Start free trial</Link>
          <Link href="/support" className="btn text-base px-6 bg-white/10 text-white hover:bg-white/20">Get help</Link>
        </div>
      </div>
    </section>
  );
}
