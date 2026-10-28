import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { enforceVideoLimits, inspectMp4, memorySource, mp4ErrorMessage } from "@/lib/mp4";

function file(name: string) {
  return new Uint8Array(readFileSync(new URL(`../fixtures/${name}`, import.meta.url)));
}

describe("MP4 inspection", () => {
  it("accepts a tiny H.264/AAC file, including moov at the end", async () => {
    for (const name of ["h264-aac.mp4", "h264-aac-moov-end.mp4"]) {
      const result = await inspectMp4(memorySource(file(name)));
      expect(result.ok, name).toBe(true);
      if (!result.ok) continue;
      expect(result.videoCodec).toBe("avc1");
      expect(result.audioCodec).toBe("mp4a");
      expect(result.profile).toBe(66);
      expect(result.width).toBe(160);
      expect(result.height).toBe(120);
      expect(result.durationMs).toBeGreaterThan(500);
      expect(result.durationMs).toBeLessThan(2500);
      expect(enforceVideoLimits(result, file(name).length)).toBeNull();
    }
  });

  it("accepts H.264 with no audio", async () => {
    const result = await inspectMp4(memorySource(file("h264-silent.mp4")));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.audioCodec).toBeNull();
    expect(result.videoCodec).toBe("avc1");
  });

  it("rejects HEVC and a VP9 file renamed to .mp4", async () => {
    const hevc = await inspectMp4(memorySource(file("hevc.mp4")));
    expect(hevc).toEqual({ ok: false, reason: "codec" });
    expect(mp4ErrorMessage("codec")).toMatch(/H\.264/);

    const renamed = await inspectMp4(memorySource(file("vp9-renamed.mp4")));
    expect(renamed).toEqual({ ok: false, reason: "type" });
    expect(mp4ErrorMessage("type")).toMatch(/isn't an H\.264 MP4/);
  });

  it("rejects an empty buffer", async () => {
    const result = await inspectMp4(memorySource(new Uint8Array()));
    expect(result).toEqual({ ok: false, reason: "type" });
  });
});
