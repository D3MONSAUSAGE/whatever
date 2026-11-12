import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  LAYOUT_OPTIONS, canSaveThrough, classicEditorForRegion, classicPreviewHits,
  classifyBoardContent, CONTENT_TAB_MENUS_LABEL,
  layoutStudioRedirect, parseUnifiedSearch, publishPathFor, unifiedEditorPath,
} from "@/lib/menu-board-unify";
import { parseLayout, layoutSvg, frameFor, sampleLayout, type LayoutTemplate } from "@/lib/layout-studio";
import { parseMenuContent } from "@/lib/menu-templates";
import { storedMenuTemplate } from "@/lib/layout-publish";
import { draftStorageKey, InvalidStudioScopeError, writeStudioDraft } from "@/lib/layout-studio-draft";
import { previewHits } from "@/lib/layout-studio-editor";

const EXISTING_LAYOUTS: LayoutTemplate[] = [
  "menu-promo-67", "triple-column", "split-50", "menu-banner", "signature", "two-menu-promo",
];

describe("layout options", () => {
  it("defines the four featured layouts and every other existing Layout Studio template", () => {
    const featured = LAYOUT_OPTIONS.filter((item) => item.featured);
    expect(featured.map((item) => item.id)).toEqual(["full-screen", "two-column", "menu-promo", "two-menu-promo"]);
    expect(featured[0]).toMatchObject({ kind: "classic", name: "Full-screen menu" });
    expect(featured[1]).toMatchObject({ kind: "layout", layoutTemplate: "two-column", name: "Two-column menu" });
    expect(featured[2]).toMatchObject({ kind: "layout", layoutTemplate: "menu-promo-67" });
    expect(featured[3]).toMatchObject({ kind: "layout", layoutTemplate: "two-menu-promo" });
    expect(LAYOUT_OPTIONS.filter((item) => !item.featured).map((item) => item.layoutTemplate)).toEqual([
      "triple-column", "split-50", "menu-banner", "signature",
    ]);
    for (const option of LAYOUT_OPTIONS) {
      expect(option.blurb.toLowerCase()).not.toMatch(/offline/);
    }
  });

  it("gives two-column a 50/50 frame with no video region", () => {
    const frame = frameFor("two-column", 0.5);
    expect(frame.video).toBeNull();
    expect(frame.columns).toHaveLength(2);
    expect(frame.columns[0].w + frame.columns[1].w).toBe(1920);
    expect(Math.abs(frame.columns[0].w - 960)).toBeLessThanOrEqual(1);
    expect(frameFor("two-column", 0.5)).toEqual(frameFor("two-column", 0.5, null));
  });
});

