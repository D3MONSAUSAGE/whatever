import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { placeZoneMedia } from "@/lib/layout-account";
import {
  BOARD_H, BOARD_W, boxesOverlap, clientAcceptsZoneBox, frameFor, layoutSvg, mediaVideoBox,
  parseLayout, playerComposition, sampleLayout, zoneCapabilities, type LayoutDocument, type LayoutTemplate,
} from "@/lib/layout-studio";
import { editorPanelForZone, keepDraftOnZoneChange, previewHits } from "@/lib/layout-studio-editor";
import { applyLibraryFile } from "@/lib/layout-account";

const existingTemplates: LayoutTemplate[] = ["menu-promo-67", "triple-column", "split-50", "menu-banner", "signature"];

describe("two-column menu + promo template", () => {
  it("is additive and leaves existing templates' frames and samples unchanged", () => {
    expect(frameFor("menu-promo-67", 0.67).video).toEqual({ x: 1286, y: 0, w: 634, h: 1080 });
    expect(frameFor("triple-column", 1 / 3).video).toBeNull();
    expect(frameFor("triple-column", 1 / 3).columns).toHaveLength(3);
    expect(sampleLayout("menu-promo-67").title).toBe("Casa Mesa");
    expect(sampleLayout("menu-promo-67").template).toBe("menu-promo-67");
    expect(sampleLayout("triple-column").title).toBe("Northbeam Coffee");
    expect(sampleLayout("split-50").featureTitle).toBe("Noon ride");
    expect(sampleLayout("menu-banner").footer).toBe("Members save 10% after 4");
    expect(sampleLayout("signature").title).toBe("Evening service");
    for (const template of existingTemplates) {
      const sample = sampleLayout(template);
      const parsed = parseLayout(sample);
      expect(parsed.ok).toBe(true);
      if (parsed.ok) {
        expect(parsed.value.template).toBe(template);
        expect(parsed.value.title).toBe(sample.title);
        expect(parsed.value.sections).toEqual(sample.sections);
        expect(layoutSvg(parsed.value)).toBe(layoutSvg(sample));
      }
      // A saved document with no new fields still parses (defaults for missing optional fields).
      const raw = { ...sample, columnWidths: undefined, imageFit: undefined, imageAnchor: undefined };
      const fromLegacy = parseLayout(raw);
      expect(fromLegacy.ok).toBe(true);
    }
    // Existing saved JSON with an old template id is not migrated.
    const saved = parseLayout({ ...sampleLayout("menu-promo-67"), template: "menu-promo-67" });
    expect(saved.ok && saved.value.template).toBe("menu-promo-67");
  });

  it("defines a 16:9 board with two menu columns and a promo video region", () => {
    const doc = sampleLayout("two-menu-promo");
    expect(doc.template).toBe("two-menu-promo");
    expect(doc.columnWidths).toEqual([0.35, 0.35, 0.30]);
    expect(doc.sections[0].name).toBe("Lunch");
    expect(doc.sections[1].name).toBe("Dinner");
    expect(doc.sections[0].items.length).toBeGreaterThanOrEqual(4);
    expect(doc.sections[1].items.some((item) => item.price.startsWith("$"))).toBe(true);
    const frame = frameFor("two-menu-promo", 0.35, [0.35, 0.35, 0.30]);
    expect(frame.menu.w + frame.feature.w).toBe(BOARD_W);
    expect(frame.menu.h).toBe(BOARD_H);
    expect(frame.columns[0].w).toBe(Math.round(BOARD_W * 0.35));
    expect(frame.columns[1].w).toBe(Math.round(BOARD_W * 0.35));
    expect(frame.columns[2]).toEqual(frame.feature);
    expect(frame.video).toEqual(frame.feature);
    expect(frame.video && frame.video.x + frame.video.w).toBe(BOARD_W);
    expect(boxesOverlap(frame.columns[0], frame.columns[1])).toBe(false);
    expect(boxesOverlap(frame.menu, frame.video!)).toBe(false);
    const zones = zoneCapabilities("two-menu-promo");
    expect(zones.find((z) => z.id === "column-0")).toMatchObject({ text: true, image: false, video: false });
    expect(zones.find((z) => z.id === "column-1")).toMatchObject({ text: true, image: false, video: false });
    expect(zones.find((z) => z.id === "feature")).toMatchObject({ label: "Promotion", image: true, video: true });
    const svg = layoutSvg(doc);
    expect(svg).toContain('viewBox="0 0 1920 1080"');
    expect(svg).toContain("LUNCH");
    expect(svg).toContain("DINNER");
    expect(svg).toContain("Chicken torta");
    expect(svg).toContain("Carne asada");
    expect(svg).toContain("$14");
    expect(svg).toContain("$26");
    expect(svg).toContain("Tonight");
    // Missing optional fields default instead of requiring a schema migration.
    const sparse = parseLayout({
      layoutVersion: 1,
      template: "two-menu-promo",
      split: 0.35,
      title: "Casa Mesa",
      subtitle: "",
      footer: "",
      sections: [
        { name: "Lunch", items: [{ name: "Torta", price: "$14", description: "Chicken" }] },
        { name: "Dinner", items: [{ name: "Steak", price: "$26", description: "Grilled" }] },
      ],
    });
    expect(sparse.ok).toBe(true);
    if (sparse.ok) {
      expect(sparse.value.imageFit).toBe("cover");
      expect(sparse.value.columnWidths).toBeNull();
      const fallback = frameFor("two-menu-promo", sparse.value.split, sparse.value.columnWidths);
      expect(fallback.video?.w).toBe(Math.round(BOARD_W * 0.30) || fallback.columns[2].w);
      expect(fallback.menu.w + fallback.feature.w).toBe(BOARD_W);
    }
  });

  it("feeds the existing player composition a 16:9-board promo video box, without a player.html change", () => {
    const doc: LayoutDocument = {
      ...sampleLayout("two-menu-promo"),
      videoMediaId: "00000000-0000-4000-8000-0000000000b1",
    };
    const box = mediaVideoBox(doc);
    expect(box).not.toBeNull();
    expect(clientAcceptsZoneBox(box!)).toBe(true);
    expect(box!.x + box!.w).toBe(BOARD_W);
    expect(box!.y + box!.h).toBeLessThanOrEqual(BOARD_H);
    const composition = playerComposition(doc, "https://png", "https://mp4");
    expect(composition?.video?.box).toEqual(box);
    expect(composition?.video?.url).toBe("https://mp4");
    const player = readFileSync("public/player.html", "utf8");
    expect(player).toContain("function zoneVideo");
    // The player is generic on composition.video.box; it has no template allowlist to update.
    expect(player).not.toContain("two-menu-promo");
    expect(player).not.toContain("menu-promo-67");
  });

  it("swaps or removes promo media without orphaning the other role or inventing a new download", () => {
    const image = { id: "img", name: "lunch-special.png", kind: "image" as const, mime: "image/png", url: "/already-loaded.png" };
    const video = { id: "vid", name: "promo.mp4", kind: "video" as const, mime: "video/mp4", url: "/already-loaded.mp4" };
    const doc = { ...sampleLayout("two-menu-promo"), imageMediaId: null, videoMediaId: "vid" };
    const afterImage = placeZoneMedia(applyLibraryFile(doc, image, "photo"), "photo", "img", true);
    expect(afterImage.imageMediaId).toBe("img");
    expect(afterImage.videoMediaId).toBeNull();
    const afterVideo = placeZoneMedia(applyLibraryFile({ ...doc, imageMediaId: "img", videoMediaId: null }, video, "video"), "video", "vid", true);
    expect(afterVideo.videoMediaId).toBe("vid");
    expect(afterVideo.imageMediaId).toBeNull();
    const removed = placeZoneMedia(afterVideo, "video", null, true);
    expect(removed.videoMediaId).toBeNull();
    expect(removed.imageMediaId).toBeNull();
    // Library rows themselves are untouched — only the board's media ids change.
    expect(image.url).toBe("/already-loaded.png");
    expect(video.url).toBe("/already-loaded.mp4");
  });
});

