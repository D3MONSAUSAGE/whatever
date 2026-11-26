"use client";
import { onlineNow } from "@/lib/sync-line";
import Link from "next/link";
import { Fragment, useEffect, useState } from "react";
import { usePeekWeb } from "@/lib/peek-flag";
import { Peek, btnClass } from "@/components/peek/ui";
import { useApi, type DisplayItem, type PlaylistSummary, type ScheduleItem } from "@/lib/api";
import { WaveBackdrop } from "@/components/brand";
import { IconCalendar, IconCard, IconChevron, IconImage, IconList, IconTv } from "@/components/icons";
import { OfflineAttention, offlineScreens, onlineHint } from "@/components/tv";
import { useOptionalNotifications } from "@/components/notifications";
import { useT } from "@/lib/i18n/client";
import type { T } from "@/lib/i18n";
import { LoadState, Stat } from "@/components/ui";
import { SetupTracker } from "@/components/setup-tracker";
import { buildV2State, type OnboardingV2State } from "@/lib/onboarding";

export type OverviewFixture = {
  displays: DisplayItem[];
  mediaCount: number;
  playlists: PlaylistSummary[];
  origin?: string;
  scheduleCount?: number;
  /** Preview only: a fixed onboarding state (otherwise worked out from the fixture data). */
  onboarding?: OnboardingV2State;
};

export function OverviewScreen({ fixture }: { fixture?: OverviewFixture }) {
  const peek = usePeekWeb();
  const displaysLive = useApi<DisplayItem[]>(fixture ? null : "/api/displays", fixture ? undefined : 10_000);
  const mediaLive = useApi<{ id: string }[]>(fixture ? null : "/api/media");
  const playlistsLive = useApi<PlaylistSummary[]>(fixture ? null : "/api/playlists");
  const schedulesLive = useApi<ScheduleItem[]>(fixture ? null : "/api/schedules");
  const displayData = fixture?.displays ?? displaysLive.data;
  const mediaCount = fixture ? fixture.mediaCount : mediaLive.data?.length;
  const playlistData = fixture?.playlists ?? playlistsLive.data;
  const playlistError = fixture ? null : playlistsLive.error;
  const scheduleCount = fixture
    ? (fixture.scheduleCount ?? 0)
    : schedulesLive.data
      ? schedulesLive.data.length
      : null;
  const [origin, setOrigin] = useState(fixture?.origin ?? "");
  useEffect(() => { if (!fixture?.origin) setOrigin(location.origin); }, [fixture?.origin]);

  const ready = Boolean(displayData) && mediaCount != null;
  const t = useT();

  return (
    <section>
      {peek ? (
        // 08 / 09-R-Overview: Peek hero. Same three links and destinations; Add screen is the accent action.
        <div className="ov-hero" data-testid="ov-hero">
          <Peek mood="happy" size={64} />
          <div className="ov-hero-text min-w-0">
            <p className="ov-hero-eyebrow">{t("ov.eyebrow")}</p>
            <h2 className="ov-hero-title">{t("ov.welcome")}</h2>
            <p className="ov-hero-lede">{t("ov.lede")}</p>
          </div>
          <div className="ov-hero-actions">
            <Link href="/dashboard/screens/add#add-screen" className={btnClass("accent", "default", "ov-hero-add")}>{t("screens.add")}</Link>
            <Link href="/dashboard/media/menus?new=1" className={btnClass("tint")}>{t("mb.new")}</Link>
            <Link href="/dashboard/media" className={btnClass("tint")}>{t("ov.upload")}</Link>
          </div>
        </div>
      ) : (
      <div className="banner-dark hero-gradient px-5 py-6 md:px-8 md:py-8 mb-6">
        <WaveBackdrop tone="dark" className="h-[85%]" />
        <div className="relative flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
          <div className="min-w-0">
            <h1 className="text-xs font-semibold uppercase tracking-[0.18em] text-white/80">{t("ov.eyebrow")}</h1>
            <h2 className="mt-2 text-2xl md:text-[1.85rem] font-semibold tracking-tight">{t("ov.welcome")}</h2>
            <p className="mt-1.5 text-sm md:text-[15px] text-white/80 max-w-xl">{t("ov.lede")}</p>
          </div>
          <div className="flex flex-wrap gap-2 w-full lg:w-auto">
            <Link href="/dashboard/media" className="btn btn-quiet min-h-11">{t("ov.upload")}</Link>
            <Link href="/dashboard/media/menus?new=1" className="btn btn-quiet min-h-11">{t("mb.new")}</Link>
            <Link href="/dashboard/screens/add#add-screen" className="btn btn-primary min-h-11">{t("screens.add")}</Link>
          </div>
        </div>
      </div>
      )}

      {!ready || !displayData || mediaCount == null ? (
        <LoadState error={displaysLive.error || mediaLive.error} />
      ) : (
        <OverviewBody
          displayData={displayData}
          mediaCount={mediaCount}
          playlistCount={playlistData ? playlistData.length : null}
          playlistError={playlistError}
          scheduleCount={scheduleCount}
          scheduleError={fixture ? null : schedulesLive.error}
          origin={origin}
          fixture={!!fixture}
          onboarding={fixture?.onboarding}
        />
      )}
    </section>
  );
}

