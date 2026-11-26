"use client";
import { buildV2State, type OnboardingV2State } from "@/lib/onboarding";
import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { DashboardShell } from "@/components/shell";
import { OverviewScreen } from "@/components/overview-screen";
import { MediaLibrary } from "@/components/media-library";
import { Playlists } from "@/components/playlist-list";
import { Displays } from "@/components/displays-screen";
import { MyScreens, ScreenGroups, ScreenWorkspace } from "@/components/my-screens";
import type { AccountStudio } from "@/lib/layout-account";
import { sampleLayout, type LayoutDocument, type LayoutTemplate } from "@/lib/layout-studio";
import { designById, designDocument } from "@/lib/menu-designs";
import { ScheduleScreen, type ScheduleFixture } from "@/components/schedule-screen";
import type { DisplayItem, MediaItem, PlaylistSummary } from "@/lib/api";
import { ShowOnScreens } from "@/components/show-on-screens";
import { SHOW_ON_SCREENS_STYLES } from "@/lib/show-on-screens";
import { ContentHub } from "@/components/content-hub";
import { MenuBoards, type MenuFixture } from "@/components/menu-boards";
import { PromoSlides, type Promo } from "@/components/promo-slides";
import { BrandKit } from "@/components/brand-kit";
import AccountHub from "@/app/dashboard/account/page";
import { sampleMenu } from "@/lib/menu-templates";
import { samplePromo } from "@/lib/promo-templates";
import { UploadProgress, type UploadJob } from "@/components/uploads";
import { useToast } from "@/components/toast";
import { UPLOAD_SUCCESS_TOAST_MS } from "@/lib/upload-notice";
import type { ScreenLibrary } from "@/components/screen-actions";
import { AlertsScreen } from "@/components/alerts";
import { PresentationDetailView } from "@/components/presentation-detail";
import type { PresentationDetail } from "@/lib/api";
import type { AlertItem } from "@/lib/api";
import type { NotificationsFixture } from "@/components/notifications";
import { AnalyticsScreen, type AnalyticsFixture } from "@/components/analytics-screen";
import { PeekKit } from "@/components/peek/kit";

// Fixed timestamps so server and client render the same text.
const analyticsFixture: AnalyticsFixture = {
  summary: {
    screens: { total: 3, online: 2, offline: 1, neverConnected: 0 },
    uptime: { pct7: 97.4, pct30: 98.1, coverageFrom: "2026-09-01T15:00:00Z" },
    playback: { confirmed: 2, unconfirmed: 0, nothingAssigned: 1 },
    playlists: { total: 4, published: 3, publishes30d: 12 },
    schedules: { total: 5, enabled: 4, changes30d: 6 },
    media: { count: 38, images: 31, videos: 7, bytes: 412_000_000, inPlaylists: 24, unused: 14 },
    bandwidth: null,
  },
  uptime: {
    days: 7, coverageFrom: "2026-09-01T15:00:00Z", overall: { uptimePct: 97.4 },
    screens: [
      { id: "s1", name: "Front counter", online: true, lastSeenAt: "2026-11-17T18:00:00Z", uptimePct: 99.6, onlineSeconds: 0, windowSeconds: 0, daily: [100, 100, 99, 100, 100, 98, 100].map((v, i) => ({ date: `2026-11-1${i}`, uptimePct: v })) },
      { id: "s2", name: "Drive-thru", online: false, lastSeenAt: "2026-11-17T14:20:00Z", uptimePct: 88.2, onlineSeconds: 0, windowSeconds: 0, daily: [100, 92, 40, 100, 100, 95, 70].map((v, i) => ({ date: `2026-11-1${i}`, uptimePct: v })) },
    ],
  },
  activity: [
    { at: "2026-11-17T17:10:00Z", kind: "playlist.published", subjectId: null, subjectName: "Lunch specials", detail: {} },
    { at: "2026-11-17T16:00:00Z", kind: "schedule.updated", subjectId: null, subjectName: "Weekday lunch", detail: {} },
    { at: "2026-11-16T20:30:00Z", kind: "media.uploaded", subjectId: null, subjectName: "burger.jpg", detail: {} },
  ],
};

