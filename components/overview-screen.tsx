"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useApi, type DisplayItem, type PlaylistSummary, type ScheduleItem } from "@/lib/api";
import { LogoMark, WaveBackdrop } from "@/components/brand";
import { IconCalendar, IconChevron, IconImage, IconList, IconTv } from "@/components/icons";
import { ONLINE_HINT } from "@/components/tv";
import { LoadingBlock, Stat } from "@/components/ui";

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

  return (
    <section>
      <div className="banner-dark px-5 py-6 md:px-8 md:py-8 mb-6">
        <WaveBackdrop tone="dark" className="h-[85%]" />
        <div className="relative flex items-center justify-between gap-6">
          <div className="min-w-0">
            <h1 className="text-xs font-semibold uppercase tracking-[0.18em] text-white/80">Overview</h1>
            <h2 className="mt-2 text-2xl md:text-[1.85rem] font-semibold tracking-tight">Welcome back!</h2>
            <p className="mt-1.5 text-sm md:text-[15px] text-white/80 max-w-xl">Here&apos;s what&apos;s happening with your screens today.</p>
          </div>
          <LogoMark className="hidden sm:block size-16 md:size-20 shrink-0" />
        </div>
      </div>

      {!ready || !displayData || mediaCount == null ? (
        <LoadingBlock label={displaysLive.error || mediaLive.error || "Loading…"} />
      ) : (
        <OverviewBody
          displayData={displayData}
          mediaCount={mediaCount}
          playlistCount={playlistData ? playlistData.length : null}
          playlistError={playlistError}
          scheduleCount={scheduleCount}
          scheduleError={fixture ? null : schedulesLive.error}
          origin={origin}
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
}: {
  displayData: DisplayItem[];
  mediaCount: number;
  playlistCount: number | null;
  playlistError: string | null;
  scheduleCount: number | null;
  scheduleError: string | null;
  origin: string;
}) {
  const online = displayData.filter((item) => item.online).length;
  const published = displayData.some((item) => item.media || item.playlist);
  const steps = [
    { title: "Upload media", href: "/dashboard/media", done: mediaCount > 0, body: "Add a JPG, PNG, WebP, or an H.264 MP4." },
    { title: "Create a playlist", href: "/dashboard/playlists", done: (playlistCount ?? 0) > 0, body: "Order the slides. Saving a draft does not change a screen." },
    { title: "Assign a screen", href: "/dashboard/displays", done: displayData.length > 0, body: "Open the player on the TV and enter the code it shows." },
    { title: "Publish", href: "/dashboard/playlists", done: published, body: "Send a playlist, or one image, to the screens you choose." },
  ];
  const showGuide = steps.some((step) => !step.done);
  const recent = displayData.slice().sort((a, b) => {
    const at = a.lastSeenAt ? new Date(a.lastSeenAt).getTime() : 0;
    const bt = b.lastSeenAt ? new Date(b.lastSeenAt).getTime() : 0;
    return bt - at;
  });

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-8">
        <Stat icon={<IconTv />} label="Screens" value={displayData.length} />
        <Stat tone="live" label="Online" value={online} hint={ONLINE_HINT} />
        <Stat tone="danger" label="Offline" value={displayData.length - online} hint={ONLINE_HINT} />
        <Stat icon={<IconImage />} label="Media files" value={mediaCount} />
        <Stat icon={<IconList />} label="Playlists" value={playlistCount === null ? "—" : playlistCount} hint={playlistError ?? undefined} />
        <Stat icon={<IconCalendar />} label="Scheduled" value={scheduleCount === null ? "—" : scheduleCount} hint={scheduleError ?? undefined} />
      </div>
      <p className="text-xs text-muted -mt-4 mb-8">{ONLINE_HINT} Screens that have not finished pairing count as offline.</p>

      {showGuide && (
        <ol className="grid gap-3 mb-8">
          {steps.map((step, index) => (
            <li key={step.title} className="card p-4 flex flex-col gap-3 sm:flex-row sm:items-start">
              <span className={`size-8 shrink-0 rounded-full grid place-items-center text-sm font-semibold ${step.done ? "bg-live-strong text-white" : "bg-primary text-white"}`}>{step.done ? "✓" : index + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold">{step.title}</h2>
                  {step.done ? <span className="badge badge-live">Done</span> : null}
                </div>
                <p className="text-sm text-muted mt-1">
                  {step.body}
                  {step.title === "Assign a screen" && origin ? <> The TV opens <strong className="break-all text-ink">{origin}/player</strong>.</> : null}
                </p>
              </div>
              <Link href={step.href} className="btn btn-quiet sm:shrink-0">{step.done ? "Open" : "Start"}</Link>
            </li>
          ))}
        </ol>
      )}

      {recent.length > 0 && (
        <div>
          <h2 className="font-semibold mb-1">Recent Screens</h2>
          <p className="text-sm text-muted mb-4">Sorted by the latest heartbeat. The picture is the image on the screen, or the first published slide of its playlist.</p>
          <ul className="card divide-y divide-line overflow-hidden">
            {recent.map((display) => {
              const url = display.media?.url || display.playlist?.url || null;
              const presence = screenPresence(display);
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
        </div>
      )}
    </>
  );
}

function screenPresence(display: DisplayItem) {
  if (!display.connected) return { label: "Waiting", dot: "bg-muted", text: "text-muted" };
  if (display.online) return { label: "Online", dot: "bg-live", text: "text-live-ink" };
  return { label: "Offline", dot: "bg-danger", text: "text-danger" };
}

export default function Overview() {
  return <OverviewScreen />;
}
