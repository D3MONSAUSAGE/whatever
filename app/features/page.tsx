import type { Metadata } from "next";
import { PublicPage } from "@/components/public-page";
import { SHOTS } from "@/lib/marketing";
import { getT } from "@/lib/i18n/server";
import type { MessageKey } from "@/lib/i18n/index";
import { FeatureGrid, Screenshot, SectionHeading, TrialCta } from "@/components/site/sections";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("features.metaTitle"), description: t("features.metaDescription"), alternates: { canonical: "/features" } };
}

const ROWS: { n: 1 | 2 | 3 | 4 | 5 | 6; shot: (typeof SHOTS)[keyof typeof SHOTS] }[] = [
  { n: 1, shot: SHOTS.dashboard },
  { n: 2, shot: SHOTS.media },
  { n: 3, shot: SHOTS.playlists },
  { n: 4, shot: SHOTS.schedule },
  { n: 5, shot: SHOTS.displays },
  { n: 6, shot: SHOTS.tvPromo },
];

export default async function Features() {
  const t = await getT();
  return (
    <PublicPage bare>
      <section className="px-5 pt-14 pb-6">
        <div className="mx-auto max-w-6xl text-center">
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">{t("features.title")}</h1>
          <p className="mt-4 text-muted text-lg max-w-2xl mx-auto">{t("features.lede")}</p>
        </div>
      </section>
      <section className="px-5 py-10">
        <div className="mx-auto max-w-6xl grid gap-14">
          {ROWS.map((r, i) => (
            <div key={r.n} className="grid gap-8 lg:grid-cols-2 lg:items-center">
              <div className={i % 2 ? "lg:order-2" : ""}>
                <h2 className="text-2xl font-bold">{t(`features.row${r.n}Title` as MessageKey)}</h2>
                <p className="mt-3 text-muted text-lg">{t(`features.row${r.n}Body` as MessageKey)}</p>
              </div>
              <Screenshot shot={r.shot} />
            </div>
          ))}
        </div>
      </section>
      <section className="px-5 py-16 bg-white/60 border-y border-line" aria-labelledby="all">
        <div className="mx-auto max-w-6xl">
          <SectionHeading id="all" title={t("features.allTitle")} />
          <FeatureGrid />
        </div>
      </section>
      <TrialCta />
    </PublicPage>
  );
}
