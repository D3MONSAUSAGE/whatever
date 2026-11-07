"use client";
import { notFound, useSearchParams } from "next/navigation";
import { DashboardShell } from "@/components/shell";
import { MediaLibrary } from "@/components/media-library";
import { PresentationDetailView } from "@/components/presentation-detail";
import { PlaylistEditor } from "@/components/playlist-editor";
import type { MediaItem, PlaylistDetail, PresentationDetail } from "@/lib/api";

const cover = "/marketing/tv-menu.webp";
const poster = "/marketing/media.webp";
const slideB = "/marketing/tv-promo.webp";

const now = "2026-11-06T12:00:00.000Z";

const library: MediaItem[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    fileName: "Quarterly review",
    sizeBytes: 2_400_000,
    createdAt: now,
    url: null,
    kind: "presentation",
    slideCount: 3,
    processingStatus: "ready",
    defaultDurationMs: 10000,
    coverUrl: cover,
    width: 1280,
    height: 720,
    usedIn: [{ id: "pl", name: "Lobby" }],
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    fileName: "Lunch special.png",
    sizeBytes: 840_000,
    createdAt: now,
    url: poster,
    kind: "image",
    usedIn: [],
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    fileName: "Welcome loop.mp4",
    sizeBytes: 8_000_000,
    createdAt: now,
    url: null,
    thumbnailUrl: poster,
    kind: "video",
    durationMs: 12000,
    usedIn: [],
  },
];

const detail: PresentationDetail = {
  id: library[0].id,
  accountId: "org-preview",
  fileName: "Quarterly review",
  mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  sizeBytes: 2_400_000,
  createdAt: now,
  updatedAt: now,
  width: 1280,
  height: 720,
  processingStatus: "ready",
  processingError: null,
  processingDone: 3,
  slideCount: 3,
  defaultDurationMs: 10000,
  coverUrl: cover,
  usedIn: [{ id: "pl", name: "Lobby" }],
  slides: [
    { id: "s1", fileName: "Title", index: 0, url: cover, width: 1280, height: 720, durationMs: 5000 },
    { id: "s2", fileName: "Numbers", index: 1, url: slideB, width: 720, height: 1280, durationMs: null },
    { id: "s3", fileName: "Close", index: 2, url: poster, width: 1280, height: 720, durationMs: null },
  ],
};

const playlist: PlaylistDetail = {
  id: "pl",
  name: "Lobby",
  defaultDurationMs: 10000,
  transition: "none",
  playbackMode: "auto",
  publishedAt: null,
  publishedTransition: null,
  publishedPlaybackMode: null,
  revision: 1,
  updatedAt: now,
  displays: [{ id: "d1", name: "Bar TV", assigned: true }],
  items: [
    {
      id: "i1",
      mediaId: library[0].id,
      fileName: "Quarterly review",
      url: cover,
      kind: "presentation",
      durationMs: 10000,
      position: 0,
      slideCount: 3,
      groupDurationMs: 10000,
      slides: detail.slides,
    },
    {
      id: "i2",
      mediaId: library[1].id,
      fileName: "Lunch special.png",
      url: poster,
      kind: "image",
      durationMs: 8000,
      position: 1,
    },
  ],
};

export default function PresentationPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const view = useSearchParams().get("view") ?? "library";
  return (
    <DashboardShell preview pathOverride={view === "playlist" ? "/dashboard/playlists" : "/dashboard/media"}>
      <div className="p-4 md:p-8">
        {view === "detail" ? <PresentationDetailView fixture={detail} /> : null}
        {view === "playlist" ? <PlaylistEditor seed={playlist} /> : null}
        {view === "library" ? <MediaLibrary fixture={library} /> : null}
      </div>
    </DashboardShell>
  );
}
