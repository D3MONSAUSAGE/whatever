import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { accountSaveBody } from "@/lib/layout-account";
import { mediaHits, selectedVideoOption, videoPreview, type PreviewMedia } from "@/lib/board-preview";
import { designById, designDocument, designHasMedia, MENU_DESIGNS } from "@/lib/menu-designs";
import { designSvg } from "@/lib/menu-design-svg";
import { layoutMedia } from "@/lib/menu-designer";
import { layoutSvg, parseLayout, playerComposition, sampleLayout } from "@/lib/layout-studio";
import { renderLayoutPng } from "@/lib/server/layout-render";

const VIDEO = "00000000-0000-4000-8000-0000000000b1";
const PHOTO = "00000000-0000-4000-8000-0000000000a1";
const STILL = "https://cdn.example/still.jpg";
const library: PreviewMedia[] = [
  { id: PHOTO, name: "lunch.png", kind: "image", url: STILL },
  { id: VIDEO, name: "promo.mp4", kind: "video", url: "https://cdn.example/promo.mp4", thumbnailUrl: "https://cdn.example/promo.jpg" },
];

describe("video preview in the Menu Builder", () => {
  it("plays a library video in the promo box and uses the thumbnail as the poster", () => {
    const doc = { ...sampleLayout("two-menu-promo"), videoMediaId: VIDEO, imageMediaId: null };
    const preview = videoPreview(doc, library, null);
    expect(preview?.mediaId).toBe(VIDEO);
    expect(preview?.src).toBe("https://cdn.example/promo.mp4");
    expect(preview?.poster).toBe("https://cdn.example/promo.jpg");
    expect(preview?.fileName).toBe("promo.mp4");
    expect(preview?.placeholder).toBe(false);
    expect(preview?.box.w).toBeGreaterThan(0);
    expect(preview!.box.w).toBeLessThan(1920);
  });

  it("falls back to the still photo when the video has no thumbnail", () => {
    const doc = { ...sampleLayout("menu-promo-67"), videoMediaId: VIDEO };
    const noThumb: PreviewMedia[] = [{ id: VIDEO, name: "promo.mp4", kind: "video", url: "https://cdn.example/promo.mp4" }];
    const preview = videoPreview(doc, noThumb, STILL);
    expect(preview?.poster).toBe(STILL);
    expect(preview?.placeholder).toBe(false);
  });

  it("shows a labeled placeholder when the video is missing or still loading, and keeps the id selected", () => {
    const doc = { ...sampleLayout("split-50"), videoMediaId: VIDEO, imageMediaId: null };
    const preview = videoPreview(doc, [], null);
    expect(preview?.src).toBeNull();
    expect(preview?.poster).toBeNull();
    expect(preview?.placeholder).toBe(true);
    expect(selectedVideoOption([], VIDEO)).toEqual({ id: VIDEO, name: "", missing: true });
    expect(selectedVideoOption(library, VIDEO)).toEqual({ id: VIDEO, name: "promo.mp4", missing: false });
  });

  it("does not overlay a video on image-only layouts or designs, even if an id is still stored", () => {
    const twoCol = videoPreview({ ...sampleLayout("two-column"), videoMediaId: VIDEO }, library, STILL);
    const triple = videoPreview({ ...sampleLayout("triple-column"), videoMediaId: VIDEO }, library, STILL);
    const list = videoPreview({ ...designDocument(designById("taqueria")!), videoMediaId: VIDEO }, library, STILL);
    expect(twoCol).toBeNull();
    expect(triple).toBeNull();
    expect(list).toBeNull();
    expect(mediaHits({ ...sampleLayout("two-column"), videoMediaId: VIDEO })).toEqual([]);
    expect(layoutMedia("two-column").video).toBe(false);
    expect(designHasMedia(designById("taqueria")!)).toBe(false);
  });
});

describe("saved video persistence", () => {
  it("keeps videoMediaId through parse and the save payload, including after reopen", () => {
    const start = { ...designDocument(designById("happy-hour")!), videoMediaId: VIDEO };
    const parsed = parseLayout(start);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.videoMediaId).toBe(VIDEO);
    const body = accountSaveBody({ mode: "draft", menuId: "menu-1", name: "Happy hour", document: parsed.value });
    expect(body.document.videoMediaId).toBe(VIDEO);
    const reopened = parseLayout(body.document);
    expect(reopened.ok).toBe(true);
    if (reopened.ok) expect(reopened.value.videoMediaId).toBe(VIDEO);
  });
});

describe("image-only templates stay unchanged", () => {
  it("does not change a list design's SVG or published PNG when only a video id is set", () => {
    const base = designDocument(designById("taqueria")!);
    const withVideo = { ...base, videoMediaId: VIDEO };
    expect(designSvg(base)).toBe(designSvg(withVideo));
    expect(createHash("sha256").update(renderLayoutPng(base)).digest("hex"))
      .toBe(createHash("sha256").update(renderLayoutPng(withVideo)).digest("hex"));
    expect(playerComposition(withVideo, "https://x/still.png", "https://x/v.mp4")).toBeNull();
  });

  it("does not change a two-column layout SVG when only a video id is set", () => {
    const base = sampleLayout("two-column");
    const withVideo = { ...base, videoMediaId: VIDEO };
    expect(layoutSvg(base)).toBe(layoutSvg(withVideo));
    expect(playerComposition(withVideo, "https://x/still.png", "https://x/v.mp4")).toBeNull();
  });

  it("leaves every image-only premium design without a composition box or a preview overlay", () => {
    for (const design of MENU_DESIGNS) {
      if (designHasMedia(design)) continue;
      const doc = { ...designDocument(design), videoMediaId: VIDEO };
      expect(videoPreview(doc, library, STILL), design.id).toBeNull();
      expect(playerComposition(doc, "https://x/still.png", "https://x/v.mp4"), design.id).toBeNull();
    }
  });
});

describe("media area taps", () => {
  it("exposes only the dedicated video/photo box, never the full board", () => {
    const withVideo = mediaHits({ ...sampleLayout("two-menu-promo"), videoMediaId: VIDEO });
    expect(withVideo).toHaveLength(1);
    expect(withVideo[0].id).toBe("video");
    expect(withVideo[0].box.w).toBeLessThan(1920);
    const photoOnly = mediaHits({ ...sampleLayout("menu-promo-67"), videoMediaId: null });
    expect(photoOnly[0].id).toBe("photo");
    expect(mediaHits(sampleLayout("triple-column"))).toEqual([]);
    expect(mediaHits(designDocument(designById("taqueria")!))).toEqual([]);
  });
});
