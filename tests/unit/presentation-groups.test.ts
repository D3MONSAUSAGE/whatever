import { describe, expect, it } from "vitest";
import { effectiveSlideDuration, parseGroupDurationMs, groupProcessingFresh, deckFormat } from "@/lib/server/presentation-groups";
import { inspectPdf, looksLikePdf } from "@/lib/server/pdf";

describe("presentation group durations", () => {
  it("uses the slide override, then the playlist time, then the group default", () => {
    expect(effectiveSlideDuration(5000, 10000, 15000)).toBe(5000);
    expect(effectiveSlideDuration(null, 8000, 15000)).toBe(8000);
    expect(effectiveSlideDuration(null, null, 15000)).toBe(15000);
    expect(effectiveSlideDuration(null, null, null)).toBe(10000);
  });

  it("clamps to 3–3600 seconds", () => {
    expect(effectiveSlideDuration(1000, null, null)).toBe(3000);
    expect(effectiveSlideDuration(4_000_000, null, null)).toBe(3_600_000);
    expect(parseGroupDurationMs(2999)).toBe("invalid");
    expect(parseGroupDurationMs(3000)).toBe(3000);
    expect(parseGroupDurationMs(3_600_000)).toBe(3_600_000);
    expect(parseGroupDurationMs(3_600_001)).toBe("invalid");
    expect(parseGroupDurationMs(null)).toBeNull();
  });

  it("treats a recent processing row as still owned by the in-flight conversion", () => {
    const now = Date.parse("2026-11-06T12:00:00Z");
    expect(groupProcessingFresh(new Date(now - 30_000).toISOString(), now)).toBe(true);
    expect(groupProcessingFresh(new Date(now - 5 * 60_000).toISOString(), now)).toBe(false);
  });

  it("accepts pptx and pdf names and rejects legacy PowerPoint", () => {
    expect(deckFormat("Q3.pptx")?.ext).toBe("pptx");
    expect(deckFormat("menu.PDF")?.ext).toBe("pdf");
    expect(deckFormat("old.ppt")).toBeNull();
    expect(deckFormat("macros.pptm")).toBeNull();
    expect(looksLikePdf(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBe(true);
    expect(inspectPdf(new Uint8Array([1, 2, 3, 4]))).toEqual({ ok: false, reason: "type" });
  });
});
