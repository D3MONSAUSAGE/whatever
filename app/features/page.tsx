import type { Metadata } from "next";
import Link from "next/link";
import { PublicPage } from "@/components/public-page";
import { SHOTS } from "@/lib/marketing";
import { sampleCopy, SAMPLE_MEDIA, type SampleCopy } from "@/lib/marketing-samples";
import { getLocale, getT } from "@/lib/i18n/server";
import { marketingHref, marketingMetadata } from "@/lib/seo";
import type { MessageKey, T } from "@/lib/i18n/index";
import { FeatureGrid, Screenshot, SectionHeading, SIGNUP_HREF, TrialCta } from "@/components/site/sections";
import { Tv, SampleNote } from "@/components/site/marketing/tv";
import { BrunchArtwork, EmberOakBoard, FornoRossoBoard, LindenBoard } from "@/components/site/marketing/boards";
import { Check, PlaylistMock } from "@/components/site/marketing/showcase";
import { Reveal } from "@/components/site/marketing/reveal";

export async function generateMetadata(): Promise<Metadata> {
  const [t, locale] = [await getT(), await getLocale()];
  return marketingMetadata({ path: "/features", locale, title: t("features.metaTitle"), description: t("features.metaDescription") });
}

type Row = { title: MessageKey; body: MessageKey; visual: (t: T, c: SampleCopy) => React.ReactNode };

const VISUALS: Record<1 | 2 | 3 | 4 | 5 | 6, Row["visual"]> = {
  1: () => (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-2 shadow-[0_30px_80px_rgb(0_0_0/0.45)]">
      <div className="flex gap-1.5 px-2 pb-2 pt-1" aria-hidden="true"><span className="size-2.5 rounded-full bg-white/20" /><span className="size-2.5 rounded-full bg-white/20" /><span className="size-2.5 rounded-full bg-white/20" /></div>
      <Screenshot shot={SHOTS.dashboard} className="!rounded-xl !border-0 !shadow-none" />
    </div>
  ),
  2: (t, c) => (
    <div className="relative">
      <Tv label={t("mk.tv.linden")}><LindenBoard c={c} /></Tv>
      <span className="mk-glass absolute -top-4 left-3 rounded-full px-4 py-2 text-xs font-semibold text-white" aria-hidden="true">{t("mk.fx.slide")}</span>
    </div>
  ),
  3: (t) => <div className="mx-auto max-w-xl"><PlaylistMock t={t} /></div>,
  4: (t) => <DayParts t={t} />,
  5: (t) => <StatusCard t={t} />,
  6: (t, c) => <Tv label={t("mk.tv.forno")}><FornoRossoBoard c={c} /></Tv>,
};

/* Rows render features.row{n}Title/Body (tests read that pattern) plus the menu-board and artwork rows. */
const ROWS: Row[] = [
  { title: "mk.fx.menuTitle", body: "mk.fx.menuBody", visual: (t, c) => <Tv label={t("mk.tv.hero")}><EmberOakBoard c={c} /></Tv> },
  { title: "mk.fx.artTitle", body: "mk.fx.artBody", visual: (t, c) => <Tv label={t("mk.tv.brunch")}><BrunchArtwork c={c} /></Tv> },
  ...([1, 2, 3, 4, 5, 6] as const).map((n) => ({ n })).map((r): Row => ({ title: `features.row${r.n}Title` as MessageKey, body: `features.row${r.n}Body` as MessageKey, visual: VISUALS[r.n] })),
];

