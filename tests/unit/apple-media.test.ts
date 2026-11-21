import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { enforceVideoLimits, inspectMp4, memorySource, mp4ErrorMessage, VIDEO_UNREADABLE_MESSAGE } from "@/lib/mp4";
import { ART_UPLOAD_ACCEPT, IMAGE_UPLOAD_ACCEPT, VIDEO_UPLOAD_ACCEPT, heicToJpegName, isArtUploadFile, isHeicBrand, isImageUploadFile, isVideoUploadFile, looksLikeHeic } from "@/lib/media-accept";
import { FILE_UPLOAD } from "@/lib/file-upload";
import { en } from "@/lib/i18n/en";
import { es } from "@/lib/i18n/es";
import { codeForMessage } from "@/lib/server/error-codes";

function file(name: string) {
  return new Uint8Array(readFileSync(new URL(`../fixtures/${name}`, import.meta.url)));
}

function heicHeader(brand = "heic"): Uint8Array {
  const bytes = new Uint8Array(16);
  bytes.set([0, 0, 0, 16]);
  bytes.set(Buffer.from("ftyp"), 4);
  bytes.set(Buffer.from(brand), 8);
  bytes.set(Buffer.from(brand), 12);
  return bytes;
}

describe("Apple media accept lists", () => {
  it("widens every web video and photo picker with the shared constants", () => {
    expect(FILE_UPLOAD.video.accept).toBe(VIDEO_UPLOAD_ACCEPT);
    expect(FILE_UPLOAD.image.accept).toBe(IMAGE_UPLOAD_ACCEPT);
    expect(VIDEO_UPLOAD_ACCEPT).toContain("video/quicktime");
    expect(VIDEO_UPLOAD_ACCEPT).toContain(".mov");
    expect(VIDEO_UPLOAD_ACCEPT).toContain(".m4v");
    expect(IMAGE_UPLOAD_ACCEPT).toContain("image/heic");
    expect(IMAGE_UPLOAD_ACCEPT).toContain(".heic");
    expect(ART_UPLOAD_ACCEPT).toContain("image/heic");
    expect(ART_UPLOAD_ACCEPT).not.toContain("image/webp");

    for (const path of [
      "components/menu-templates.tsx",
      "components/layout-studio.tsx",
      "components/uploads.tsx",
      "lib/file-upload.ts",
      "lib/direct-upload.ts",
    ]) {
      const source = readFileSync(path, "utf8");
      expect(source, path).not.toMatch(/accept="video\/mp4,\.mp4"/);
    }
    const menu = readFileSync("components/menu-templates.tsx", "utf8");
    const studio = readFileSync("components/layout-studio.tsx", "utf8");
    expect(menu).toContain("VIDEO_UPLOAD_ACCEPT");
    expect(menu).toContain("IMAGE_UPLOAD_ACCEPT");
    expect(menu).toContain("isVideoUploadFile");
    expect(studio).toContain("IMAGE_UPLOAD_ACCEPT");
    expect(studio).toContain("asUploadImage");
  });

  it("lets Safari-style empty MIME types through when the extension is known", () => {
    expect(isVideoUploadFile({ type: "", name: "clip.MOV" })).toBe(true);
    expect(isVideoUploadFile({ type: "video/quicktime", name: "clip.mov" })).toBe(true);
    expect(isVideoUploadFile({ type: "video/x-m4v", name: "clip.m4v" })).toBe(true);
    expect(isVideoUploadFile({ type: "video/mp4", name: "clip.mp4" })).toBe(true);
    expect(isVideoUploadFile({ type: "video/quicktime", name: "clip" })).toBe(true);
    expect(isVideoUploadFile({ type: "application/pdf", name: "clip.pdf" })).toBe(false);

    expect(isImageUploadFile({ type: "", name: "IMG_1000.HEIC" })).toBe(true);
    expect(isImageUploadFile({ type: "image/heif", name: "photo.heif" })).toBe(true);
    expect(isImageUploadFile({ type: "image/jpeg", name: "patio.jpg" })).toBe(true);
    expect(isImageUploadFile({ type: "application/pdf", name: "doc.pdf" })).toBe(false);

    expect(isArtUploadFile({ type: "image/heic", name: "IMG_1000.HEIC" })).toBe(true);
    expect(isArtUploadFile({ type: "", name: "photo.heif" })).toBe(true);
    expect(isArtUploadFile({ type: "image/webp", name: "logo.webp" })).toBe(false);
    expect(isArtUploadFile({ type: "image/png", name: "logo" })).toBe(false);
  });
});

describe("HEIC detection", () => {
  it("recognizes names, MIME types and ftyp brands", () => {
    expect(looksLikeHeic({ type: "image/heic", name: "a.jpg" })).toBe(true);
    expect(looksLikeHeic({ type: "", name: "IMG_1.HEIC" })).toBe(true);
    expect(looksLikeHeic({ type: "image/jpeg", name: "patio.jpg" })).toBe(false);
    expect(isHeicBrand(heicHeader("heic"))).toBe(true);
    expect(isHeicBrand(heicHeader("mif1"))).toBe(true);
    expect(isHeicBrand(heicHeader("isom"))).toBe(false);
    expect(heicToJpegName("IMG_1000.HEIC")).toBe("IMG_1000.jpg");
    expect(heicToJpegName("photo.heif")).toBe("photo.jpg");
  });
});

describe("inspectMp4 Apple containers", () => {
  it("accepts H.264/AAC MOV and M4V and stores the same codec contract", async () => {
    for (const name of ["h264-aac.mov", "h264-aac.m4v", "h264-aac.mp4"]) {
      const result = await inspectMp4(memorySource(file(name)));
      expect(result.ok, name).toBe(true);
      if (!result.ok) continue;
      expect(result.videoCodec).toBe("avc1");
      expect(result.audioCodec).toBe("mp4a");
      expect(enforceVideoLimits(result, file(name).length)).toBeNull();
    }
  });

  it("rejects HEVC MOV with a message that explains Most Compatible", async () => {
    const hevc = await inspectMp4(memorySource(file("hevc-aac.mov")));
    expect(hevc).toEqual({ ok: false, reason: "codec" });
    expect(mp4ErrorMessage("codec")).toMatch(/Most Compatible/);
    expect(mp4ErrorMessage("codec")).toMatch(/HEVC \(H\.265\)/);
    expect(en["apiError.video_codec"]).toBe(mp4ErrorMessage("codec"));
    expect(es["apiError.video_codec"]).toMatch(/Más compatible/);
    expect(codeForMessage(mp4ErrorMessage("codec"), 415)).toBe("video_codec");
    expect(mp4ErrorMessage("type")).toMatch(/MOV or M4V/);
    expect(codeForMessage(mp4ErrorMessage("type"), 415)).toBe("video_type");
    expect(codeForMessage(VIDEO_UNREADABLE_MESSAGE, 415)).toBe("video_unreadable");
    expect(en["apiError.video_unreadable"]).toBe(VIDEO_UNREADABLE_MESSAGE);
  });
});
