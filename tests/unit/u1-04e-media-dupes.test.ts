import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { MediaItem } from "@/lib/api";
import { duplicateImageMessage, duplicateImagesMessage, libraryLookupUrl, sameLibraryImage } from "@/lib/media-dupes";

const img = (id: string, fileName: string, createdAt: string, kind: MediaItem["kind"] = "image") =>
  ({ id, fileName, sizeBytes: 10, createdAt, url: null, kind }) as MediaItem;

describe("U1-04e: duplicate check on the Media page covers images", () => {
  it("looks images up with kind=image and videos with kind=video (default unchanged)", () => {
    const image = new URL(libraryLookupUrl("qa-special-promo.jpg", "image"), "https://x.test");
    expect(image.pathname).toBe("/api/media");
    expect(image.searchParams.get("kind")).toBe("image");
    expect(image.searchParams.get("q")).toBe("qa-special-promo.jpg");
    expect(new URL(libraryLookupUrl("a.mp4"), "https://x.test").searchParams.get("kind")).toBe("video");
  });

  it("matches an image by exact name only, never a video or presentation of that name", () => {
    const items = [img("v", "qa-special-promo.jpg", "2026-11-14", "video"), img("i1", "qa-special-promo.jpg", "2026-11-13"), img("i2", "qa-special-promo.jpg", "2026-11-14")];
    expect(sameLibraryImage(items, { name: "qa-special-promo.jpg" })?.id).toBe("i2");
    expect(sameLibraryImage(items, { name: "qa-special-promo (1).jpg" })).toBeNull();
    expect(sameLibraryImage([img("p", "deck.pdf", "2026-11-14", "presentation")], { name: "deck.pdf" })).toBeNull();
  });

  it("asks once for a multi-file pick, with the same wording as the editor for one file", () => {
    expect(duplicateImagesMessage(["a.jpg"])).toBe(duplicateImageMessage("a.jpg"));
    expect(duplicateImagesMessage(["a.jpg", "b.png"])).toBe("2 of these images are already in your library with the same name. Uploading again makes second copies.");
  });

  it("routes both Media upload buttons through the check; documents upload as before", () => {
    const src = readFileSync("components/media-library.tsx", "utf8");
    expect(src).toContain('onFiles={(files) => void uploadChecked(files, "image")}');
    expect(src).toContain('onFiles={(files) => void uploadChecked(files, "video")}');
    expect(src).not.toContain('uploads.enqueue(files, "image")');
    expect(src).toContain('title: "Already in your library"');
    expect(src).toContain('confirmLabel: "Upload a copy anyway"');
    expect(src).toContain('cancelLabel: "Keep the one I have"');
    // Gother low 2: all three upload buttons are disabled while the duplicate check or its prompt is open.
    expect(src.match(/disabled=\{uploads\.busy \|\| checking\}/g)?.length).toBe(3);
    expect(src).toMatch(/setChecking\(true\);\s*try \{ await checkThenUpload/);
  });
});