function DayParts({ t }: { t: T }) {
  const parts: { name: MessageKey; time: string; img: string }[] = [
    { name: "mk.fx.breakfast", time: "6:00 – 11:00", img: SAMPLE_MEDIA.pancakes },
    { name: "mk.fx.lunch", time: "11:00 – 16:00", img: SAMPLE_MEDIA.ribs },
    { name: "mk.fx.dinner", time: "16:00 – 22:00", img: SAMPLE_MEDIA.burger },
  ];
  return (
    <div className="card p-5" aria-hidden="true">
      <p className="text-sm font-bold text-white">{t("mk.fx.dayparts")}</p>
      <div className="mt-4 grid grid-cols-3 gap-3">
        {parts.map((p, i) => (
          <div key={p.name} className={`rounded-xl border p-2 ${i === 2 ? "border-[#2f7bff] bg-[#2f7bff]/15" : "border-white/10 bg-white/[0.03]"}`}>
            <img src={p.img} alt="" className="aspect-[4/3] w-full rounded-lg object-cover" loading="lazy" />
            <p className="mt-2 text-sm font-bold text-white">{t(p.name)}</p>
            <p className="text-xs text-muted">{p.time}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 h-2 rounded-full bg-white/10 overflow-hidden"><div className="h-full w-[72%] rounded-full bg-gradient-to-r from-[#3dd6ff] to-[#2f7bff]" /></div>
    </div>
  );
}

function StatusCard({ t }: { t: T }) {
  const rows: { name: MessageKey; state: MessageKey; ok: boolean; img: string }[] = [
    { name: "mk.fx.screen1", state: "mk.fx.online", ok: true, img: SAMPLE_MEDIA.burger },
    { name: "mk.fx.screen2", state: "mk.fx.online", ok: true, img: SAMPLE_MEDIA.latte },
    { name: "mk.fx.screen3", state: "mk.fx.offline", ok: false, img: SAMPLE_MEDIA.coldBrew },
  ];
  return (
    <div className="card p-5" aria-hidden="true">
      <p className="text-sm font-bold text-white">{t("mk.fx.statusTitle")}</p>
      <ul className="mt-4 grid gap-3">
        {rows.map((r) => (
          <li key={r.name} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
            <img src={r.img} alt="" className="h-10 w-16 rounded-md object-cover" loading="lazy" />
            <span className="flex-1 text-sm font-semibold text-white">{t(r.name)}</span>
            <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${r.ok ? "bg-emerald-400/15 text-emerald-300" : "bg-rose-400/15 text-rose-300"}`}>
              {r.ok ? <span className="mk-live-dot" /> : <span className="size-2 rounded-full bg-rose-400" />}{t(r.state)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function Features() {
  const t = await getT();
  const locale = await getLocale();
  const c = sampleCopy(locale);
  return (
    <PublicPage bare theme="dark">
      <section className="px-5 pt-16 pb-8 md:pt-24">
        <div className="mx-auto max-w-4xl text-center mk-rise">
          <p className="mk-eyebrow">{t("home.featuresEyebrow")}</p>
          <h1 className="mt-4 text-4xl md:text-6xl font-extrabold tracking-tight"><span className="mk-gradient-text">{t("features.title")}</span></h1>
          <p className="mt-5 text-muted text-lg md:text-xl max-w-2xl mx-auto leading-relaxed">{t("features.lede")}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href={SIGNUP_HREF} className="btn btn-primary text-base px-7">{t("site.startTrial")}</Link>
            <Link href={marketingHref("/pricing", locale)} className="btn btn-quiet text-base px-7">{t("site.seePricing")}</Link>
          </div>
        </div>
      </section>
      <section className="mk-section !pt-10">
        <div className="mx-auto max-w-7xl grid gap-20 md:gap-28">
          {ROWS.map((r, i) => (
            <div key={r.title} className="grid gap-10 lg:grid-cols-2 lg:items-center lg:gap-16">
              <div className={i % 2 ? "lg:order-2" : ""}>
                <h2 className="text-2xl md:text-4xl font-extrabold tracking-tight text-balance">{t(r.title)}</h2>
                <p className="mt-4 text-muted text-lg leading-relaxed">{t(r.body)}</p>
              </div>
              <Reveal>{r.visual(t, c)}</Reveal>
            </div>
          ))}
          <SampleNote className="flex justify-center text-center">{t("mk.samplesNote")}</SampleNote>
        </div>
      </section>
      <section className="mk-section" aria-labelledby="all">
        <div className="mx-auto max-w-6xl">
          <SectionHeading id="all" title={t("features.allTitle")} />
          <FeatureGrid />
          <ul className="mt-10 flex flex-wrap justify-center gap-x-6 gap-y-2">
            <Check>{t("mk.hero.check1")}</Check>
            <Check>{t("mk.hero.check2")}</Check>
            <Check>{t("mk.hero.check3")}</Check>
          </ul>
        </div>
      </section>
      <TrialCta />
    </PublicPage>
  );
}
