"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useApi, type DisplayItem, type PlaylistSummary } from "@/lib/api";
import { ScreenCard, ONLINE_HINT } from "@/components/tv";
import { LoadingBlock, PageHeader, Stat } from "@/components/ui";

export type OverviewFixture = {
  displays: DisplayItem[];
  mediaCount: number;
  playlists: PlaylistSummary[];
  origin?: string;
};

export function OverviewScreen({ fixture }: { fixture?: OverviewFixture }) {
  const displaysLive = useApi<DisplayItem[]>(fixture ? null : "/api/displays", fixture ? undefined : 10_000);
  const mediaLive = useApi<{ id: string }[]>(fixture ? null : "/api/media");
  const playlistsLive = useApi<PlaylistSummary[]>(fixture ? null : "/api/playlists");
  const displayData = fixture?.displays ?? displaysLive.data;
  const mediaCount = fixture ? fixture.mediaCount : mediaLive.data?.length;
  const playlistData = fixture?.playlists ?? playlistsLive.data;
  const playlistError = fixture ? null : playlistsLive.error;
  const [origin, setOrigin] = useState(fixture?.origin ?? "");
  useEffect(() => { if (!fixture?.origin) setOrigin(location.origin); }, [fixture?.origin]);

  if (!displayData || mediaCount == null) {
    return <LoadingBlock label={displaysLive.error || mediaLive.error || "Loading…"} />;
  }

  const online = displayData.filter((item) => item.online).length;
  const playlistCount = playlistData ? playlistData.length : null;
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
    <section>
      <PageHeader
        title="Overview"
        lede={showGuide ? "Four steps from an empty account to a screen on the wall." : "What your screens are showing right now."}
      />
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-8">
        <Stat label="Screens" value={displayData.length} />
        <Stat label="Online" value={online} hint={ONLINE_HINT} />
        <Stat label="Offline" value={displayData.length - online} hint={ONLINE_HINT} />
        <Stat label="Media" value={mediaCount} />
        <Stat className="col-span-2 lg:col-span-1" label="Playlists" value={playlistCount === null ? "—" : playlistCount} hint={playlistError ?? undefined} />
      </div>
      <p className="text-xs text-muted -mt-4 mb-8">{ONLINE_HINT} Screens that have not finished pairing count as offline.</p>

      {showGuide && (
        <ol className="grid gap-3 mb-8">
          {steps.map((step, index) => (
            <li key={step.title} className="card p-4 flex flex-col gap-3 sm:flex-row sm:items-start">
              <span className={`size-8 shrink-0 rounded-full grid place-items-center text-sm font-semibold ${step.done ? "bg-live text-white" : "bg-ink text-white"}`}>{step.done ? "✓" : index + 1}</span>
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
          <h2 className="font-semibold mb-1">Recently updated screens</h2>
          <p className="text-sm text-muted mb-4">Sorted by the latest heartbeat. The picture is the image on the screen, or the first published slide of its playlist.</p>
          <div className="grid gap-4 lg:grid-cols-2">
            {recent.map((display) => (
              <ScreenCard key={display.id} display={display} actions={
                <Link className="btn btn-primary" href={`/dashboard/displays#${display.id}`}>Manage</Link>
              } />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

export default function Overview() {
  return <OverviewScreen />;
}
