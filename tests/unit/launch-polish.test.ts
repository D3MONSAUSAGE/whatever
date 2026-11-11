import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { activeContentTab, CONTENT_TABS } from "@/lib/content-nav";
import { buildScreenPickerEntries, filterPickerEntries, pictureSelection } from "@/lib/content-picker";
import { ContentPicker } from "@/components/content-picker";
import { ToastView } from "@/components/toast";
import { UPLOAD_SUCCESS_TOAST_MS, armToastTimer, bannerJobs, toastDurationMs, uploadSuccessCopy } from "@/lib/upload-notice";
import { screenActionClass, screenActionLabel } from "@/lib/screen-actions-ui";
import { ScreenGroups } from "@/components/my-screens";

const entries = buildScreenPickerEntries({
  media: [
    { id: "img-1", fileName: "demo-cafe-lunch.png", kind: "image", url: "https://cdn.example/lunch.png", thumbnailUrl: null },
    { id: "vid-1", fileName: "demo-cafe-specials.mp4", kind: "video", url: "https://cdn.example/specials.mp4", thumbnailUrl: "https://cdn.example/specials.jpg" },
    { id: "vid-2", fileName: "demo-cafe-patio.mp4", kind: "video", url: "https://cdn.example/patio.mp4", thumbnailUrl: null },
    { id: "deck-1", fileName: "demo-cafe-menu.pptx", kind: "presentation", url: null, coverUrl: "https://cdn.example/deck.jpg" },
    { id: "slide-1", fileName: "slide-3.png", kind: "image", url: "https://cdn.example/slide.png", sourceMediaId: "deck-1" },
  ],
  playlists: [{ id: "pl-1", name: "Lunch loop", thumbnailUrl: "https://cdn.example/loop.jpg" }],
  menus: [
    { id: "menu-1", name: "Demo Café dinner menu", playlistId: "pl-menu", imageUrl: "https://cdn.example/dinner.png" },
    { id: "board-1", name: "Hidden because it is a layout", playlistId: "pl-board", imageUrl: null },
  ],
  layouts: [{ id: "board-1", name: "Demo Café lunch board", thumbnailUrl: null }],
});

describe("content navigation", () => {
  it("names the six library destinations", () => {
    expect(CONTENT_TABS.map((tab) => tab.label)).toEqual([
      "Media", "Menus", "Promotions", "Layout Studio", "Playlists", "Presentations",
    ]);
  });

  it("marks the current page, including presentations versus the rest of the library", () => {
    expect(activeContentTab("/dashboard/content", null)).toBeNull();
    expect(activeContentTab("/dashboard/media", null)).toBe("media");
    expect(activeContentTab("/dashboard/media", "presentation")).toBe("presentations");
    expect(activeContentTab("/dashboard/media/menus", null)).toBe("menus");
    expect(activeContentTab("/dashboard/media/promos", null)).toBe("promotions");
    expect(activeContentTab("/dashboard/media/layout-studio", null)).toBe("studio");
    expect(activeContentTab("/dashboard/playlists/pl-1", null)).toBe("playlists");
    expect(activeContentTab("/dashboard/media/presentations/deck-1", null)).toBe("presentations");
  });
});

describe("screen content picker", () => {
  it("builds thumbnails from existing image urls and leaves raw video files off the img src", () => {
    const video = entries.find((entry) => entry.id === "vid-1");
    const silent = entries.find((entry) => entry.id === "vid-2");
    const picture = entries.find((entry) => entry.id === "img-1");
    const deck = entries.find((entry) => entry.id === "deck-1");
    expect(picture?.thumbnailUrl).toBe("https://cdn.example/lunch.png");
    expect(video?.thumbnailUrl).toBe("https://cdn.example/specials.jpg");
    expect(video?.thumbnailUrl).not.toContain(".mp4");
    expect(silent?.thumbnailUrl).toBeNull();
    expect(deck?.thumbnailUrl).toBe("https://cdn.example/deck.jpg");
    expect(entries.some((entry) => entry.id === "slide-1")).toBe(false);
    expect(entries.some((entry) => entry.fileName === "Hidden because it is a layout")).toBe(false);
    expect(entries.find((entry) => entry.category === "menu")?.id).toBe("pl-menu");
  });

  it("filters by category and file name without changing the selected picture id", () => {
    expect(filterPickerEntries(entries, "  PATIO ", "all").map((entry) => entry.fileName)).toEqual(["demo-cafe-patio.mp4"]);
    expect(filterPickerEntries(entries, "demo", "video").map((entry) => entry.category)).toEqual(["video", "video"]);
    expect(filterPickerEntries(entries, "lunch", "picture").map((entry) => entry.id)).toEqual(["img-1"]);
    expect(filterPickerEntries(entries, "missing", "all")).toEqual([]);
    expect(pictureSelection("img-1", "img-2")).toBe("img-2");
  });

  it("renders previews, type labels, search, and the selected picture", () => {
    const html = renderToStaticMarkup(createElement(ContentPicker, {
      entries,
      busy: false,
      initialQuery: "",
      initialCategory: "all",
      initialSelected: "img-1",
      onPublishPicture: () => undefined,
      onPublish: () => undefined,
    }));
    expect(html).toContain("Search content");
    expect(html).toContain("aria-label=\"Content type\"");
    expect(html).toContain("https://cdn.example/lunch.png");
    expect(html).toContain("https://cdn.example/specials.jpg");
    expect(html).not.toContain("<video");
    expect(html).not.toContain("patio.mp4\"");
    expect(html).toContain(">Image<");
    expect(html).toContain(">Video<");
    expect(html).toContain(">Presentation<");
    expect(html).toContain("aria-pressed=\"true\"");
    expect(html).toContain("Selected");
  });

  it("shows the filtered file and keeps a selected picture out of a video search", () => {
    const html = renderToStaticMarkup(createElement(ContentPicker, {
      entries,
      busy: false,
      initialQuery: "patio",
      initialCategory: "video",
      initialSelected: "img-1",
      onPublishPicture: () => undefined,
      onPublish: () => undefined,
    }));
    const list = html.split("<ul")[1]?.split("</ul>")[0] ?? "";
    expect(list).toContain("demo-cafe-patio.mp4");
    expect(list).not.toContain("demo-cafe-lunch.png");
    expect(html).toContain("Selected: demo-cafe-lunch.png");
  });
});