const lunch = poster("Lunch menu", "#1c3d32");
const dinner = poster("Dinner menu", "#3d2a1c");
const video = poster("Clip", "#1c243d");

const displays: DisplayItem[] = [
  {
    id: "screen-front",
    name: "Front counter",
    connected: true,
    online: true,
    // Within the 90 s server online window. Status uses display.online, not this timestamp.
    lastSeenAt: new Date(Date.now() - 20_000).toISOString(),
    media: null,
    playlist: { id: "pl-lunch", name: "Lunch loop", url: lunch },
    playerError: null,
  },
  {
    id: "screen-bar",
    name: "Bar TV",
    connected: true,
    online: false,
    lastSeenAt: "2026-11-01T11:00:00.000Z",
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

const deck = poster("Demo Café", "#5a2a2a");
const media: MediaItem[] = [
  { id: "media-logo", fileName: "demo-cafe-logo.png", sizeBytes: 48_000, createdAt: "2026-10-28T10:00:00.000Z", url: poster("Logo", "#c8102e"), kind: "image", usedIn: [] },
  { id: "media-lunch", fileName: "demo-cafe-lunch.png", sizeBytes: 240_000, createdAt: "2026-10-28T15:00:00.000Z", url: lunch, kind: "image", usedIn: [{ id: "pl-lunch", name: "Lunch loop" }] },
  { id: "media-dinner", fileName: "demo-cafe-dinner.png", sizeBytes: 1_800_000, createdAt: "2026-10-28T12:00:00.000Z", url: dinner, kind: "image", usedIn: [] },
  { id: "media-clip", fileName: "demo-cafe-specials.mp4", sizeBytes: 18_400_000, createdAt: "2026-10-27T18:00:00.000Z", url: null, thumbnailUrl: video, kind: "video", durationMs: 42_000, width: 1920, height: 1080, usedIn: [{ id: "pl-lunch", name: "Lunch loop" }] },
  { id: "media-silent", fileName: "demo-cafe-patio.mp4", sizeBytes: 9_100_000, createdAt: "2026-10-27T11:00:00.000Z", url: null, thumbnailUrl: null, kind: "video", durationMs: 18_000, usedIn: [] },
  { id: "media-breakfast", fileName: "demo-cafe-breakfast.png", sizeBytes: 860_000, createdAt: "2026-10-26T09:00:00.000Z", url: poster("Breakfast", "#24301c"), kind: "image", usedIn: [] },
  { id: "media-deck", fileName: "demo-cafe-menu.pptx", sizeBytes: 4_200_000, createdAt: "2026-10-25T09:00:00.000Z", url: null, thumbnailUrl: deck, coverUrl: deck, kind: "presentation", slideCount: 8, usedIn: [] },
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

const workspaceLibrary: ScreenLibrary = {
  media,
  playlists,
  boards: [{ id: "board-lunch", name: "Demo Café lunch board", template: "menu-promo-67", thumbnailUrl: lunch }],
  menus: [{ id: "menu-dinner", name: "Demo Café dinner menu", playlistId: "pl-menu", imageUrl: dinner }],
};

const demoGroups = {
  groups: [{ id: "group-front", name: "Demo Café front", displayIds: ["screen-front", "screen-bar"], updatedAt: "2026-10-28T18:00:00.000Z" }],
  displays,
};

function previewPath(screen: string) {
  if (screen === "studio") return "/dashboard/media/menus";
  if (screen === "content") return "/dashboard/content";
  if (screen === "groups") return "/dashboard/screens/groups";
  if (screen === "workspace") return "/dashboard/screens/screen-front";
  if (screen === "presentations") return "/dashboard/media?kind=presentation";
  if (screen.startsWith("presentation-")) return "/dashboard/media?kind=presentation";
  if (screen === "media" || screen === "upload" || screen === "upload-error") return "/dashboard/media";
  if (screen === "playlists") return "/dashboard/playlists";
  if (screen === "overview") return "/dashboard";
  if (screen === "menus" || screen === "menu-edit" || screen.startsWith("unify-") || screen.startsWith("templates")) return "/dashboard/media/menus";
  if (screen === "promos" || screen === "promo-edit") return "/dashboard/media/promos";
  if (screen === "brand-kit") return "/dashboard/account/brand-kit";
  if (screen === "screens") return "/dashboard/screens";
  if (screen === "account") return "/dashboard/account";
  if (screen === "notifications") return "/dashboard/notifications";
  if (screen === "peek-kit") return "/dashboard/screens";
  return `/dashboard/${screen}`;
}


const contentFixture = {
  recent: [
    { id: "media-lunch", name: "demo-cafe-lunch.png", href: "/dashboard/media", kind: "media" as const, kindLabel: "Media" },
    { id: "media-clip", name: "demo-cafe-specials.mp4", href: "/dashboard/media", kind: "media" as const, kindLabel: "Media" },
    { id: "board-lunch", name: "Demo Café lunch board", href: "/dashboard/media/menus?board=board-lunch", kind: "menus" as const, kindLabel: "Menu boards" },
    { id: "menu-dinner", name: "Demo Café dinner menu", href: "/dashboard/media/menus?board=menu-dinner", kind: "menus" as const, kindLabel: "Menu boards" },
    { id: "promo-happy", name: "Happy hour", href: "/dashboard/media/promos?promo=promo-happy", kind: "promotions" as const, kindLabel: "Promotions" },
    { id: "promo-deal", name: "2 tacos + drink", href: "/dashboard/media/promos?promo=promo-deal", kind: "promotions" as const, kindLabel: "Promotions" },
    { id: "pl-lunch", name: "Lunch loop", href: "/dashboard/playlists/pl-lunch", kind: "playlists" as const, kindLabel: "Playlists" },
    { id: "pl-happy", name: "Happy hour", href: "/dashboard/playlists/pl-happy", kind: "playlists" as const, kindLabel: "Playlists" },
    { id: "media-deck", name: "demo-cafe-menu.pptx", href: "/dashboard/media/presentations/media-deck", kind: "presentations" as const, kindLabel: "Presentations" },
  ],
};

/** Notification center fixture: one screen offline now, one recovery, a flapping screen, a burst, and a billing notice. */
function previewAlerts(): AlertItem[] {
  const now = Date.now();
  const at = (min: number) => new Date(now - min * 60_000).toISOString();
  let i = 0;
  const a = (kind: AlertItem["kind"], screenId: string, screenName: string, since: number, when: number, read = false, offlineSeconds: number | null = null): AlertItem =>
    ({ id: `alert-${++i}`, kind, screenId, screenName, offlineSince: at(since), at: at(when), offlineSeconds, read, email: "off" } as AlertItem);
  const burst = [["screen-front", "Front counter", 3], ["screen-kitchen", "Kitchen", 1], ["screen-lounge", "Lounge", 4], ["screen-office", "Office", 2]] as const;
  return [
    a("screen.recovered", "screen-kitchen", "Kitchen", 200, 188, false, 720),
    a("screen.offline", "screen-kitchen", "Kitchen", 200, 195),
    ...[300, 420, 600].flatMap((m) => [a("screen.recovered", "screen-lounge", "Lounge", m, m - 6, true, 360), a("screen.offline", "screen-lounge", "Lounge", m, m - 3, true)]),
    ...burst.flatMap(([id, name, d]) => [a("screen.recovered", id, name, 3 * 1440 + d, 3 * 1440 - 15, true, 900), a("screen.offline", id, name, 3 * 1440 + d, 3 * 1440 - 2, true)]),
    a("screen.offline", "screen-bar", "Bar TV", 16 * 1440, 16 * 1440 - 10),
  ];
}
const previewNotifications = (): NotificationsFixture => ({
  alerts: previewAlerts(),
  entitlements: { warning: { message: "Your last payment didn't go through. Update your card to keep 6 screens playing.", action: null }, rollout_notice: null },
});

/** ?onboarding=fresh|first|tv-first|done-required|dismissed: fixed onboarding v2 states for the Overview checklist. */
function previewOnboarding(kind: string | null): OnboardingV2State | undefined {
  const at = "2026-11-20T10:00:00.000Z";
  const base = { confirmed: false, dismissed: false, completedAt: null, legacyFinished: false, celebratedAt: null, previewTarget: null };
  switch (kind) {
    case "fresh": return buildV2State({ ...base, milestones: {}, live: {} });
    case "first": return buildV2State({ ...base, milestones: { first_menu: at }, live: {}, previewTarget: { kind: "menu_board", menuId: "menu-lunch" } });
    case "tv-first": return buildV2State({ ...base, milestones: { screen: at }, live: {} });
    case "dismissed": return buildV2State({ ...base, milestones: { first_menu: at }, live: {}, dismissed: true, celebratedAt: at });
    case "progress": return buildV2State({ ...base, milestones: { first_menu: at, preview_menu: at, screen: at, show_on_tv: at, schedules: at }, live: {}, confirmed: true, celebratedAt: at, previewTarget: { kind: "menu_board", menuId: "menu-lunch" } });
    default: return undefined;
  }
}

export function PreviewApp() {
  const params = useSearchParams();
  const screen = params.get("screen") || "overview";
  const empty = params.get("empty") === "1";
  const panelParam = params.get("panel");
  const panel = panelParam === "change" || panelParam === "upload" || panelParam === "create" || panelParam === "playlist" || panelParam === "schedule" ? panelParam : null;
  const workspaceId = params.get("id") === "screen-bar" || params.get("id") === "screen-patio" ? params.get("id")! : "screen-front";
  const foundDisplay = displays.find((item) => item.id === workspaceId) ?? displays[0];
  // E5-F2: ?unpaired=1 shows the screen right after its TV was unpaired (last heartbeat and playback still recent).
  const workspaceDisplay = params.get("unpaired") === "1"
    ? { ...foundDisplay, connected: false, online: false, lastSeenAt: new Date().toISOString(), reportedState: "playing" as const, playingAt: new Date().toISOString() }
    : params.get("orientation") === "portrait"
      // Vertical screen whose TV still reports a horizontal picture (shows the setting and the mismatch hint).
      ? { ...foundDisplay, orientation: "portrait" as const, reportedViewport: { width: 1920, height: 1080, at: new Date().toISOString() } }
      : foundDisplay;
  const path = screen === "workspace" ? `/dashboard/screens/${workspaceId}` : previewPath(screen);
  const onboarding = previewOnboarding(params.get("onboarding"));
  const overview = empty || onboarding
    ? { displays: [] as typeof displays, mediaCount: 0, playlists: [] as typeof playlists, scheduleCount: 0, origin: "https://seemple.example", onboarding }
    : { displays, mediaCount: media.length, playlists, scheduleCount: 1, origin: "https://seemple.example" };
  return (
    <DashboardShell preview pathOverride={path} notifications={params.get("nc") === "0" ? undefined : previewNotifications()}>
      {screen === "notifications" ? <AlertsScreen fixture={previewAlerts()} /> : null}
      {screen === "media" ? <MediaLibrary fixture={media} pathOverride="/dashboard/media" /> : null}
      {screen === "presentations" ? <MediaLibrary fixture={media} pathOverride="/dashboard/media?kind=presentation" /> : null}
      {screen === "presentation-detail" ? <PresentationDetailView fixture={presentationFixture("ready")} /> : null}
      {screen === "presentation-processing" ? <PresentationDetailView fixture={presentationFixture("processing")} /> : null}
      {screen === "playlists" ? <Playlists fixture={playlists} pathOverride="/dashboard/playlists" /> : null}
      {screen === "displays" ? <Displays fixture={displays} /> : null}
      {screen === "schedule" ? <ScheduleScreen fixture={scheduleFixture} /> : null}
      {screen === "overview" ? <OverviewScreen fixture={overview} /> : null}
      {screen === "analytics" ? <AnalyticsScreen fixture={analyticsFixture} /> : null}
      {screen === "workspace" ? <ScreenWorkspace id={workspaceId} fixture={workspaceDisplay} library={workspaceLibrary} initialPanel={panel} /> : null}
      {screen === "studio" ? <MenuBoards fixture={{ ...menuFixture, startBoardId: "board-lunch", startLayout: "menu-promo-67" }} /> : null}
      {screen === "content" ? <ContentHub pathOverride="/dashboard/content" fixture={contentFixture} /> : null}
      {screen === "menus" ? <MenuBoards fixture={menuFixture} /> : null}
      {screen === "templates" ? <MenuBoards fixture={{ ...menuFixture, templates: true, startTemplate: "gallery" }} /> : null}
      {screen === "templates-edit" ? <MenuBoards fixture={{ ...menuFixture, templates: true, startTemplate: params.get("design") || "coffee-shop" }} /> : null}
      {screen === "menu-edit" ? <MenuBoards fixture={{ ...menuFixture, startMenuId: "menu-dinner" }} /> : null}
      {/* Unified menu designer (UNIFIED_MENU_EDITOR) */}
      {screen === "unified" ? <MenuBoards fixture={{ ...menuFixture, templates: true, unified: true }} /> : null}
      {screen === "unified-gallery" ? <MenuBoards fixture={{ ...menuFixture, templates: true, unified: true, startTemplate: "gallery" }} /> : null}
      {screen === "unified-edit" ? <MenuBoards fixture={{ ...menuFixture, templates: true, unified: true, startTemplate: params.get("design") || "modern-restaurant" }} /> : null}
      {screen === "unified-layout" ? <MenuBoards fixture={{ ...menuFixture, templates: true, unified: true, startLayout: (params.get("layout") as LayoutTemplate) || "two-column", startBoardId: null }} /> : null}
      {screen === "unified-board" ? <MenuBoards fixture={{ ...menuFixture, templates: true, unified: true, startMenuId: params.get("menu") || "menu-dinner" }} /> : null}
      {screen === "t421u-board" ? <MenuBoards fixture={t421uFixture(params)} /> : null}
      {screen === "unify-list" ? <MenuBoards fixture={menuFixture} /> : null}
      {screen === "unify-picker" ? <MenuBoards fixture={{ ...menuFixture, startView: "pick-layout" }} /> : null}
      {screen === "unify-full-screen" ? <MenuBoards fixture={{ ...menuFixture, startEditing: true }} /> : null}
      {screen === "unify-two-column" ? <MenuBoards fixture={{ ...menuFixture, startLayout: "two-column", startBoardId: "board-two-column", startZone: "column-0" }} /> : null}
      {screen === "unify-menu-promo" ? <MenuBoards fixture={{ ...menuFixture, startLayout: "menu-promo-67", startBoardId: "board-lunch" }} /> : null}
      {screen === "unify-two-menu-promo" ? <MenuBoards fixture={{ ...menuFixture, startLayout: "two-menu-promo", startBoardId: "board-two-menu" }} /> : null}
      {screen === "unify-menu-editor" ? <MenuBoards fixture={{ ...menuFixture, startLayout: "two-menu-promo", startBoardId: "board-two-menu", startZone: "column-0" }} /> : null}
      {screen === "unify-media-editor" ? <MenuBoards fixture={{ ...menuFixture, startLayout: "two-menu-promo", startBoardId: "board-two-menu", startZone: "feature" }} /> : null}
      {screen === "unify-mobile" ? <MenuBoards fixture={{ ...menuFixture, startLayout: "two-menu-promo", startBoardId: "board-two-menu", startZone: "column-0" }} /> : null}
      {screen === "unify-brand" ? <MenuBoards fixture={{ ...menuFixture, startLayout: "menu-promo-67", startBoardId: "board-branded" }} /> : null}
      {screen === "unify-new-brand" ? <MenuBoards fixture={{ ...menuFixture, startLayout: "menu-promo-67", startBoardId: null }} /> : null}
      {screen === "promos" ? <PromoSlides fixture={promoFixture} /> : null}
      {screen === "promo-edit" ? <PromoSlides fixture={{ ...promoFixture, startEditing: true }} /> : null}
      {screen === "brand-kit" ? <BrandKit fixture={brandFixture} /> : null}
      {screen === "show-on-screens" ? (
        <>
          <style>{SHOW_ON_SCREENS_STYLES}</style>
          <ShowOnScreens boardId="menu-dinner" boardName="Dinner menu" playlistId="pl-board" displays={displays} preview onDone={() => {}} onSkip={() => {}} />
        </>
      ) : null}
      {screen === "account" ? <AccountPreview /> : null}
      {screen === "screens" ? <MyScreensPreview /> : null}
      {screen === "groups" ? <ScreenGroups fixture={empty ? { groups: [], displays } : demoGroups} startCreating={params.get("creating") === "1"} /> : null}
      {/* Peek redesign primitives (add &peek=1; the preview flag is off otherwise). */}
      {screen === "peek-kit" ? <PeekKit dialog={params.get("dialog") === "1"} sheet={params.get("sheet") === "1"} /> : null}
      {screen === "upload" ? <UploadNoticeDemo mode="success" /> : null}
      {screen === "upload-error" ? <UploadNoticeDemo mode="error" /> : null}
    </DashboardShell>
  );
}

function UploadNoticeDemo({ mode }: { mode: "success" | "error" }) {
  const toast = useToast();
  const once = useRef(false);
  useEffect(() => {
    if (once.current || mode !== "success") return;
    once.current = true;
    toast.show("Uploaded", false, { durationMs: UPLOAD_SUCCESS_TOAST_MS });
  }, [mode, toast]);
  if (mode === "success") {
    const done: UploadJob[] = [{ key: "done-1", name: "demo-cafe-lunch.png", progress: 100, state: "done", detail: "Uploaded" }];
    return (
      <section>
        <h1 className="text-2xl font-semibold mb-3">Upload finished</h1>
        <UploadProgress jobs={done} onDismiss={() => undefined} />
      </section>
    );
  }
  const failed: UploadJob[] = [{ key: "err-1", name: "demo-cafe-specials.mp4", progress: 42, state: "error", detail: "Choose an MP4 video." }];
  return (
    <section>
      <h1 className="text-2xl font-semibold mb-3">Upload needs attention</h1>
      <UploadProgress jobs={failed} onDismiss={() => undefined} />
    </section>
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

const studioImageId = "00000000-0000-4000-8000-0000000000a1";
const studioVideoId = "00000000-0000-4000-8000-0000000000b1";
const studioPhoto = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAAAkCAIAAAC2bqvFAAAAU0lEQVR4nO3PUQkAIBTAwJfHPjY2mCH8OITBAtzm7PV1wwUNaEEDWtCAFjSgBQ1oQQNa0IAWNKAFDWhBA1rQgBY0oAUNaEEDWtCAFjSgBQ1owWMXc21bpt/FQuQAAAAASUVORK5CYII=";
const studioFixture: AccountStudio = {
  boards: [
    {
      id: "board-lunch",
      name: "Lunch board",
      document: { ...sampleLayout("menu-promo-67"), imageMediaId: studioImageId, videoMediaId: null },
      mediaId: null,
      playlistId: null,
    },
    {
      id: "board-two-menu",
      name: "Lunch and dinner",
      document: { ...sampleLayout("two-menu-promo"), imageMediaId: null, videoMediaId: studioVideoId },
      mediaId: null,
      playlistId: null,
    },
    {
      id: "board-two-column",
      name: "Two-column lunch and dinner",
      document: sampleLayout("two-column"),
      mediaId: null,
      playlistId: null,
    },
    {
      id: "board-branded",
      name: "Branded lunch board",
      document: { ...sampleLayout("menu-promo-67"), imageMediaId: studioImageId, primaryColor: "#c8102e", accentColor: "#ffd34d" },
      mediaId: null,
      playlistId: null,
    },
  ],
  legacy: [],
  library: [
    { id: studioImageId, name: "lunch-special.png", kind: "image", mime: "image/png", url: studioPhoto },
    { id: studioVideoId, name: "promo.mp4", kind: "video", mime: "video/mp4", url: "/layout-studio/media/promo", thumbnailUrl: "/layout-studio/media/poster" },
  ],
};


const brandFixture = {
  brand: {
    primaryColor: "#c8102e",
    accentColor: "#ffd34d",
    logoMediaId: "media-logo",
    available: true,
    custom: true,
    displayName: "Demo Café",
    textColor: "#1a1a1a",
    backgroundColor: "#f4e8c8",
    headingFont: "noto-serif" as const,
    bodyFont: "inter" as const,
    phone: "(415) 555-0142",
    website: "https://democafe.example",
  },
  images: media,
};

const menuFixture: MenuFixture = {
  menus: [
    {
      id: "menu-dinner",
      name: "Demo Café dinner menu",
      template: "classic",
      content: { ...sampleMenu(), title: "Dinner", subtitle: "From 5 PM", useBrand: true, photoMediaId: "media-dinner" },
      mediaId: "media-dinner",
      playlistId: "pl-menu",
      imageUrl: dinner,
      createdAt: "2026-10-28T15:00:00.000Z",
      updatedAt: "2026-10-28T15:00:00.000Z",
    },
    {
      id: "board-lunch",
      name: "Demo Café lunch board",
      template: "fresh",
      content: { ...sampleLayout("menu-promo-67"), imageMediaId: studioImageId },
      mediaId: "media-lunch",
      playlistId: "pl-lunch",
      imageUrl: lunch,
      createdAt: "2026-10-28T15:00:00.000Z",
      updatedAt: "2026-10-28T16:00:00.000Z",
    },
    {
      id: "board-two-menu",
      name: "Lunch and dinner",
      template: "fresh",
      content: { ...sampleLayout("two-menu-promo"), videoMediaId: studioVideoId },
      mediaId: null,
      playlistId: null,
      imageUrl: lunch,
      createdAt: "2026-10-28T15:00:00.000Z",
      updatedAt: "2026-10-28T16:00:00.000Z",
    },
  ],
  available: true,
  images: media,
  displays: displays.filter((item) => item.connected),
  brand: brandFixture,
  previewSrc: dinner,
  studio: studioFixture,
};

const promoFixture = {
  promos: [
    {
      id: "promo-happy",
      name: "Happy hour",
      template: "happy" as const,
      content: samplePromo("happy"),
      mediaId: "media-dinner",
      imageUrl: dinner,
      startsOn: "2026-11-11",
      endsOn: "2026-11-30",
      menuId: "menu-dinner",
      placement: "added" as const,
      expired: false,
      updatedAt: "2026-10-28T17:00:00.000Z",
      screens: [{ id: "screen-front", name: "Front counter" }],
    },
  ] satisfies Promo[],
  available: true,
  menus: menuFixture.menus,
  images: media,
  brand: brandFixture,
  previewSrc: dinner,
};

function AccountPreview() {
  return <AccountHub />;
}

function MyScreensPreview() {
  const board = poster("Lunch board", "#163628");
  const extra: DisplayItem[] = [
    {
      id: "screen-kitchen",
      name: "Kitchen",
      connected: true,
      online: true,
      lastSeenAt: new Date(Date.now() - 10_000).toISOString(),
      media: null,
      playlist: { id: "pl-board", name: "Lunch board", url: null },
      boardPreviewUrl: board,
    },
    {
      id: "screen-lounge",
      name: "Lounge",
      connected: true,
      online: true,
      lastSeenAt: new Date(Date.now() - 15_000).toISOString(),
      media: { id: "media-clip", fileName: "demo-cafe-specials.mp4", url: "https://cdn.example/specials.mp4" },
      playlist: null,
    },
    {
      id: "screen-office",
      name: "Office",
      connected: true,
      online: true,
      lastSeenAt: new Date(Date.now() - 12_000).toISOString(),
      media: { id: "media-deck", fileName: "demo-cafe-menu.pptx", url: null },
      playlist: null,
    },
  ];
  return <MyScreens fixture={{ displays: [...displays, ...extra], groups: demoGroups.groups }} />;
}

/** Presentation details fixture (42 / 43-R-Presentation): six slides, or none while it is still processing. */
function presentationFixture(state: "ready" | "processing"): PresentationDetail {
  const colors = ["#3d2a1c", "#1c3d32", "#5b2a2a", "#1c243d", "#2d2d2d", "#3d3a1c"];
  const slides = state === "ready" ? colors.map((color, index) => {
    const src = poster(`Slide ${index + 1}`, color);
    return { id: `deck-slide-${index + 1}`, fileName: `demo-cafe-menu-${index + 1}.png`, index, url: src, thumbnailUrl: src, width: 1920, height: 1080, durationMs: index === 0 ? 12000 : null };
  }) : [];
  return {
    id: "media-deck", accountId: "preview", fileName: "demo-cafe-menu.pptx", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    sizeBytes: 4_200_000, createdAt: "2026-10-25T09:00:00.000Z", updatedAt: "2026-10-25T09:00:00.000Z", width: 1920, height: 1080,
    processingStatus: state === "ready" ? "ready" : "processing", processingError: null, processingDone: state === "ready" ? 6 : 2,
    slideCount: 6, defaultDurationMs: 8000, coverUrl: slides[0]?.url ?? null, usedIn: [{ id: "pl-lunch", name: "Lunch loop" }], slides,
  };
}

function poster(label: string, color: string) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='640' height='360'><rect fill='${color}' width='100%' height='100%'/><text x='50%' y='54%' fill='white' font-family='sans-serif' font-size='36' text-anchor='middle'>${label}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * t421u screenshot fixture: a template board with owner item photos (the first `photos` items) and an optional wide
 * featured photo (`/menu-templates/widephoto.jpg`, served by the screenshot script; 404 otherwise), `size` = stored itemPhotoSize ("none" = absent).
 */
const T421U_PHOTOS = ["tacos", "burrito", "quesadilla", "carnitas", "streettacos", "chicken", "salad", "steak", "pasta", "burger", "wings", "ribs"];
function t421uFixture(params: URLSearchParams): MenuFixture {
  const design = designById(params.get("design") || "modern-restaurant") ?? designById("modern-restaurant")!;
  const count = Number(params.get("photos") ?? 6);
  const library = T421U_PHOTOS.map((id, i) => ({ id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`, name: `${id}.jpg`, kind: "image" as const, mime: "image/jpeg", url: `/menu-templates/${id}.jpg` }));
  if (params.get("wide") === "1") library.push({ id: "00000000-0000-4000-8000-000000000999", name: "wide-dining-room.jpg", kind: "image", mime: "image/jpeg", url: "/menu-templates/widephoto.jpg" });
  const seed = designDocument(design);
  let n = 0;
  const doc: LayoutDocument = {
    ...seed,
    ...(params.get("orientation") === "portrait" ? { orientation: "portrait" as const } : {}),
    ...(params.get("wide") === "1" ? { imageMediaId: "00000000-0000-4000-8000-000000000999", stockPhoto: undefined } : {}),
    sections: seed.sections.map((sec) => ({ ...sec, items: sec.items.map((item) => (n < count ? { ...item, imageMediaId: library[n++ % T421U_PHOTOS.length].id } : item)) })),
  };
  const size = params.get("size");
  if (size === "none") delete doc.itemPhotoSize;
  else if (size === "small" || size === "medium" || size === "large") doc.itemPhotoSize = size;
  return {
    ...menuFixture, templates: true, unified: true, startMenuId: "board-t421u",
    menus: [{ id: "board-t421u", name: "t421u board", template: "fresh", content: doc, mediaId: null, playlistId: null, imageUrl: null, createdAt: "2026-11-23T10:00:00.000Z", updatedAt: "2026-11-23T10:00:00.000Z" }, ...menuFixture.menus],
    studio: {
      ...menuFixture.studio!,
      boards: [{ id: "board-t421u", name: "t421u board", document: doc, mediaId: null, playlistId: null }, ...(menuFixture.studio?.boards ?? [])],
      library: [...(menuFixture.studio?.library ?? []), ...library],
    },
  };
}

