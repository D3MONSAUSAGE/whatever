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
import { ContentHub } from "@/components/content-hub";
import {
  SCREEN_ACTION_ORDER,
  publishSavedCopy,
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
    const studioHelp = readFileSync("components/layout-studio.tsx", "utf8");
    expect(studioHelp).toContain("PROMO_AREA_HINT");
    expect(studioHelp).toContain('promoArea={template === "menu-promo-67" || template === "two-menu-promo"}');
  });
});