function OverviewBody({
  displayData,
  mediaCount,
  playlistCount,
  playlistError,
  scheduleCount,
  scheduleError,
  origin,
  fixture,
  onboarding,
}: {
  displayData: DisplayItem[];
  mediaCount: number;
  playlistCount: number | null;
  playlistError: string | null;
  scheduleCount: number | null;
  scheduleError: string | null;
  origin: string;
  fixture: boolean;
  onboarding?: OnboardingV2State;
}) {
  const t = useT();
  const peek = usePeekWeb();
  const hint = onlineHint(t);
  const online = displayData.filter(onlineNow).length;
  const offline = offlineScreens(displayData).length;
  const published = displayData.some((item) => item.media || item.playlist);
  const setupFixture: OnboardingV2State | undefined = fixture ? onboarding ?? fixtureSetup(displayData, mediaCount, playlistCount ?? 0, published) : undefined;
  const recent = displayData.slice().sort((a, b) => {
    const at = a.lastSeenAt ? new Date(a.lastSeenAt).getTime() : 0;
    const bt = b.lastSeenAt ? new Date(b.lastSeenAt).getTime() : 0;
    return bt - at;
  });

  const Wrap = peek ? "div" : Fragment;
  return (
    <Wrap {...(peek ? { className: "ov-body" } : {})}>
      <NeedsAttention displays={displayData} />
      {/* Redesign phase 2: each count opens the page it counts. */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-8">
        <Link href="/dashboard/screens" className="ps-stat-link"><Stat icon={<IconTv />} label={t("ov.screens")} value={displayData.length} /></Link>
        <Link href="/dashboard/screens" className="ps-stat-link"><Stat tone="live" label={t("ov.online")} value={online} hint={hint} /></Link>
        <Link href="/dashboard/screens" className="ps-stat-link"><Stat tone="danger" label={t("ov.offline")} value={offline} hint={hint} /></Link>
        <Link href="/dashboard/media" className="ps-stat-link"><Stat icon={<IconImage />} label={t("ov.media")} value={mediaCount} /></Link>
        <Link href="/dashboard/playlists" className="ps-stat-link"><Stat icon={<IconList />} label={t("ov.playlists")} value={playlistCount === null ? "—" : playlistCount} hint={playlistError ?? undefined} /></Link>
        <Link href="/dashboard/schedule" className="ps-stat-link"><Stat icon={<IconCalendar />} label={t("ov.scheduled")} value={scheduleCount === null ? "—" : scheduleCount} hint={scheduleError ?? undefined} /></Link>
      </div>
      <p className="text-xs text-muted -mt-4 mb-8">{hint} {t("ov.waitingNotOffline")}</p>

      <SetupTracker fixture={setupFixture} origin={origin} />

      {recent.length > 0 && (
        <div>
          <h2 className="font-semibold mb-1">{t("ov.recent")}</h2>
          <p className="text-sm text-muted mb-4">{t("ov.recentHelp")}</p>
          <ul className="card divide-y divide-line overflow-hidden">
            {recent.map((display) => {
              const url = display.media?.url || display.playlist?.url || null;
              const presence = screenPresence(display, t);
              return (
                <li key={display.id}>
                  <Link href={`/dashboard/displays#${display.id}`} className="flex items-center gap-3 px-3 py-3 hover:bg-paper">
                    <span className="relative block w-16 sm:w-24 shrink-0 aspect-video rounded-lg overflow-hidden bg-ink">
                      {url ? <img src={url} alt="" className="absolute inset-0 size-full object-contain" /> : (
                        <span className="absolute inset-0 grid place-items-center text-white [&_svg]:size-5"><IconTv /></span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="font-semibold block truncate">{display.name}</span>
                      <span className={`mt-0.5 inline-flex items-center gap-1.5 text-sm font-medium ${presence.text}`}>
                        <span className={`size-2 rounded-full ${presence.dot}`} aria-hidden />
                        {presence.label}
                      </span>
                    </span>
                    <IconChevron />
                  </Link>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-sm">
            <Link href="/dashboard/analytics" className="font-semibold text-primary underline underline-offset-4" data-testid="overview-activity-link">{t("ov.activityLink")}</Link>
          </p>
        </div>
      )}
    </Wrap>
  );
}

/** "Needs attention": offline screens (live state) and a billing issue, mirroring the bell. */
function NeedsAttention({ displays }: { displays: DisplayItem[] }) {
  const t = useT();
  const nc = useOptionalNotifications();
  const billing = nc?.billing ?? null;
  const offline = offlineScreens(displays).length;
  if (!offline && !billing) return <OfflineAttention displays={displays} />;
  return (
    <section className="card p-4 md:p-5 mb-6 grid gap-3" aria-labelledby="ov-attention" data-testid="needs-attention">
      <div>
        <h2 id="ov-attention" className="font-semibold">{t("nc.attention")}</h2>
        <p className="text-sm text-muted">{t("ov.attentionHint")}</p>
      </div>
      {billing ? (
        <div className="ps-callout is-warn">
          <IconCard />
          <p className="min-w-0"><strong>{t("nc.billingTitle")}.</strong> {billing.message}</p>
          <Link href={billing.href ?? "/dashboard/billing"} className="btn btn-quiet min-h-10 shrink-0">{t("ov.review")}</Link>
        </div>
      ) : null}
      <OfflineAttention displays={displays} />
    </section>
  );
}

function screenPresence(display: DisplayItem, t: T) {
  if (!display.connected) return { label: t("tv.waiting"), dot: "bg-muted", text: "text-muted" };
  if (display.online) return { label: t("tv.online"), dot: "bg-live", text: "text-live-ink" };
  return { label: t("tv.offline"), dot: "bg-danger", text: "text-danger" };
}

export default function Overview() {
  return <OverviewScreen />;
}

/** Preview only: the same steps the server derives, worked out from fixture data. */
function fixtureSetup(displays: DisplayItem[], media: number, playlists: number, published: boolean): OnboardingV2State {
  const confirmed = displays.some((d) => d.online && (d.media || d.playlist));
  return buildV2State({
    milestones: {},
    live: { first_menu: media > 0, preview_menu: media > 0, screen: displays.length > 0, show_on_tv: published, playlists: playlists > 0 },
    confirmed, dismissed: false, completedAt: null, legacyFinished: false, celebratedAt: "fixture", previewTarget: null,
  });
}
