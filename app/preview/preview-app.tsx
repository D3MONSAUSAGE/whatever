"use client";
import { useSearchParams } from "next/navigation";
import { DashboardShell } from "@/components/shell";
import { OverviewScreen } from "@/components/overview-screen";
import { MediaLibrary } from "@/components/media-library";
import { Playlists } from "@/components/playlist-list";
import { Displays } from "@/components/displays-screen";
import { ScheduleScreen, type ScheduleFixture } from "@/components/schedule-screen";
import type { DisplayItem, MediaItem, PlaylistSummary } from "@/lib/api";

const lunch = poster("Lunch menu", "#1c3d32");
const dinner = poster("Dinner menu", "#3d2a1c");
const video = poster("Clip", "#1c243d");

const displays: DisplayItem[] = [
  {
    id: "screen-front",
    name: "Front counter",
    connected: true,
    online: true,
    lastSeenAt: new Date().toISOString(),
    media: null,
    playlist: { id: "pl-lunch", name: "Lunch loop", url: lunch },
    playerError: null,
  },
  {
    id: "screen-bar",
    name: "Bar TV",
    connected: true,
    online: false,
    lastSeenAt: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
    media: { id: "media-dinner", fileName: "dinner-menu.png", url: dinner },
    playlist: null,
    playerError: null,
  },
  {
    id: "screen-patio",
    name: "Patio",
    connected: false,
    online: false,
    lastSeenAt: null,
    media: null,
    playlist: null,
  },
];

const media: MediaItem[] = [
  { id: "media-lunch", fileName: "lunch-menu.png", sizeBytes: 240_000, createdAt: "2026-10-28T15:00:00.000Z", url: lunch, kind: "image", usedIn: [{ id: "pl-lunch", name: "Lunch loop" }] },
  { id: "media-dinner", fileName: "dinner-menu.png", sizeBytes: 1_800_000, createdAt: "2026-10-28T12:00:00.000Z", url: dinner, kind: "image", usedIn: [] },
  { id: "media-clip", fileName: "specials.mp4", sizeBytes: 18_400_000, createdAt: "2026-10-27T18:00:00.000Z", url: null, thumbnailUrl: video, kind: "video", durationMs: 42_000, width: 1920, height: 1080, usedIn: [{ id: "pl-lunch", name: "Lunch loop" }] },
  { id: "media-breakfast", fileName: "breakfast.png", sizeBytes: 860_000, createdAt: "2026-10-26T09:00:00.000Z", url: poster("Breakfast", "#24301c"), kind: "image", usedIn: [] },
];

const playlists: PlaylistSummary[] = [
  {
    id: "pl-lunch",
    name: "Lunch loop",
    defaultDurationMs: 10000,
    transition: "fade",
    slideCount: 3,
    displayCount: 1,
    displayNames: ["Front counter"],
    thumbnailUrl: lunch,
    publishedAt: "2026-10-28T16:00:00.000Z",
    updatedAt: "2026-10-28T16:00:00.000Z",
    revision: 2,
  },
  {
    id: "pl-happy",
    name: "Happy hour",
    defaultDurationMs: 8000,
    transition: "none",
    slideCount: 2,
    displayCount: 0,
    displayNames: [],
    thumbnailUrl: dinner,
    publishedAt: null,
    updatedAt: "2026-10-28T17:00:00.000Z",
    revision: 0,
  },
];

export function PreviewApp() {
  const params = useSearchParams();
  const screen = params.get("screen") || "overview";
  const empty = params.get("empty") === "1";
  const path = screen === "overview" ? "/dashboard" : `/dashboard/${screen}`;
  const overview = empty
    ? { displays: [] as typeof displays, mediaCount: 0, playlists: [] as typeof playlists, scheduleCount: 0, origin: "https://seemple.example" }
    : { displays, mediaCount: media.length, playlists, scheduleCount: 1, origin: "https://seemple.example" };
  return (
    <DashboardShell preview pathOverride={path}>
      {screen === "media" ? <MediaLibrary fixture={media} /> : null}
      {screen === "playlists" ? <Playlists fixture={playlists} /> : null}
      {screen === "displays" ? <Displays fixture={displays} /> : null}
      {screen === "schedule" ? <ScheduleScreen fixture={scheduleFixture} /> : null}
      {screen === "overview" ? <OverviewScreen fixture={overview} /> : null}
    </DashboardShell>
  );
}

