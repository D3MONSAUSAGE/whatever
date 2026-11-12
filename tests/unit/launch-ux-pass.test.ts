import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  CONTENT_CATEGORIES,
  PROMOTIONS_CARD,
  promotionsCreateOpensPromoEditor,
  recentFor,
  kindLabel,
  type ContentRecentItem,
} from "@/lib/content-hub";
import { FILE_UPLOAD, selectedFilename } from "@/lib/file-upload";
import { MAX_VIDEO_MB, MAX_VIDEO_BYTES } from "@/lib/mp4";
import { layoutThumbnailSvg, layoutThumbnailSrc } from "@/lib/layout-thumbnails";
import { LAYOUT_OPTIONS, PROMO_AREA_HINT, layoutUsesPromoArea } from "@/lib/menu-board-unify";
import { LayoutGallery } from "@/components/layout-gallery";
import { Status } from "@/components/tv";
import { ContentHub } from "@/components/content-hub";
import {
  SCREEN_ACTION_ORDER,
  publishSavedCopy,
  publishSavedCopyForTargets,
  publishTimingCopy,
  screenActionClass,
  screenActionGroup,
  screenActionHelper,
  screenActionLabel,
} from "@/lib/screen-actions-ui";

describe("content landing categories", () => {
  it("lists five categories with Promotions copy and position in one place, and Create promotion never opens the layout picker", () => {
    expect(CONTENT_CATEGORIES.map((item) => item.id)).toEqual([
      "media", "menus", "promotions", "playlists", "presentations",
    ]);
    expect(CONTENT_CATEGORIES[2]).toBe(PROMOTIONS_CARD);
    expect(PROMOTIONS_CARD.title).toBe("Promotions");
    expect(PROMOTIONS_CARD.lede).toBe(
      "A special, deal or happy-hour slide. Add it to a menu, or set dates so it comes and goes on its own.",
    );
    expect(PROMOTIONS_CARD.createHref).toBe("/dashboard/media/promos?new=1");
    expect(promotionsCreateOpensPromoEditor(PROMOTIONS_CARD.createHref)).toBe(true);
    expect(CONTENT_CATEGORIES.find((item) => item.id === "menus")?.lede).toBe("A full-screen menu or layout for your TVs.");
    expect(CONTENT_CATEGORIES.find((item) => item.id === "menus")?.createHref).toContain("/dashboard/media/menus");
    expect(CONTENT_CATEGORIES.find((item) => item.id === "menus")?.createHref).toContain("new=1");
  });

  it("keeps Menu boards and Promotions recent items in separately labeled lists", () => {
    const items: ContentRecentItem[] = [
      { id: "m1", name: "Lunch board", href: "/dashboard/media/menus?board=m1", kind: "menus", kindLabel: kindLabel("menus") },
      { id: "p1", name: "Happy hour", href: "/dashboard/media/promos?promo=p1", kind: "promotions", kindLabel: kindLabel("promotions") },
    ];
    expect(recentFor(items, "menus").map((item) => item.name)).toEqual(["Lunch board"]);
    expect(recentFor(items, "promotions").map((item) => item.name)).toEqual(["Happy hour"]);
    expect(kindLabel("menus")).toBe("Menu boards");
    expect(kindLabel("promotions")).toBe("Promotions");
  });

  it("renders category cards, create actions, and recent items without the old intro panels", () => {
    const html = renderToStaticMarkup(createElement(ContentHub, {
      fixture: {
        recent: [
          { id: "m1", name: "Lunch board", href: "/dashboard/media/menus?board=m1", kind: "menus", kindLabel: "Menu boards" },
          { id: "p1", name: "Happy hour", href: "/dashboard/media/promos?promo=p1", kind: "promotions", kindLabel: "Promotions" },
        ],
      },
    }));
    expect(html).not.toContain("Menus and layouts");
    expect(html).not.toContain("Use the tabs above");
    expect(html).toContain("Menu boards");
    expect(html).toContain("Promotions");
    expect(html).toContain("A full-screen menu or layout for your TVs.");
    expect(html).toContain("A special, deal or happy-hour slide");
    expect(html).toContain("Create menu board");
    expect(html).toContain('href="/dashboard/media/menus?new=1"');
    expect(html).toContain("Create promotion");
    expect(html).toContain('href="/dashboard/media/promos?new=1"');
    expect(html).not.toContain("layout-picker");
    expect(html).toContain("Lunch board");
    expect(html).toContain("Happy hour");
    expect(html).toContain("aria-label=\"Recent Menu boards\"");
    expect(html).toContain("aria-label=\"Recent Promotions\"");
    expect(html).toContain("page-header-compact");
    expect(html).toContain("Create something new, or open what you already have.");
    expect(html).not.toContain("hero-gradient");
    expect(html).not.toContain("banner-dark");
    expect(html).not.toContain("Library");
  });
});

