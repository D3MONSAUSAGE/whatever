import type { Metadata } from "next";
import { PublicPage } from "@/components/public-page";
import { SHOTS } from "@/lib/marketing";
import { FeatureGrid, Screenshot, SectionHeading, TrialCta } from "@/components/site/sections";

export const metadata: Metadata = {
  title: "Features · Pekko",
  description: "Digital signage that runs in your smart TV's web browser, tested on major brands including LG, Samsung, Vizio and Insignia: images, videos, PowerPoint and PDF presentations, playlists, schedules, multiple screens and status alerts.",
  alternates: { canonical: "/features" },
};

const ROWS = [
  { title: "Manage everything from one dashboard", body: "See your screens, media, playlists and schedules at a glance, from your computer or phone.", shot: SHOTS.dashboard },
  { title: "Turn presentations into screen content", body: "Upload a PowerPoint (.pptx) or PDF to share menus, promotions, or office announcements. Pekko converts each slide or page into a still image you can use in your playlists.", shot: SHOTS.media },
  { title: "Playlists", body: "Arrange slides, set how long each one shows, and publish to one screen or many.", shot: SHOTS.playlists },
  { title: "Schedules", body: "Run different playlists by weekday and time of day, per location and time zone, for single screens or groups.", shot: SHOTS.schedule },
  { title: "Screens and status", body: "Pair a screen with a 6-digit code, see what each one is playing, and get an alert when one goes offline.", shot: SHOTS.displays },
  { title: "On the TV", body: "The player runs full screen in your smart TV's web browser, tested on major brands including LG, Samsung, Vizio and Insignia.", shot: SHOTS.tvPromo },
];

export default function Features() {
  return (
    <PublicPage bare>
      <section className="px-5 pt-14 pb-6">
        <div className="mx-auto max-w-6xl text-center">
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">Features</h1>
          <p className="mt-4 text-muted text-lg max-w-2xl mx-auto">Pekko runs in your smart TV's web browser, tested on major brands including LG, Samsung, Vizio and Insignia, and you control it from anywhere.</p>
        </div>
      </section>
      <section className="px-5 py-10">
        <div className="mx-auto max-w-6xl grid gap-14">
          {ROWS.map((r, i) => (
            <div key={r.title} className="grid gap-8 lg:grid-cols-2 lg:items-center">
              <div className={i % 2 ? "lg:order-2" : ""}>
                <h2 className="text-2xl font-bold">{r.title}</h2>
                <p className="mt-3 text-muted text-lg">{r.body}</p>
              </div>
              <Screenshot shot={r.shot} />
            </div>
          ))}
        </div>
      </section>
      <section className="px-5 py-16 bg-white/60 border-y border-line" aria-labelledby="all">
        <div className="mx-auto max-w-6xl">
          <SectionHeading id="all" title="All features" />
          <FeatureGrid />
        </div>
      </section>
      <TrialCta />
    </PublicPage>
  );
}