const scheduleFixture: ScheduleFixture = {
  locations: [
    { id: "loc-main", name: "Main location", timezone: "UTC", displayCount: 0 },
    { id: "loc-kitchen", name: "Kitchen", timezone: "America/Los_Angeles", displayCount: 2 },
  ],
  groups: [
    { id: "group-front", name: "Front of house", displayIds: ["screen-front", "screen-bar"], updatedAt: "2026-10-28T18:00:00.000Z" },
  ],
  schedules: [
    {
      id: "sched-lunch",
      name: "Weekday lunch",
      playlistId: "pl-lunch",
      playlistName: "Lunch loop",
      displayId: null,
      displayName: null,
      groupId: "group-front",
      groupName: "Front of house",
      weekdays: [1, 2, 3, 4, 5],
      startTime: "11:00",
      endTime: "14:00",
      startsOn: null,
      endsOn: null,
      priority: 0,
      enabled: true,
      updatedAt: "2026-10-28T18:00:00.000Z",
    },
  ],
  displays: [
    { ...displays[0], location: { id: "loc-kitchen", name: "Kitchen", timezone: "America/Los_Angeles" } },
    { ...displays[1], location: { id: "loc-kitchen", name: "Kitchen", timezone: "America/Los_Angeles" } },
  ],
  playlists,
  preview: {
    displayId: "screen-front",
    timezone: "America/Los_Angeles",
    from: "2026-10-28T07:00:00.000Z",
    until: "2026-10-30T07:00:00.000Z",
    resolution: "A rule on this screen beats a rule on a group. Higher priority wins next. The most recently updated rule wins next. The lowest id breaks a remaining tie.",
    defaultAssignment: { playlistId: "pl-lunch", playlistName: "Lunch loop", mediaId: null, mediaName: null },
    segments: [
      { start: "2026-10-28T07:00:00.000Z", end: "2026-10-28T18:00:00.000Z", date: "2026-10-28", source: "default", scheduleId: null, scheduleName: null, playlistId: "pl-lunch", playlistName: "Lunch loop", target: null, priority: null },
      { start: "2026-10-28T18:00:00.000Z", end: "2026-10-28T21:00:00.000Z", date: "2026-10-28", source: "schedule", scheduleId: "sched-lunch", scheduleName: "Weekday lunch", playlistId: "pl-happy", playlistName: "Happy hour", target: "group", priority: 0 },
      { start: "2026-10-28T21:00:00.000Z", end: "2026-10-29T07:00:00.000Z", date: "2026-10-28", source: "default", scheduleId: null, scheduleName: null, playlistId: "pl-lunch", playlistName: "Lunch loop", target: null, priority: null },
      { start: "2026-10-29T07:00:00.000Z", end: "2026-10-29T18:00:00.000Z", date: "2026-10-29", source: "default", scheduleId: null, scheduleName: null, playlistId: "pl-lunch", playlistName: "Lunch loop", target: null, priority: null },
      { start: "2026-10-29T18:00:00.000Z", end: "2026-10-29T21:00:00.000Z", date: "2026-10-29", source: "schedule", scheduleId: "sched-lunch", scheduleName: "Weekday lunch", playlistId: "pl-happy", playlistName: "Happy hour", target: "group", priority: 0 },
      { start: "2026-10-29T21:00:00.000Z", end: "2026-10-30T07:00:00.000Z", date: "2026-10-29", source: "default", scheduleId: null, scheduleName: null, playlistId: "pl-lunch", playlistName: "Lunch loop", target: null, priority: null },
    ],
  },
};

function poster(label: string, color: string) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='640' height='360'><rect fill='${color}' width='100%' height='100%'/><text x='50%' y='54%' fill='white' font-family='sans-serif' font-size='36' text-anchor='middle'>${label}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
