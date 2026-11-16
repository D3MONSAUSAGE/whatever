import Link from "next/link";
import type { MessageKey, T } from "@/lib/i18n/index";
import { SAMPLE_MEDIA, type SampleCopy } from "@/lib/marketing-samples";
import { SIGNUP_HREF } from "@/components/site/sections";
import { Tv, SampleNote } from "./tv";
import { BeanThereBoard, BrunchArtwork, ColdBrewArtwork, EmberOakBoard, FornoRossoBoard, LindenBoard, PairingScreen, PawsBoard, SmokeWheelsBoard } from "./boards";
import { Reveal } from "./reveal";

/* Home page sections for the dark marketing site. Copy comes from lib/i18n (mk.*, home.*); boards from lib/marketing-samples. */

function Icon({ d, className = "size-5" }: { d: string; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
const ICONS = {
  menu: "M4 5h16M4 10h10M4 15h10M4 20h7M17 10h3v10h-3z",
  upload: "M12 16V4m0 0l-4.5 4.5M12 4l4.5 4.5M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16",
  playlist: "M4 6h11M4 11h11M4 16h7M17 14.5v5l4-2.5z",
  clock: "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
  monitor: "M3 5.5A1.5 1.5 0 0 1 4.5 4h15A1.5 1.5 0 0 1 21 5.5v10a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 15.5zM8 20h8M12 17v3",
  bell: "M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0",
  tv: "M3 6.5A1.5 1.5 0 0 1 4.5 5h15A1.5 1.5 0 0 1 21 6.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 15.5zM7 20l2-3M17 20l-2-3",
  palette: "M12 3a9 9 0 1 0 0 18c1.2 0 2-.8 2-1.8 0-.5-.2-.9-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1 .8-1.6 1.8-1.6H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3zM7.5 11.5h.01M10 7.5h.01M15 7.5h.01",
  video: "M3 7.5A1.5 1.5 0 0 1 4.5 6h10A1.5 1.5 0 0 1 16 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 3 16.5zM16 10.5l5-3v9l-5-3",
  sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z",
} as const;

function Check({ children }: { children: React.ReactNode }) {
  return <li className="mk-check text-[15px] text-[#dbe6ff]">{children}</li>;
}

/* ───────── Hero ───────── */
export function Hero({ t, c }: { t: T; c: SampleCopy }) {
  return (
    <section className="relative overflow-hidden px-5 pt-12 pb-20 md:pt-20 md:pb-28" data-testid="landing-hero">
      <img src={SAMPLE_MEDIA.interior} alt="" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-[0.13]"
        style={{ maskImage: "radial-gradient(70% 70% at 70% 45%, #000 20%, transparent 80%)", WebkitMaskImage: "radial-gradient(70% 70% at 70% 45%, #000 20%, transparent 80%)" }} />
      <div aria-hidden="true" className="pointer-events-none absolute -right-40 top-10 size-[640px] rounded-full opacity-50 blur-3xl" style={{ background: "radial-gradient(circle, rgb(47 123 255 / 0.55), transparent 65%)" }} />
      <div className="relative mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-10">
        <div className="text-center lg:text-left mk-rise">
          <p className="mk-pill"><span className="mk-live-dot" />{t("home.eyebrow")}</p>
          <h1 className="mt-6 text-[2.5rem] leading-[1.05] sm:text-6xl lg:text-[3.6rem] xl:text-[3.9rem] font-extrabold tracking-tight text-balance">
            <span className="mk-gradient-text">{t("home.title")}</span>
          </h1>
          <p className="mt-6 text-lg md:text-xl leading-relaxed text-[#b9c7e3] max-w-xl mx-auto lg:mx-0 text-pretty">{t("home.lede")}</p>
          <div className="mt-8 flex flex-wrap justify-center lg:justify-start gap-3">
            <Link href={SIGNUP_HREF} className="btn btn-primary text-base px-7" data-testid="start-trial">{t("site.startTrial")}</Link>
            <a href="#how" className="btn btn-quiet text-base px-7">{t("mk.hero.secondary")}</a>
          </div>
          <ul className="mt-7 flex flex-wrap justify-center lg:justify-start gap-x-6 gap-y-2">
            <Check>{t("mk.hero.check1")}</Check>
            <Check>{t("mk.hero.check2")}</Check>
            <Check>{t("mk.hero.check3")}</Check>
          </ul>
        </div>
        <div className="relative mk-rise" style={{ animationDelay: ".15s" }}>
          <Tv label={t("mk.tv.hero")}><EmberOakBoard c={c} animate /></Tv>
          <div className="mk-glass mk-float absolute -bottom-6 left-2 sm:-left-6 lg:-left-10 flex items-center gap-3 rounded-2xl px-4 py-3 text-left" aria-hidden="true">
            <span className="grid size-10 place-content-center rounded-xl bg-[#2f7bff]/20 text-[#7fb2ff]"><Icon d={ICONS.tv} /></span>
            <span className="leading-tight">
              <span className="block text-sm font-bold text-white">{t("mk.hero.screenName")}</span>
              <span className="mt-0.5 flex items-center gap-1.5 text-xs text-[#a3b3d1]"><span className="mk-live-dot" />{t("mk.hero.status")}</span>
            </span>
          </div>
          <SampleNote className="mk-hero-note flex justify-end">{t("mk.sample")}</SampleNote>
          <div className="mk-glass absolute -top-4 right-2 hidden sm:flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold text-[#dbe6ff]" aria-hidden="true">
            <span className="grid size-5 place-content-center rounded-full bg-emerald-400/20 text-emerald-300"><Icon d="M5 12.5l4 4L19 7" className="size-3.5" /></span>
            {t("mk.hero.published")}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ───────── Three ways to make content ───────── */
export function MakeSection({ t, c }: { t: T; c: SampleCopy }) {
  const cards: { title: MessageKey; body: MessageKey; icon: keyof typeof ICONS; screen: React.ReactNode; label: MessageKey }[] = [
    { title: "mk.make.menuTitle", body: "mk.make.menuBody", icon: "menu", screen: <BeanThereBoard c={c} />, label: "mk.tv.bean" },
    { title: "mk.make.artTitle", body: "mk.make.artBody", icon: "upload", screen: <BrunchArtwork c={c} />, label: "mk.tv.brunch" },
  ];
  return (
    <section className="mk-section" aria-labelledby="make">
      <div className="mx-auto max-w-7xl">
        <div className="text-center max-w-2xl mx-auto">
          <p className="mk-eyebrow">{t("mk.make.eyebrow")}</p>
          <h2 id="make" className="mt-3 text-3xl md:text-[2.75rem] md:leading-[1.1] font-extrabold tracking-tight text-balance">{t("mk.make.title")}</h2>
          <p className="mt-4 text-muted text-lg leading-relaxed">{t("mk.make.intro")}</p>
        </div>
        <div className="mt-14 grid gap-6 lg:grid-cols-3">
          {cards.map((card, i) => (
            <Reveal key={card.title} delay={i * 90} className="card mk-lift p-5 flex flex-col">
              <Tv variant="sm" label={t(card.label)}>{card.screen}</Tv>
              <div className="mt-6 flex items-center gap-3">
                <span className="grid size-10 place-content-center rounded-xl bg-[#2f7bff]/15 text-[#7fb2ff]"><Icon d={ICONS[card.icon]} /></span>
                <h3 className="font-display text-xl font-bold">{t(card.title)}</h3>
              </div>
              <p className="mt-3 text-muted leading-relaxed">{t(card.body)}</p>
            </Reveal>
          ))}
          <Reveal delay={180} className="card mk-lift p-5 flex flex-col">
            <PlaylistMock t={t} />
            <div className="mt-6 flex items-center gap-3">
              <span className="grid size-10 place-content-center rounded-xl bg-[#2f7bff]/15 text-[#7fb2ff]"><Icon d={ICONS.playlist} /></span>
              <h3 className="font-display text-xl font-bold">{t("mk.make.playlistTitle")}</h3>
            </div>
            <p className="mt-3 text-muted leading-relaxed">{t("mk.make.playlistBody")}</p>
          </Reveal>
        </div>
        <SampleNote className="mt-6 justify-center flex">{t("mk.samplesNote")}</SampleNote>
      </div>
    </section>
  );
}

export function PlaylistMock({ t }: { t: T }) {
  const rows: { name: MessageKey; secs: string; img: string; fit?: string }[] = [
    { name: "mk.pl.item1", secs: "10 s", img: SAMPLE_MEDIA.burger },
    { name: "mk.pl.item2", secs: "8 s", img: SAMPLE_MEDIA.pancakes },
    { name: "mk.pl.item3", secs: "8 s", img: SAMPLE_MEDIA.coldBrew },
  ];
  return (
    <div className="rounded-2xl bg-[#f5f8ff] p-4 text-[#0b1220] shadow-[0_20px_40px_rgb(0_0_0/0.35)] aspect-[16/9] flex flex-col" aria-hidden="true">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold">{t("mk.pl.title")}</span>
        <span className="text-[11px] font-semibold text-[#3d4c63]">3 · 26 s</span>
      </div>
      <ul className="mt-3 grid gap-2 flex-1">
        {rows.map((r, i) => (
          <li key={r.name} className="flex items-center gap-3 rounded-xl bg-white px-2.5 py-1.5 border border-[#d5e2f2]">
            <span className="text-[11px] font-bold text-[#7c8aa3] w-3">{i + 1}</span>
            <img src={r.img} alt="" className="h-7 w-12 rounded-md object-cover" loading="lazy" />
            <span className="flex-1 truncate text-[13px] font-semibold">{t(r.name)}</span>
            <span className="text-[11px] font-semibold text-[#3d4c63]">{r.secs}</span>
          </li>
        ))}
      </ul>
      <span className="mt-3 self-end rounded-full bg-[#0066ff] px-4 py-1.5 text-xs font-bold text-white">{t("mk.pl.publish")}</span>
    </div>
  );
}

/* ───────── How it works ───────── */
export function Steps({ t, c }: { t: T; c: SampleCopy }) {
  return (
    <section className="mk-section relative" aria-labelledby="how-title" id="how">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 mk-divider" />
      <div className="mx-auto max-w-7xl">
        <div className="text-center max-w-2xl mx-auto">
          <p className="mk-eyebrow">{t("home.howEyebrow")}</p>
          <h2 id="how-title" className="mt-3 text-3xl md:text-[2.75rem] md:leading-[1.1] font-extrabold tracking-tight">{t("home.howTitle")}</h2>
          <p className="mt-4 text-muted text-lg leading-relaxed">{t("mk.how.intro")}</p>
        </div>
        <ol className="mt-14 grid gap-6 lg:grid-cols-3">
          <Reveal as="li" className="card p-6 flex flex-col">
            <div className="flex-1 grid place-items-center min-h-[260px]">
              <Tv label={t("mk.tv.pair")} className="w-full"><PairingScreen url="pekkotv.com/pair" code="482 910" hint={t("mk.pair.hint")} /></Tv>
            </div>
            <StepText n={1} title={t("home.step1Title")} body={t("home.step1Body")} />
          </Reveal>
          <Reveal as="li" delay={90} className="card p-6 flex flex-col">
            <div className="flex-1 grid place-items-center min-h-[260px]">
              <div className="mk-phone" aria-hidden="true">
                <div className="mk-phone-screen">
                  <p className="mt-2 text-base font-bold">{t("mk.pair.title")}</p>
                  <div className="mk-code-box mt-4">{"482910".split("").map((d, i) => <span key={i}>{d}</span>)}</div>
                  <p className="mt-4 text-[11px] font-semibold text-[#3d4c63]">{t("mk.pair.name")}</p>
                  <div className="mt-1 rounded-lg border border-[#c9d7ee] bg-white px-3 py-2 text-sm font-semibold">{t("mk.hero.screenName")}<span className="mk-caret">|</span></div>
                  <div className="mt-5 rounded-full bg-[#0066ff] py-2.5 text-center text-sm font-bold text-white">{t("mk.pair.connect")}</div>
                </div>
              </div>
            </div>
            <StepText n={2} title={t("home.step2Title")} body={t("home.step2Body")} />
          </Reveal>
          <Reveal as="li" delay={180} className="card p-6 flex flex-col">
            <div className="flex-1 grid place-items-center min-h-[260px] w-full">
              <div className="w-full">
                <Tv label={t("mk.tv.hero")} variant="sm"><EmberOakBoard c={c} /></Tv>
                <div className="mx-auto -mt-4 relative w-fit mk-glass rounded-full px-4 py-2 text-xs font-semibold text-[#dbe6ff] flex items-center gap-2" aria-hidden="true">
                  <span className="mk-live-dot" />{t("mk.publish.live")}
                </div>
              </div>
            </div>
            <StepText n={3} title={t("home.step3Title")} body={t("home.step3Body")} />
          </Reveal>
        </ol>
        <div className="mt-12 text-center">
          <Link href={SIGNUP_HREF} className="btn btn-primary text-base px-7">{t("site.startTrial")}</Link>
        </div>
      </div>
    </section>
  );
}

function StepText({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div className="mt-6">
      <div className="flex items-center gap-3">
        <span className="grid size-9 place-content-center rounded-full bg-gradient-to-br from-[#3d8bff] to-[#1a5cff] font-display text-base font-extrabold text-white shadow-[0_8px_20px_rgb(26_92_255/0.45)]">{n}</span>
        <h3 className="font-display text-xl font-bold">{title}</h3>
      </div>
      <p className="mt-3 text-muted leading-relaxed">{body}</p>
    </div>
  );
}

/* ───────── Branded menu boards ───────── */
/** The menu layouts customers pick from (lib/menu-board-unify LAYOUT_OPTIONS); names reuse the app's own strings. */
const LAYOUTS: { key: MessageKey; cols: string; parts: ("text" | "media")[] }[] = [
  { key: "lo.two-menu-promo.name", cols: "grid-cols-[1fr_1fr_0.86fr]", parts: ["text", "text", "media"] },
  { key: "lo.menu-promo.name", cols: "grid-cols-[2fr_1fr]", parts: ["text", "media"] },
  { key: "lo.split-50.name", cols: "grid-cols-2", parts: ["text", "media"] },
  { key: "lo.two-column.name", cols: "grid-cols-2", parts: ["text", "text"] },
  { key: "lo.triple-column.name", cols: "grid-cols-3", parts: ["text", "text", "text"] },
  { key: "lo.full-screen.name", cols: "grid-cols-1", parts: ["text"] },
];
const FONTS: { name: string; family: string }[] = [
  { name: "Inter", family: "var(--font-sans)" },
  { name: "Noto Serif", family: "var(--font-board-serif)" },
  { name: "Montserrat", family: "var(--font-display)" },
  { name: "Oswald", family: "var(--font-board-condensed)" },
  { name: "Bebas Neue", family: "var(--font-board-poster)" },
  { name: "Lobster", family: "var(--font-board-script)" },
];

function LayoutGlyph({ cols, parts }: { cols: string; parts: ("text" | "media")[] }) {
  return (
    <span className={`grid ${cols} gap-[3px] aspect-video w-16 flex-none rounded-md bg-white/5 p-[4px] border border-white/10`} aria-hidden="true">
      {parts.map((part, i) => (
        <span key={i} className={part === "media" ? "rounded-[3px] bg-gradient-to-br from-[#f2b453] to-[#c8693d]" : "rounded-[3px] bg-[repeating-linear-gradient(180deg,rgb(255_255_255/0.35)_0_2px,transparent_2px_5px)]"} />
      ))}
    </span>
  );
}

export function BrandSection({ t, c }: { t: T; c: SampleCopy }) {
  const points: MessageKey[] = ["mk.brand.p1", "mk.brand.p2", "mk.brand.p3", "mk.brand.p4"];
  return (
    <section className="mk-section" aria-labelledby="brand">
      <div className="mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
        <Reveal>
          <Tv label={t("mk.tv.bean")}><BeanThereBoard c={c} /></Tv>
          <SampleNote className="mt-6">{t("mk.sample")}</SampleNote>
        </Reveal>
        <div>
          <p className="mk-eyebrow">{t("mk.brand.eyebrow")}</p>
          <h2 id="brand" className="mt-3 text-3xl md:text-[2.75rem] md:leading-[1.1] font-extrabold tracking-tight text-balance">{t("mk.brand.title")}</h2>
          <p className="mt-4 text-muted text-lg leading-relaxed">{t("mk.brand.intro")}</p>
          <ul className="mt-6 grid gap-3">{points.map((p) => <Check key={p}>{t(p)}</Check>)}</ul>
          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-[#7fb2ff]">{t("mk.brand.layouts")}</h3>
              <ul className="mt-3 grid gap-2.5">
                {LAYOUTS.map((l) => (
                  <li key={l.key} className="flex items-center gap-3 text-sm text-[#dbe6ff]">
                    <LayoutGlyph cols={l.cols} parts={l.parts} />{t(l.key)}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-[#7fb2ff]">{t("mk.brand.fonts")}</h3>
              <ul className="mt-3 grid grid-cols-2 gap-2">
                {FONTS.map((f) => (
                  <li key={f.name} className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-lg leading-none text-white" style={{ fontFamily: f.family }}>{f.name}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ───────── Video ───────── */
export function VideoSection({ t, c }: { t: T; c: SampleCopy }) {
  const points: MessageKey[] = ["mk.video.p1", "mk.video.p2", "mk.video.p3"];
  return (
    <section className="mk-section relative overflow-hidden" aria-labelledby="video">
      <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 size-[900px] rounded-full opacity-40 blur-3xl" style={{ background: "radial-gradient(circle, rgb(226 65 46 / 0.35), transparent 60%)" }} />
      <div className="relative mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div className="order-2 lg:order-1">
          <p className="mk-eyebrow">{t("mk.video.eyebrow")}</p>
          <h2 id="video" className="mt-3 text-3xl md:text-[2.75rem] md:leading-[1.1] font-extrabold tracking-tight text-balance">{t("mk.video.title")}</h2>
          <p className="mt-4 text-muted text-lg leading-relaxed">{t("mk.video.body")}</p>
          <ul className="mt-6 grid gap-3">{points.map((p) => <Check key={p}>{t(p)}</Check>)}</ul>
        </div>
        <Reveal className="order-1 lg:order-2 relative">
          <Tv label={t("mk.tv.forno")}><FornoRossoBoard c={c} /></Tv>
          <div className="mk-glass absolute -top-4 right-3 flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold text-white" aria-hidden="true">
            <span className="grid size-5 place-content-center rounded-full bg-[#e2412e] text-white"><Icon d="M8 5.5v13l10-6.5z" className="size-3" /></span>
            {t("mk.video.badge")}
          </div>
          <SampleNote className="mt-6">{t("mk.sample")}</SampleNote>
        </Reveal>
      </div>
    </section>
  );
}

/* ───────── Upload your own artwork ───────── */
export function ArtworkSection({ t, c }: { t: T; c: SampleCopy }) {
  const tools = ["Canva", "ChatGPT", "Photoshop"];
  const formats: MessageKey[] = ["mk.art.fmtImages", "mk.art.fmtVideo", "mk.art.fmtDocs"];
  return (
    <section className="mk-section" aria-labelledby="artwork">
      <div className="mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
        <Reveal className="relative">
          <Tv label={t("mk.tv.brunch")}><BrunchArtwork c={c} /></Tv>
          <div className="mk-glass mk-float absolute -bottom-6 right-3 sm:-right-4 flex items-center gap-3 rounded-2xl px-4 py-3" aria-hidden="true">
            <img src={SAMPLE_MEDIA.pancakes} alt="" className="size-10 rounded-lg object-cover" loading="lazy" />
            <span className="leading-tight">
              <span className="block text-sm font-bold text-white">sunday-brunch.png</span>
              <span className="mt-0.5 flex items-center gap-1.5 text-xs text-emerald-300"><Icon d="M5 12.5l4 4L19 7" className="size-3.5" />{t("mk.art.uploaded")}</span>
            </span>
          </div>
          <SampleNote className="mt-10">{t("mk.sample")}</SampleNote>
        </Reveal>
        <div>
          <p className="mk-eyebrow">{t("mk.art.eyebrow")}</p>
          <h2 id="artwork" className="mt-3 text-3xl md:text-[2.75rem] md:leading-[1.1] font-extrabold tracking-tight text-balance">{t("mk.art.title")}</h2>
          <p className="mt-4 text-muted text-lg leading-relaxed">{t("mk.art.body")}</p>
          <p className="mt-7 text-xs font-bold uppercase tracking-[0.14em] text-[#7fb2ff]">{t("mk.art.tools")}</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {tools.map((tool) => <li key={tool} className="mk-pill">{tool}</li>)}
            <li className="mk-pill">{t("mk.art.anyTool")}</li>
          </ul>
          <p className="mt-7 text-xs font-bold uppercase tracking-[0.14em] text-[#7fb2ff]">{t("mk.art.formatsTitle")}</p>
          <ul className="mt-3 grid gap-2.5">{formats.map((f) => <Check key={f}>{t(f)}</Check>)}</ul>
        </div>
      </div>
    </section>
  );
}

/* ───────── Industry examples ───────── */
export function Examples({ t, c }: { t: T; c: SampleCopy }) {
  const items: { title: MessageKey; body: MessageKey; label: MessageKey; board: React.ReactNode; wide?: boolean }[] = [
    { title: "mk.ex.restaurantTitle", body: "mk.ex.restaurantBody", label: "mk.tv.special", board: <EmberOakBoard c={c} special />, wide: true },
    { title: "mk.ex.coffeeTitle", body: "mk.ex.coffeeBody", label: "mk.tv.coldbrew", board: <ColdBrewArtwork c={c} /> },
    { title: "mk.ex.truckTitle", body: "mk.ex.truckBody", label: "mk.tv.truck", board: <SmokeWheelsBoard c={c} /> },
    { title: "mk.ex.petsTitle", body: "mk.ex.petsBody", label: "mk.tv.paws", board: <PawsBoard c={c} /> },
    { title: "mk.ex.retailTitle", body: "mk.ex.retailBody", label: "mk.tv.linden", board: <LindenBoard c={c} /> },
  ];
  return (
    <section className="mk-section" aria-labelledby="examples-title" id="examples">
      <div className="mx-auto max-w-7xl">
        <div className="text-center max-w-2xl mx-auto">
          <p className="mk-eyebrow">{t("mk.ex.eyebrow")}</p>
          <h2 id="examples-title" className="mt-3 text-3xl md:text-[2.75rem] md:leading-[1.1] font-extrabold tracking-tight text-balance">{t("mk.ex.title")}</h2>
          <p className="mt-4 text-muted text-lg leading-relaxed">{t("mk.ex.intro")}</p>
        </div>
        <div className="mt-14 grid gap-6 md:grid-cols-2">
          {items.map((it, i) => (
            <Reveal key={it.title} delay={(i % 2) * 90} className={`card mk-lift p-5 ${it.wide ? "md:col-span-2 md:grid md:grid-cols-[minmax(0,7fr)_minmax(0,3fr)] md:items-center md:gap-8" : ""}`}>
              <Tv variant="sm" label={t(it.label)}>{it.board}</Tv>
              <div className={it.wide ? "mt-5 md:mt-0" : "mt-5"}>
                <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#f5b546]">{t("mk.sample")}</span>
                <h3 className="mt-1 font-display text-xl font-bold">{t(it.title)}</h3>
                <p className="mt-1.5 text-muted">{t(it.body)}</p>
                {it.wide ? (
                  <ul className="mt-5 grid gap-2.5">
                    <Check>{t("mk.brand.p2")}</Check>
                    <Check>{t("mk.brand.p1")}</Check>
                    <Check>{t("mk.brand.p4")}</Check>
                  </ul>
                ) : null}
              </div>
            </Reveal>
          ))}
        </div>
        <SampleNote className="mt-8 flex justify-center text-center">{t("mk.samplesNote")}</SampleNote>
      </div>
    </section>
  );
}

/* ───────── Features grid ───────── */
export function FeatureCards({ t, intro }: { t: T; intro: string }) {
  const items: { title: MessageKey; body: MessageKey; icon: keyof typeof ICONS }[] = [
    { title: "mk.feat.menuTitle", body: "mk.feat.menuBody", icon: "palette" },
    { title: "mk.feat.uploadTitle", body: "mk.feat.uploadBody", icon: "upload" },
    { title: "mk.feat.scheduleTitle", body: "mk.feat.scheduleBody", icon: "clock" },
    { title: "mk.feat.monitorTitle", body: "mk.feat.monitorBody", icon: "monitor" },
    { title: "mk.feat.alertsTitle", body: "mk.feat.alertsBody", icon: "bell" },
    { title: "mk.feat.hardwareTitle", body: "mk.feat.hardwareBody", icon: "tv" },
  ];
  return (
    <section className="mk-section" aria-labelledby="features" id="features-section">
      <div className="mx-auto max-w-7xl">
        <div className="text-center max-w-2xl mx-auto">
          <p className="mk-eyebrow">{t("home.featuresEyebrow")}</p>
          <h2 id="features" className="mt-3 text-3xl md:text-[2.75rem] md:leading-[1.1] font-extrabold tracking-tight text-balance">{t("mk.feat.title")}</h2>
          <p className="mt-4 text-muted text-lg leading-relaxed">{intro}</p>
        </div>
        <ul className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((it, i) => (
            <Reveal as="li" key={it.title} delay={(i % 3) * 80} className="card mk-lift p-6">
              <span className="grid size-11 place-content-center rounded-xl bg-gradient-to-br from-[#2f7bff]/30 to-[#3dd6ff]/10 text-[#9cc3ff] border border-white/10"><Icon d={ICONS[it.icon]} /></span>
              <h3 className="mt-5 font-display text-lg font-bold">{t(it.title)}</h3>
              <p className="mt-2 text-muted leading-relaxed">{t(it.body)}</p>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}

export { ICONS, Icon, Check };
