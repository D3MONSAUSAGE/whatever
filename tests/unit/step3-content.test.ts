import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { en } from "@/lib/i18n/en";
import { es } from "@/lib/i18n/es";
import { readAccountStudio, selectFeaturedMedia } from "@/lib/layout-account";
import { designById, designDocument } from "@/lib/menu-designs";
import { sampleLayout } from "@/lib/layout-studio";

const PHOTO_ID = "00000000-0000-4000-8000-0000000000a1";
const PHOTO_ID_2 = "00000000-0000-4000-8000-0000000000a2";
const VIDEO_ID = "00000000-0000-4000-8000-0000000000b1";

describe("Step 3 Content featured media selection", () => {
  it("selects a single photo, switches to a video, switches back, and clears with none", () => {
    const start = designDocument(designById("modern-restaurant")!);
    expect(start.stockPhoto).toBeTruthy();

    const withPhoto = selectFeaturedMedia(start, { kind: "image", id: PHOTO_ID }, { isDesign: true, supportsVideo: true, exclusive: true });
    expect(withPhoto.imageMediaId).toBe(PHOTO_ID);
    expect(withPhoto.videoMediaId).toBeNull();
    expect(withPhoto.stockPhoto).toBeUndefined();

    const withVideo = selectFeaturedMedia(withPhoto, { kind: "video", id: VIDEO_ID }, { isDesign: true, supportsVideo: true, exclusive: true });
    expect(withVideo.videoMediaId).toBe(VIDEO_ID);
    expect(withVideo.imageMediaId).toBeNull();
    expect(withVideo.stockPhoto).toBeUndefined();

    const backToPhoto = selectFeaturedMedia(withVideo, { kind: "image", id: PHOTO_ID_2 }, { isDesign: true, supportsVideo: true, exclusive: true });
    expect(backToPhoto.imageMediaId).toBe(PHOTO_ID_2);
    expect(backToPhoto.videoMediaId).toBeNull();

    const cleared = selectFeaturedMedia(backToPhoto, { kind: "none" }, { isDesign: true, supportsVideo: true });
    expect(cleared.imageMediaId).toBeNull();
    expect(cleared.videoMediaId).toBeNull();
    expect(cleared.stockPhoto).toBeUndefined();
  });

  it("restores the template sample photo and clears custom photo/video IDs", () => {
    const withVideo = { ...designDocument(designById("modern-restaurant")!), imageMediaId: PHOTO_ID, videoMediaId: VIDEO_ID, stockPhoto: undefined };
    const sample = selectFeaturedMedia(withVideo, { kind: "sample", stockPhoto: "steak" }, { isDesign: true, supportsVideo: true });
    expect(sample.imageMediaId).toBeNull();
    expect(sample.videoMediaId).toBeNull();
    expect(sample.stockPhoto).toBe("steak");
  });

  it("ignores video selection when the template or layout does not support video", () => {
    const layoutDoc = { ...sampleLayout("two-column"), imageMediaId: PHOTO_ID, videoMediaId: null };
    const unchanged = selectFeaturedMedia(layoutDoc, { kind: "video", id: VIDEO_ID }, { isDesign: false, supportsVideo: false });
    expect(unchanged).toEqual(layoutDoc);
  });

  it("reads processingStatus and processingError when present on studio media and omits when absent", () => {
    const parsed = readAccountStudio({
      boards: [],
      legacy: [],
      library: [
        { id: PHOTO_ID, name: "photo.jpg", kind: "image", mime: "image/jpeg", url: "https://cdn.example/p.jpg", thumbnailUrl: null },
        {
          id: VIDEO_ID,
          name: "clip.mp4",
          kind: "video",
          mime: "video/mp4",
          url: null,
          thumbnailUrl: null,
          processingStatus: "processing",
          processingError: null,
        },
        {
          id: PHOTO_ID_2,
          name: "broken.mp4",
          kind: "video",
          mime: "video/mp4",
          url: null,
          thumbnailUrl: null,
          processingStatus: "failed",
          processingError: "Conversion failed",
        },
      ],
    });
    expect(parsed).not.toBeNull();
    expect(parsed!.library[0]).not.toHaveProperty("processingStatus");
    expect(parsed!.library[1].processingStatus).toBe("processing");
    expect(parsed!.library[2].processingStatus).toBe("failed");
    expect(parsed!.library[2].processingError).toBe("Conversion failed");
  });
});

describe("Step 3 Content i18n and UI structure", () => {
  it("provides matching EN and ES translations for Step 3 Content", () => {
    expect(en["tpl.step.content"]).toBe("Content");
    expect(es["tpl.step.content"]).toBe("Contenido");
    expect(en["tpl.contentTitle"]).toBe("Content");
    expect(es["tpl.contentTitle"]).toBe("Contenido");
    expect(en["tpl.featuredMedia"]).toBe("Featured media");
    expect(es["tpl.featuredMedia"]).toBe("Archivo destacado");
    expect(en["tpl.featuredMediaHint"]).toBe("Choose a photo or video to display in the featured area of your menu board.");
    expect(en["tpl.filter.all"]).toBe("All");
    expect(es["tpl.filter.all"]).toBe("Todo");
    expect(en["tpl.filter.photos"]).toBe("Photos");
    expect(es["tpl.filter.photos"]).toBe("Fotos");
    expect(en["cp.filter.video"]).toBe("Videos");
    expect(es["cp.filter.video"]).toBe("Videos");
    expect(en["tpl.uploadMedia"]).toBe("Upload media");
    expect(es["tpl.uploadMedia"]).toBe("Subir archivo");
    expect(en["tpl.noFeaturedMedia"]).toBe("No media");
    expect(es["tpl.noFeaturedMedia"]).toBe("Sin archivo");
    expect(en["tpl.featureTitle"]).toBe("Featured text");
    expect(es["tpl.featureTitle"]).toBe("Texto destacado");
    expect(en["tpl.videoUnreadyBlocked"]).toBeTruthy();
    expect(es["tpl.videoUnreadyBlocked"]).toBeTruthy();
  });

  it("renders unified Step 3 controls without separate photo/video dropdowns or buttons", () => {
    const src = readFileSync("components/menu-templates.tsx", "utf8");
    const step3Start = src.indexOf('data-testid="tpl-step-content"');
    const step3End = src.indexOf("{step === 3 ?", step3Start);
    expect(step3Start).toBeGreaterThan(-1);
    expect(step3End).toBeGreaterThan(step3Start);
    const step3Block = src.slice(step3Start, step3End);

    expect(src).toContain('t("tpl.step.content")');
    expect(step3Block).toContain('t("tpl.contentTitle")');
    expect(step3Block).toContain('data-testid="tpl-featured-media"');
    expect(step3Block).toContain('data-testid="tpl-media-upload"');
    expect(step3Block).toContain('data-testid="tpl-media-none"');
    expect(step3Block).toContain('data-testid="tpl-media-filters"');
    expect(step3Block).toContain('data-testid="tpl-media-grid"');
    expect(step3Block).toContain('data-testid="tpl-featured-text"');
    expect(step3Block).toContain("unreadySelectedVideo");
    expect(step3Block).not.toContain("data-testid=\"tpl-video\"");
    expect(step3Block).not.toContain("tpl.videoTitle");
    expect(step3Block).not.toContain("tpl.pickVideo");
    expect(step3Block).not.toContain("tpl.uploadVideo");
    expect(step3Block).not.toContain("tpl.uploadPhoto");
  });
});
