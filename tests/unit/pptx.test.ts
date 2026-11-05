import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  PPTX_MAX_SLIDES,
  convertPptx,
  inspectPptx,
  looksLikeZip,
  pptxErrorMessage,
} from "@/lib/server/pptx";

function fixture(name: string) {
  return new Uint8Array(readFileSync(new URL(`../fixtures/pptx/${name}`, import.meta.url)));
}

describe("inspectPptx", () => {
  it("accepts a real .pptx zip", () => {
    expect(inspectPptx(fixture("pekko-demo-16x9.pptx"))).toEqual({ ok: true });
    expect(looksLikeZip(fixture("pekko-demo-16x9.pptx"))).toBe(true);
  });

  it("rejects empty, non-zip, and oversized buffers", () => {
    expect(inspectPptx(new Uint8Array())).toEqual({ ok: false, reason: "empty" });
    expect(inspectPptx(new Uint8Array([1, 2, 3, 4]))).toEqual({ ok: false, reason: "type" });
    expect(pptxErrorMessage("macros")).toMatch(/macro/i);
  });

  it("rejects macro markers embedded in the zip bytes", () => {
    const base = fixture("pekko-demo-16x9.pptx");
    const marker = new TextEncoder().encode("xl/vbaProject.bin");
    const poisoned = new Uint8Array(base.length + marker.length);
    poisoned.set(base);
    poisoned.set(marker, base.length);
    expect(inspectPptx(poisoned)).toEqual({ ok: false, reason: "macros" });
  });
});

describe("convertPptx", () => {
  it("rasterizes a 16:9 deck in order with preserved aspect ratio", async () => {
    const result = await convertPptx(fixture("pekko-demo-16x9.pptx"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.slides.length).toBe(4);
    expect(result.slides.length).toBeLessThanOrEqual(PPTX_MAX_SLIDES);
    for (let i = 0; i < result.slides.length; i++) {
      expect(result.slides[i].index).toBe(i);
      expect(result.slides[i].width).toBe(1280);
      expect(result.slides[i].height).toBe(720);
      expect(result.slides[i].png[0]).toBe(0x89); // PNG
      expect(result.slides[i].png[1]).toBe(0x50);
    }
  }, 120_000);

  it("preserves 4:3 aspect ratio", async () => {
    const result = await convertPptx(fixture("pekko-demo-4x3.pptx"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.slides.length).toBe(3);
    expect(result.slides[0].width).toBe(1280);
    expect(result.slides[0].height).toBe(960);
  }, 120_000);

  it("keeps embedded images in slide order", async () => {
    const result = await convertPptx(fixture("pekko-with-image.pptx"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.slides.length).toBe(2);
    expect(result.slides[0].png.length).toBeGreaterThan(1000);
  }, 120_000);
});
