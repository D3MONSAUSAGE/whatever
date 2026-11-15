import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { artImages } from "@/lib/brand-kit";
import { ART_UPLOAD_ACCEPT, artUploadError, directUploadStatus } from "@/lib/direct-upload";
import type { MediaItem } from "@/lib/api";

describe("E3: upload a logo or photo from the editor", () => {
  it("only accepts files the logo and photo pickers can list", () => {
    expect(ART_UPLOAD_ACCEPT).toBe("image/jpeg,image/png");
    expect(artUploadError({ type: "image/png", name: "logo.png" })).toBeNull();
    expect(artUploadError({ type: "image/jpeg", name: "Patio.JPEG" })).toBeNull();
    expect(artUploadError({ type: "image/webp", name: "logo.webp" })).toBe("Choose a JPG or PNG image.");
    expect(artUploadError({ type: "image/png", name: "logo" })).toBe("Choose a JPG or PNG image.");
    // Anything accepted shows up in the same picker list the upload selects from.
    const item = { id: "m1", kind: "image", fileName: "Patio.JPEG" } as MediaItem;
    expect(artImages([item])).toHaveLength(1);
  });

  it("explains progress, success and errors in plain words", () => {
    expect(directUploadStatus({ phase: "idle" }, "logo")).toBe("");
    expect(directUploadStatus({ phase: "busy", name: "logo.png", progress: 41.6 }, "logo")).toBe("Uploading logo.png… 42%");
    expect(directUploadStatus({ phase: "done", name: "logo.png" }, "logo")).toBe("Uploaded logo.png to Media and selected. Click Save brand to apply.");
    expect(directUploadStatus({ phase: "done", name: "patio.jpg" }, "photo")).toBe("Uploaded patio.jpg to Media and selected. Save the board to apply.");
    expect(directUploadStatus({ phase: "error", message: "Images must be 15 MB or smaller." }, "photo")).toBe("Images must be 15 MB or smaller.");
  });

  it("reuses the Media page pipeline: same checks, 15 MB limit and /api/media endpoint", () => {
    const uploads = readFileSync("components/uploads.tsx", "utf8");
    expect(uploads).toMatch(/const MAX = 15 \* 1024 \* 1024;/);
    expect(uploads).toMatch(/export async function uploadArtImage[\s\S]*?await uploadImage\(file, onProgress\)/);
    expect(uploads).toMatch(/return uploadForm\("\/api\/media", form, token/);
    const comp = readFileSync("components/direct-image-upload.tsx", "utf8");
    expect(comp).toMatch(/upload = uploadArtImage/);
    expect(comp).not.toMatch(/fetch\(|supabase|storage/i);
  });

  it("selects the new image after the media list reloads, in both editors", () => {
    const brand = readFileSync("components/brand-kit.tsx", "utf8");
    expect(brand).toMatch(/await liveMedia\.reload\(\);\s*setForm\(\(current\) => \(current \? \{ \.\.\.current, logoMediaId: id \}/);
    const classic = readFileSync("components/classic-editor.tsx", "utf8");
    expect(classic).toMatch(/await onImageUploaded\?\.\(\);[\s\S]*?photoMediaId: id/);
    const boards = readFileSync("components/menu-boards.tsx", "utf8");
    expect(boards).toMatch(/onImageUploaded=\{fixture \? undefined : \(\) => liveMedia\.reload\(\)\}/);
  });

  it("refreshes the classic preview right after an Up/Down move (QA retest 3 low)", () => {
    const classic = readFileSync("components/classic-editor.tsx", "utf8");
    // MB-1: the open product card follows the move (cards.moved / cards.sectionMoved) before the update.
    expect(classic.match(/refreshNow\.current = true; (cards\.(moved|sectionMoved)\([^)]*\); )?update\(/g)).toHaveLength(2);
    expect(classic).toMatch(/const delay = refreshNow\.current \? 150 : 450;/);
    // Superseded renders are aborted, so rapid moves never overlap preview POSTs (Gother low 1).
    expect(classic).toMatch(/signal: abort\.signal/);
    expect(classic.match(/abort\.abort\(\);/g)).toHaveLength(2);
    // A failed refresh over an existing preview says so and offers a retry (Gother low 2).
    expect(classic).toMatch(/Preview didn&apos;t update\./);
    expect(classic).toMatch(/setPreviewRetry\(\(n\) => n \+ 1\)/);
    expect(classic).toMatch(/Updating preview…/);
  });
});
