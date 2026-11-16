"use client";
import { onlineNow } from "@/lib/sync-line";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useApi, type OnboardingState, type DisplayItem, type PlaylistSummary, type ScheduleItem } from "@/lib/api";
import { LogoMark, WaveBackdrop } from "@/components/brand";
import { IconCalendar, IconChevron, IconImage, IconList, IconTv } from "@/components/icons";
import { OfflineAlert, offlineScreens, onlineHint } from "@/components/tv";
import { useT } from "@/lib/i18n/client";
import type { T } from "@/lib/i18n";
import { LoadState, Stat } from "@/components/ui";
import { SetupTracker } from "@/components/setup-tracker";

export type OverviewFixture = {
  displays: DisplayItem[];
  mediaCount: number;
  playlists: PlaylistSummary[];
  origin?: string;
  scheduleCount?: number;
};

export function OverviewScreen({ fixture }: { fixture?: OverviewFixture }) {
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
      <div className="banner-dark px-5 py-6 md:px-8 md:py-8 mb-6">
        <WaveBackdrop tone="dark" className="h-[85%]" />
        <div className="relative flex items-center justify-between gap-6">
          <div className="min-w-0">
            <h1 className="text-xs font-semibold uppercase tracking-[0.18em] text-white/80">{t("ov.eyebrow")}</h1>
            <h2 className="mt-2 text-2xl md:text-[1.85rem] font-semibold tracking-tight">{t("ov.welcome")}</h2>
            <p className="mt-1.5 text-sm md:text-[15px] text-white/80 max-w-xl">{t("ov.lede")}</p>
          </div>
          <LogoMark className="hidden sm:block size-16 md:size-20 shrink-0" />
        </div>
      </div>

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
}: {
  displayData: DisplayItem[];
  mediaCount: number;
  playlistCount: number | null;
  playlistError: string | null;
  scheduleCount: number | null;
  scheduleError: string | null;
  origin: string;
  fixture: boolean;
}) {
  const t = useT();
  const hint = onlineHint(t);
  const online = displayData.filter(onlineNow).length;
  const offline = offlineScreens(displayData).length;
  const published = displayData.some((item) => item.media || item.playlist);
  const setupFixture: OnboardingState | undefined = fixture ? fixtureSetup(displayData, mediaCount, playlistCount ?? 0, published) : undefined;
  const recent = displayData.slice().sort((a, b) => {
    const at = a.lastSeenAt ? new Date(a.lastSeenAt).getTime() : 0;
    const bt = b.lastSeenAt ? new Date(b.lastSeenAt).getTime() : 0;
    return bt - at;
  });

  return (
    <>
      <OfflineAlert displays={displayData} linkToDisplays />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-8">
        <Stat icon={<IconTv />} label={t("ov.screens")} value={displayData.length} />
        <Stat tone="live" label={t("ov.online")} value={online} hint={hint} />
        <Stat tone="danger" label={t("ov.offline")} value={offline} hint={hint} />
        <Stat icon={<IconImage />} label={t("ov.media")} value={mediaCount} />
        <Stat icon={<IconList />} label={t("ov.playlists")} value={playlistCount === null ? "—" : playlistCount} hint={playlistError ?? undefined} />
        <Stat icon={<IconCalendar />} label={t("ov.scheduled")} value={scheduleCount === null ? "—" : scheduleCount} hint={scheduleError ?? undefined} />
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
                  <Link href={`/dashboard/screens/${display.id}`} className="flex items-center gap-3 px-3 py-3 hover:bg-paper">
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
        </div>
      )}
    </>
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
function fixtureSetup(displays: DisplayItem[], media: number, playlists: number, published: boolean): OnboardingState {
  const playing = displays.some((d) => d.online && (d.media || d.playlist));
  const steps: OnboardingState["steps"] = [
    { id: "account", done: true },
    { id: "business", done: displays.length > 0 },
    { id: "location", done: displays.length > 0 },
    { id: "screen", done: displays.length > 0 },
    { id: "media", done: media > 0 },
    { id: "playlist", done: playlists > 0 },
    { id: "publish", done: published },
    { id: "playing", done: playing, confirmed: false },
  ];
  const completed = steps.filter((x) => x.done).length;
  const finished = completed === steps.length;
  return { steps, completed, total: steps.length, nextStep: steps.find((x) => !x.done)?.id ?? null, dismissed: false, finished, show: !finished, firstLocationId: null };
}