describe("layout gallery", () => {
  it("shows every existing layout, with a reusable thumbnail, and no More layouts collapse", () => {
    expect(LAYOUT_OPTIONS).toHaveLength(8);
    for (const option of LAYOUT_OPTIONS) {
      const svg = layoutThumbnailSvg(option.id);
      expect(svg).toContain("<svg");
      expect(layoutThumbnailSrc(option.id)).toContain("data:image/svg+xml");
    }
    const html = renderToStaticMarkup(createElement(LayoutGallery, {
      options: LAYOUT_OPTIONS,
      selectedId: "menu-promo",
      onSelect: () => undefined,
      onContinue: () => undefined,
      onCancel: () => undefined,
    }));
    expect(html).not.toContain("More layouts");
    for (const option of LAYOUT_OPTIONS) {
      expect(html).toContain(option.name);
      expect(html).toContain(`data-testid="layout-option-${option.id}"`);
    }
    expect(html).toContain("Continue");
    expect(html).toContain("Select a layout for a new board, then Continue to start editing.");
    expect(html).toContain("Next: edit");
    expect(html).toContain("Menu + promo image/video");
    expect(html).toContain(PROMO_AREA_HINT);
    expect(html).toContain('aria-pressed="true"');
    expect(layoutUsesPromoArea("menu-promo")).toBe(true);
    expect(layoutUsesPromoArea("two-menu-promo")).toBe(true);
    expect(layoutUsesPromoArea("full-screen")).toBe(false);
    const source = readFileSync("components/menu-boards.tsx", "utf8");
    expect(source).toContain("LayoutGallery");
    expect(source).not.toContain("More layouts");
  });
});

