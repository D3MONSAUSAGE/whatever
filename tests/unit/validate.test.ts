import { describe, expect, it } from "vitest";
import { MAX_UPLOAD_BYTES } from "@/lib/server/limits";
import { normalizeDisplayName, normalizeFileName, normalizePairingCode, uploadSizeError } from "@/lib/server/validate";

describe("validation", () => {
  it("keeps a 6-digit pairing code and drops separators", () => {
    expect(normalizePairingCode("123456")).toBe("123456");
    expect(normalizePairingCode("123 456")).toBe("123456");
    expect(normalizePairingCode("12-34-56")).toBe("123456");
    expect(normalizePairingCode("12345")).toBeNull();
    expect(normalizePairingCode("1234567")).toBeNull();
    expect(normalizePairingCode("")).toBeNull();
    expect(normalizePairingCode(null)).toBeNull();
  });

  it("trims display names and rejects blanks", () => {
    expect(normalizeDisplayName("  Front counter  ")).toBe("Front counter");
    expect(normalizeDisplayName("a".repeat(80))).toBe("a".repeat(60));
    expect(normalizeDisplayName("   ")).toBeNull();
    expect(normalizeDisplayName(12)).toBeNull();
    expect(normalizeDisplayName("Cafe\u0000 bar")).toBe("Cafe bar");
  });

  it("normalizes library file names", () => {
    expect(normalizeFileName("menu.png")).toBe("menu.png");
    expect(normalizeFileName("lunch\nmenu.png")).toBe("lunchmenu.png");
    expect(normalizeFileName("   ")).toBe("image");
    expect(normalizeFileName(undefined)).toBe("image");
    expect(normalizeFileName("x".repeat(250)).length).toBe(200);
  });

  it("rejects empty and oversized uploads", () => {
    expect(uploadSizeError(0)).toMatch(/JPG/);
    expect(uploadSizeError(-1)).toMatch(/JPG/);
    expect(uploadSizeError(Number.NaN)).toMatch(/JPG/);
    expect(uploadSizeError(1)).toBeNull();
    expect(uploadSizeError(MAX_UPLOAD_BYTES)).toBeNull();
    expect(uploadSizeError(MAX_UPLOAD_BYTES + 1)).toMatch(/15 MB/);
  });
});