describe("selection-to-editor mapping", () => {
  it("maps each preview area to the editor panel shown beneath the preview", () => {
    expect(editorPanelForZone("menu")).toBe("menu");
    expect(editorPanelForZone("column-0")).toBe("menu");
    expect(editorPanelForZone("column-1")).toBe("menu");
    expect(editorPanelForZone("feature")).toBe("media");
    expect(editorPanelForZone("photo")).toBe("media");
    expect(editorPanelForZone("background")).toBe("background");
    expect(editorPanelForZone("")).toBe("none");
    const promo = previewHits("two-menu-promo", frameFor("two-menu-promo", 0.35, [0.35, 0.35, 0.30]));
    expect(promo.map((hit) => hit.id)).toEqual(["column-0", "column-1", "feature"]);
    expect(editorPanelForZone(promo[0].id)).toBe("menu");
    expect(editorPanelForZone(promo[2].id)).toBe("media");
    const classic = previewHits("menu-promo-67", frameFor("menu-promo-67", 0.67));
    expect(classic.map((hit) => hit.id)).toEqual(["menu", "feature"]);
  });

  it("does not lose unsaved edits when the selected area changes", () => {
    let draft = sampleLayout("menu-promo-67");
    let zone = "menu";
    const update = (next: typeof draft) => { draft = next; };
    update({
      ...draft,
      title: "Unsaved title",
      sections: draft.sections.map((section, i) => i === 0 ? {
        ...section,
        items: section.items.map((item, j) => j === 0 ? { ...item, name: "Edited taco", price: "$99" } : item),
      } : section),
    });
    zone = "feature";
    draft = keepDraftOnZoneChange(draft, "menu", zone);
    expect(draft.title).toBe("Unsaved title");
    expect(draft.sections[0].items[0].name).toBe("Edited taco");
    expect(draft.sections[0].items[0].price).toBe("$99");
    zone = "menu";
    draft = keepDraftOnZoneChange(draft, "feature", zone);
    expect(draft.sections[0].items[0].name).toBe("Edited taco");
    expect(draft.title).toBe("Unsaved title");
  });
});