describe("upload notice", () => {
  it("drops a finished upload from the banner and keeps an error until it is removed", () => {
    const jobs = [
      { key: "ok", state: "done", name: "demo-cafe-lunch.png" },
      { key: "bad", state: "error", name: "demo-cafe-specials.mp4" },
      { key: "run", state: "active", name: "demo-cafe-menu.pptx" },
    ];
    expect(bannerJobs(jobs).map((job) => job.key)).toEqual(["bad", "run"]);
    expect(bannerJobs([{ key: "ok", state: "done" }])).toEqual([]);
    expect(uploadSuccessCopy(1, "image")).toBe("Uploaded");
    expect(uploadSuccessCopy(2, "presentation")).toBe("Uploaded 2 presentations");
  });

  it("auto-dismisses success after 5 seconds and leaves errors until dismissed", () => {
    vi.useFakeTimers();
    const success = vi.fn();
    const error = vi.fn();
    const schedule = (fn: () => void, ms: number) => setTimeout(fn, ms) as unknown as number;
    armToastTimer(false, UPLOAD_SUCCESS_TOAST_MS, success, schedule);
    expect(armToastTimer(true, null, error, schedule)).toBeNull();
    expect(toastDurationMs(true, null)).toBeNull();
    vi.advanceTimersByTime(4999);
    expect(success).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(success).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(60_000);
    expect(error).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("renders a polite status toast for success and an alert that stays for errors", () => {
    const success = renderToStaticMarkup(createElement(ToastView, { message: { text: "Uploaded" }, onDismiss: () => undefined }));
    const failure = renderToStaticMarkup(createElement(ToastView, { message: { text: "Choose an MP4 video.", error: true }, onDismiss: () => undefined }));
    expect(success).toContain("role=\"status\"");
    expect(success).toContain("aria-live=\"polite\"");
    expect(success).toContain("Uploaded");
    expect(failure).toContain("role=\"alert\"");
    expect(failure).toContain("Choose an MP4 video.");
    expect(failure).toContain("Dismiss");
  });
});

describe("screen actions and groups", () => {
  it("gives Change content primary styling and the other actions secondary buttons", () => {
    expect(screenActionLabel("change")).toBe("Change content");
    expect(screenActionClass("change", false)).toContain("btn-primary");
    expect(screenActionClass("change", false)).not.toContain("btn-quiet");
    for (const id of ["upload", "create", "playlist", "schedule"] as const) {
      expect(screenActionClass(id, false)).toContain("btn-quiet");
      expect(screenActionClass(id, true)).toContain("btn-pressed");
    }
    expect(screenActionClass("upload", false)).not.toContain("btn-primary");
  });

  it("offers New group on an empty list and when groups already exist", () => {
    const empty = renderToStaticMarkup(createElement(ScreenGroups, { fixture: { groups: [], displays: [] } }));
    expect(empty).toContain("New group");
    expect(empty).toContain("No groups yet");
    const filled = renderToStaticMarkup(createElement(ScreenGroups, {
      fixture: {
        groups: [{ id: "g1", name: "Demo Café front", displayIds: [], updatedAt: "2026-11-01T00:00:00.000Z" }],
        displays: [],
      },
    }));
    expect(filled).toContain("New group");
    expect(filled).toContain("Demo Café front");
    expect(filled).not.toContain("Groups are created from the schedule tools");
  });
});