describe("legacy documents load unchanged", () => {
  it("parses a frozen classic menu-board fixture as MenuContent, not as a layout", () => {
    const frozen = JSON.parse(readFileSync("tests/fixtures/legacy-menu-classic.json", "utf8")) as { template: unknown; content: unknown };
    const classified = classifyBoardContent(frozen.template, frozen.content);
    expect(classified.kind).toBe("classic");
    if (classified.kind === "classic") {
      expect(classified.template).toBe("classic");
      expect(classified.content.title).toBe("Dinner");
      expect(parseMenuContent(frozen.content).ok).toBe(true);
    }
    expect(parseLayout(frozen.content).ok).toBe(false);
  });

  it("parses frozen layout documents identically and keeps SVG byte-identical", () => {
    for (const id of EXISTING_LAYOUTS) {
      const raw = readFileSync(`tests/fixtures/legacy-layout-${id}.json`, "utf8");
      const frozen = JSON.parse(raw) as unknown;
      const expectedSvg = readFileSync(`tests/fixtures/legacy-layout-${id}.svg`, "utf8");
      const parsed = parseLayout(frozen);
      expect(parsed.ok, id).toBe(true);
      if (!parsed.ok) continue;
      expect(parsed.value.template).toBe(id);
      expect(layoutSvg(parsed.value)).toBe(expectedSvg);
      const classified = classifyBoardContent("fresh", frozen);
      expect(classified.kind).toBe("layout");
      // Flutter must only ever see the palette on the stored row.
      expect(["classic", "fresh", "bold"]).toContain(storedMenuTemplate(parsed.value));
      expect(storedMenuTemplate(parsed.value)).not.toBe(id);
    }
  });

  it("still opens a classic menu whose photo id is not a UUID, and never treats a layoutVersion document as classic", () => {
    const loose = { title: "Dinner", subtitle: "From 5 PM", footer: "", sections: [{ name: "Tacos", items: [{ name: "Al pastor", price: "$3.50", description: "" }] }], photoMediaId: "media-dinner", useBrand: true };
    const classified = classifyBoardContent("classic", loose);
    expect(classified.kind).toBe("classic");
    if (classified.kind === "classic") {
      expect(classified.template).toBe("classic");
      expect(classified.content.title).toBe("Dinner");
      expect(classified.content.photoMediaId).toBe("media-dinner");
    }
    const unknownLayout = { layoutVersion: 1, template: "future-template", sections: [] };
    expect(classifyBoardContent("fresh", unknownLayout).kind).toBe("unknown");
  });

  it("does not convert a layout document into MenuContent", () => {
    const doc = sampleLayout("two-menu-promo");
    // parseMenuContent is loose and may accept layout JSON; classification must prefer parseLayout.
    const classified = classifyBoardContent("fresh", doc);
    expect(classified.kind).toBe("layout");
    if (classified.kind === "layout") expect(classified.document.template).toBe("two-menu-promo");
  });
});

