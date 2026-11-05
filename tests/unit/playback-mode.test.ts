import { describe, expect, it } from "vitest";
import { normalizePlaybackMode } from "@/lib/server/validate";

describe("normalizePlaybackMode", () => {
  it("accepts auto and manual", () => {
    expect(normalizePlaybackMode("auto")).toBe("auto");
    expect(normalizePlaybackMode("manual")).toBe("manual");
  });

  it("rejects everything else", () => {
    expect(normalizePlaybackMode(undefined)).toBeNull();
    expect(normalizePlaybackMode(null)).toBeNull();
    expect(normalizePlaybackMode("")).toBeNull();
    expect(normalizePlaybackMode("Automatic")).toBeNull();
    expect(normalizePlaybackMode("slideshow")).toBeNull();
  });
});
