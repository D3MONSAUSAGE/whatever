import { describe, expect, it } from "vitest";
import { MAX_VIDEO_BYTES, MAX_VIDEO_MB, enforceVideoLimits, inspectMp4, mp4ErrorMessage, type Mp4Info } from "@/lib/mp4";
import { signedUploadTarget, tusEndpoint } from "@/lib/prepare-video";
import { storedObjectSize, storedObjectSource } from "@/lib/server/video";
import { setTestDb } from "@/lib/server/supabase";
import { createFakeDb } from "../api/fake-db";
import { readFileSync } from "node:fs";

const info: Mp4Info = { durationMs: 1000, width: 1280, height: 720, videoCodec: "avc1", audioCodec: "mp4a", profile: 100, level: 41 };

describe("500 MB video limit", () => {
  it("names the new cap in the user-facing message and allows a 500 MB file", () => {
    expect(MAX_VIDEO_MB).toBe(500);
    expect(MAX_VIDEO_BYTES).toBe(500 * 1024 * 1024);
    expect(mp4ErrorMessage("size")).toBe("Videos must be 500 MB or smaller.");
    expect(enforceVideoLimits(info, MAX_VIDEO_BYTES)).toBeNull();
    expect(enforceVideoLimits(info, MAX_VIDEO_BYTES + 1)).toBe("size");
  });

  it("builds the TUS endpoint and object path from a signed upload URL", () => {
    const signed = "https://iybmjtkjfxcqupvhoddh.supabase.co/storage/v1/object/upload/sign/media/acct/clip-id.mp4?token=abc";
    expect(tusEndpoint(signed)).toBe("https://iybmjtkjfxcqupvhoddh.storage.supabase.co/storage/v1/upload/resumable");
    expect(signedUploadTarget(signed)).toEqual({ bucket: "media", path: "acct/clip-id.mp4" });
    expect(signedUploadTarget("https://example.com/not-a-signed-url")).toBeNull();
  });

  it("inspects a stored MP4 with range reads, not a full download", async () => {
    const fake = createFakeDb();
    setTestDb(fake.client);
    const path = "acct/clip.mp4";
    const bytes = new Uint8Array(readFileSync(new URL("../fixtures/h264-aac.mp4", import.meta.url)));
    fake.store.objects.set(path, bytes);
    const size = await storedObjectSize(path);
    expect(size).toBe(bytes.length);
    const result = await inspectMp4(storedObjectSource(path, size!));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.videoCodec).toBe("avc1");
      expect(result.width).toBeGreaterThan(0);
    }
  });
});