describe("old-route redirects and in-app paths", () => {
  it("maps /dashboard/media/layout-studio and its query strings onto the unified editor", () => {
    expect(layoutStudioRedirect({})).toBe("/dashboard/media/menus");
    expect(layoutStudioRedirect({ screen: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" })).toBe(
      "/dashboard/media/menus?screen=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa&new=1",
    );
    expect(layoutStudioRedirect({ menu: "board-lunch" })).toBe("/dashboard/media/menus?board=board-lunch");
    expect(layoutStudioRedirect({ board: "board-lunch", screen: "screen-1" })).toBe(
      "/dashboard/media/menus?board=board-lunch&screen=screen-1",
    );
    expect(layoutStudioRedirect({ layout: "two-menu-promo", new: "1" })).toBe(
      "/dashboard/media/menus?layout=two-menu-promo&new=1",
    );
    expect(unifiedEditorPath()).toBe("/dashboard/media/menus");
    expect(parseUnifiedSearch({ screen: "s1", new: "1" })).toEqual({
      boardId: null, screenId: "s1", layout: null, isNew: true,
    });
    expect(CONTENT_TAB_MENUS_LABEL).toBe("Menu boards");
    const page = readFileSync("app/dashboard/media/layout-studio/page.tsx", "utf8");
    expect(page).toContain("permanentRedirect");
    expect(page).toContain("layoutStudioRedirect");
    const actions = readFileSync("components/screen-actions.tsx", "utf8");
    expect(actions).toContain("/dashboard/media/menus?screen=");
    expect(actions).not.toContain("/dashboard/media/layout-studio?screen=");

  });
});

describe("publish path selection", () => {
  it("sends classic boards through /api/menus and layout boards through /api/layout-studio", () => {
    const classic = classifyBoardContent("classic", JSON.parse(readFileSync("tests/fixtures/legacy-menu-classic.json", "utf8")).content);
    const layout = classifyBoardContent("fresh", JSON.parse(readFileSync("tests/fixtures/legacy-layout-two-menu-promo.json", "utf8")));
    const createClassic = publishPathFor("classic", null);
    const patchClassic = publishPathFor("classic", "menu-1");
    const draftLayout = publishPathFor("layout", "board-1", "draft");
    const publishLayout = publishPathFor("layout", "board-1", "publish");
    expect(createClassic).toEqual({ kind: "classic", method: "POST", url: "/api/menus", mode: "save" });
    expect(patchClassic).toEqual({ kind: "classic", method: "PATCH", url: "/api/menus/menu-1", mode: "save" });
    expect(draftLayout).toEqual({ kind: "layout", method: "POST", url: "/api/layout-studio", mode: "draft" });
    expect(publishLayout).toEqual({ kind: "layout", method: "POST", url: "/api/layout-studio", mode: "publish" });
    expect(canSaveThrough(classic, createClassic)).toBe(true);
    expect(canSaveThrough(classic, draftLayout)).toBe(false);
    expect(canSaveThrough(layout, publishLayout)).toBe(true);
    expect(canSaveThrough(layout, patchClassic)).toBe(false);
  });

  it("the layout write path stores the palette, never a new row-template id", () => {
    const publish = readFileSync("lib/layout-publish.ts", "utf8");
    expect(publish).toMatch(/writeContent\(doc,\s*storedMenuTemplate\(doc\)\)/);
    const source = readFileSync("lib/server/layout-boards.ts", "utf8");
    // The server writes the template argument applyLayoutSave already set to the palette.
    expect(source).toMatch(/writeContent:\s*async\s*\(document,\s*template\)/);
    expect(source).not.toMatch(/template:\s*doc\.template/);
    expect(source).not.toMatch(/template:\s*document\.template/);
    for (const id of [...EXISTING_LAYOUTS, "two-column"] as const) {
      expect(storedMenuTemplate(sampleLayout(id))).not.toBe(id);
    }
  });
});

describe("region selection mapping", () => {
  it("maps classic preview regions to the menu and photo editors", () => {
    expect(classicPreviewHits(false)).toEqual([{ id: "menu", label: "Edit menu", box: { x: 0, y: 0, w: 1920, h: 1080 } }]);
    const withPhoto = classicPreviewHits(true);
    expect(withPhoto.map((hit) => hit.id)).toEqual(["menu", "photo"]);
    expect(withPhoto[0].box.w + withPhoto[1].box.w).toBe(1920);
    expect(classicEditorForRegion("menu", true)).toBe("menu");
    expect(classicEditorForRegion("photo", true)).toBe("photo");
    expect(classicEditorForRegion("photo", false)).toBe("photo");
  });

  it("keeps Layout Studio region hits for every layout option", () => {
    for (const option of LAYOUT_OPTIONS) {
      if (option.kind !== "layout" || !option.layoutTemplate) continue;
      const frame = frameFor(option.layoutTemplate, 0.5);
      const hits = previewHits(option.layoutTemplate, frame);
      expect(hits.length, option.id).toBeGreaterThan(0);
      expect(hits.every((hit) => hit.label && hit.box.w > 0)).toBe(true);
    }
    const two = previewHits("two-menu-promo", frameFor("two-menu-promo", 0.35));
    expect(two.map((hit) => hit.id)).toEqual(expect.arrayContaining(["column-0", "column-1", "feature"]));
  });
});

describe("draft scoping stays intact", () => {
  it("still refuses an empty or 'undefined' scope when building a draft key", () => {
    expect(() => draftStorageKey({ userId: "undefined", orgId: "org-a" })).toThrow(InvalidStudioScopeError);
    expect(() => writeStudioDraft({ setItem() { throw new Error("wrote"); } }, { userId: "", orgId: "org-a" }, {} as never)).toThrow(InvalidStudioScopeError);
    expect(draftStorageKey({ userId: "user-a", orgId: "org-a" })).toBe("layout-studio-draft-v1:user-a:org-a");
  });
});

describe("player and offline copy", () => {
  it("does not change player.html and does not claim the promo column plays offline", () => {
    const player = readFileSync("public/player.html", "utf8");
    expect(player).toContain("seemple-media-v1");
    const unify = readFileSync("lib/menu-board-unify.ts", "utf8");
    const menus = readFileSync("components/menu-boards.tsx", "utf8");
    for (const src of [unify, menus]) {
      expect(src.toLowerCase()).not.toMatch(/play(?:s|ing)? offline/);
      expect(src.toLowerCase()).not.toMatch(/offline.{0,40}video/);
    }
    // The cache name is only mentioned here as a test, not as a product claim.
  });
});