describe("screen action hierarchy and offline publish copy", () => {
  it("orders Change content first as primary, with Schedule and Edit playlist secondary", () => {
    expect(SCREEN_ACTION_ORDER).toEqual(["change", "schedule", "playlist", "upload", "create"]);
    expect(screenActionLabel("change")).toBe("Change content");
    expect(screenActionLabel("upload")).toBe("Upload media");
    expect(screenActionLabel("create")).toBe("Create content");
    expect(screenActionGroup("change")).toBe("primary");
    expect(screenActionGroup("schedule")).toBe("secondary");
    expect(screenActionGroup("playlist")).toBe("secondary");
    expect(screenActionGroup("upload")).toBe("supporting");
    expect(screenActionGroup("create")).toBe("supporting");
    expect(screenActionClass("change", false)).toContain("btn-primary");
    expect(screenActionClass("upload", false)).toContain("btn-quiet");
    expect(screenActionHelper("change")).toContain("publish");
  });

  it("does not promise an immediate update to an offline or unpaired TV", () => {
    expect(publishTimingCopy({ online: true, connected: true })).toBe("The TV updates within about 30 seconds.");
    expect(publishTimingCopy({ online: false, connected: true })).toContain("offline");
    expect(publishTimingCopy({ online: false, connected: true })).not.toMatch(/within about 30 seconds/i);
    expect(publishTimingCopy({ online: false, connected: true })).not.toMatch(/immediate/i);
    expect(publishTimingCopy({ online: false, connected: false })).toContain("not connected");
    expect(publishSavedCopy({ online: false, connected: true })).toContain("offline");
    expect(publishSavedCopy({ online: false, connected: true })).not.toMatch(/within about 30 seconds/i);
    const source = readFileSync("components/screen-actions.tsx", "utf8");
    expect(source).toContain("publishTimingCopy(display)");
    expect(source).toContain("publishSavedCopy(display)");
    expect(source).not.toContain("TV updates within ~30 s");
    expect(source).toContain("/dashboard/media/promos?new=1");
    expect(source).not.toMatch(/promos"\s*>New promotion/);
  });
});

describe("upload picker UI", () => {
  it("names accepted types and the existing size limits, including the 500 MB video cap", () => {
    expect(FILE_UPLOAD.image.label).toBe("Upload image");
    expect(FILE_UPLOAD.video.label).toBe("Upload video");
    expect(FILE_UPLOAD.document.label).toBe("Upload document");
    expect(FILE_UPLOAD.image.acceptLabel).toContain("JPG");
    expect(FILE_UPLOAD.video.acceptLabel).toContain("MP4");
    expect(FILE_UPLOAD.document.acceptLabel).toContain("PDF");
    expect(FILE_UPLOAD.image.limitLabel).toBe("15 MB or smaller");
    expect(FILE_UPLOAD.video.limitLabel).toBe(`${MAX_VIDEO_MB} MB or smaller`);
    expect(FILE_UPLOAD.video.limitBytes).toBe(MAX_VIDEO_BYTES);
    expect(MAX_VIDEO_MB).toBe(500);
    expect(FILE_UPLOAD.document.limitLabel).toBe("50 MB or smaller");
    expect(selectedFilename([new File([], "lunch.png")])).toBe("lunch.png");
    expect(selectedFilename([new File([], "a.png"), new File([], "b.png")])).toBe("a.png and 1 more");
    const screen = readFileSync("components/screen-actions.tsx", "utf8");
    const media = readFileSync("components/media-library.tsx", "utf8");
    const studio = readFileSync("components/layout-studio.tsx", "utf8");
    expect(screen).toContain("FileUploadControl");
    expect(media).toContain("FileUploadControl");
    expect(studio).toContain("FileUploadControl");
    expect(screen).not.toMatch(/className="block mt-1 w-full[^"]*" aria-label="Upload image" type="file"/);
    expect(media).toContain(">Promotions<");
    expect(media).not.toContain(">Promos<");
    expect(media).toContain("Pictures, video, and documents in your library.");
    expect(media).not.toContain("Images up to 15 MB");
    expect(media).toContain('data-testid="media-uploads"');
    expect(media).toContain("grid grid-cols-3");
    expect(media).not.toMatch(/FileUploadControl kind="image"[^\n]*btn-primary/);
    expect(media).toContain('kind="image"');
    expect(media).toContain('kind="video"');
    expect(media).toContain('kind="document"');
    expect((media.match(/btn-quiet/g) ?? []).length).toBeGreaterThanOrEqual(3);
    const studioHelp = readFileSync("components/layout-studio.tsx", "utf8");
    expect(studioHelp).toContain("PROMO_AREA_HINT");
    expect(studioHelp).toContain('promoArea={template === "menu-promo-67" || template === "two-menu-promo"}');
  });
});

describe("server-derived online status and preview fixtures", () => {
  it("shows the Status badge from display.online, even if lastSeenAt would be stale", () => {
    const source = readFileSync("components/tv.tsx", "utf8");
    expect(source).toContain("if (display.online)");
    expect(source).not.toMatch(/isOnline\(\s*display\.lastSeenAt/);
    expect(source).not.toMatch(/online\s*=\s*.*lastSeenAt/);
    const base = {
      id: "s1",
      name: "Front",
      connected: true,
      media: null,
      playlist: null,
      playerError: null,
    };
    const staleOnline = renderToStaticMarkup(createElement(Status, {
      display: { ...base, online: true, lastSeenAt: "2026-11-01T12:00:00.000Z" },
    }));
    expect(staleOnline).toContain("Online");
    expect(staleOnline).not.toContain("Offline");
    const offline = renderToStaticMarkup(createElement(Status, {
      display: { ...base, online: false, lastSeenAt: "2026-11-01T11:00:00.000Z" },
    }));
    expect(offline).toContain("Offline");
    expect(offline).not.toMatch(/>Online</);
  });

  it("keeps the preview fixture consistent with the 90 s server window, and shows offline copy on My Screens and the detail page", () => {
    const preview = readFileSync("app/preview/preview-app.tsx", "utf8");
    expect(preview).toContain("new Date(Date.now() - 20_000).toISOString()");
    expect(preview).toContain('id: "screen-bar"');
    expect(preview).toContain("online: false");
    const screens = readFileSync("components/my-screens.tsx", "utf8");
    expect(screens).toContain("This screen is offline. You can still change content; the TV updates when it comes back online.");
    expect(screens).toContain("This screen is offline. Check that the TV is on, joined to Wi-Fi, and still open on the Pekko player.");
    expect(screens).toContain("display.connected && !display.online");
    expect(screens).toContain("heartbeatLabel(display.lastSeenAt)");
    expect(screens).toContain("<Status display={display} />");
  });
});

describe("publish copy for offline targets across every leftover toast", () => {
  const offline = { online: false, connected: true };
  const live = { online: true, connected: true };
  const unpaired = { online: false, connected: false };

  it("uses saved-until-back-online wording whenever any target is offline, and never promises 30 seconds for those screens", () => {
    expect(publishSavedCopyForTargets([offline])).toBe(publishSavedCopy(offline));
    expect(publishSavedCopyForTargets([offline])).toContain("offline");
    expect(publishSavedCopyForTargets([offline])).not.toMatch(/within about 30 seconds/i);
    expect(publishSavedCopyForTargets([offline, offline])).toContain("Offline screens are saved");
    expect(publishSavedCopyForTargets([offline, offline])).not.toMatch(/within about 30 seconds/i);
    const mixed = publishSavedCopyForTargets([live, offline]);
    expect(mixed).toContain("The online TV updates within about 30 seconds");
    expect(mixed).toContain("The offline screen is saved");
    expect(mixed).toContain("when it comes back online");
    expect(publishSavedCopyForTargets([live])).toBe(publishSavedCopy(live));
    expect(publishSavedCopyForTargets([unpaired])).toContain("pairing");
    expect(publishSavedCopyForTargets([unpaired])).not.toMatch(/within about 30 seconds/i);
  });

  it("routes displays, group, and layout-studio publish notes through the helper, with no raw 30-second promise to an offline TV", () => {
    const displays = readFileSync("components/displays-screen.tsx", "utf8");
    const group = readFileSync("components/group-publish.tsx", "utf8");
    const studio = readFileSync("components/layout-studio.tsx", "utf8");
    expect(displays).toContain("publishSavedCopyForTargets(targets)");
    expect(displays).toContain("publishTimingCopy(display)");
    expect(displays).toContain("publishSavedCopy(display)");
    expect(displays).not.toContain("TV updates within ~30 s");
    expect(displays).not.toContain("The TV updates within about 10 seconds.");
    expect(group).toContain("publishSavedCopyForTargets(targets)");
    expect(group).not.toContain("TVs update within about 30 seconds.");
    expect(studio).toContain("publishSavedCopy({");
    expect(studio).not.toContain("TV updates within ~30 s");
    expect(studio).toContain("Screens already playing this board will update when they are online.");
  });
});

describe("isolated studio photo limit copy", () => {
  it("shows the 1.5 MB isolated preview cap, not the 15 MB library limit, and does not change the cap", () => {
    const studio = readFileSync("components/layout-studio.tsx", "utf8");
    expect(studio).toContain("export const ISOLATED_STUDIO_PHOTO_MAX_BYTES = 1_500_000");
    expect(studio).toContain('export const ISOLATED_STUDIO_PHOTO_LIMIT_LABEL = "1.5 MB or smaller"');
    expect(studio).toContain("file.size > ISOLATED_STUDIO_PHOTO_MAX_BYTES");
    expect(studio).toContain("Use a photo under 1.5 MB.");
    expect(studio).toContain("isolatedPhotoLimit={!accountMode && !sessionToken}");
    expect(studio).toContain("limitLabel={imageLimitLabel}");
    expect(studio).toContain("ISOLATED_STUDIO_PHOTO_LIMIT_LABEL");
  });
});
