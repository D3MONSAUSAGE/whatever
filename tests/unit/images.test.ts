import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkImage, sniffImage } from "@/lib/server/images";
import { jpeg, png, webp, webpLossless } from "../helpers/bytes";

describe("image bytes", () => {
  it("accepts jpeg, png, and webp and reads dimensions", () => {
    expect(checkImage(jpeg(1920, 1080))).toMatchObject({ ok: true, mime: "image/jpeg", ext: "jpg", width: 1920, height: 1080 });
    expect(checkImage(png(1080, 1920))).toMatchObject({ ok: true, mime: "image/png", ext: "png", width: 1080, height: 1920 });
    expect(checkImage(webp(1280, 720))).toMatchObject({ ok: true, mime: "image/webp", ext: "webp", width: 1280, height: 720 });
    expect(checkImage(webpLossless(2, 3))).toMatchObject({ ok: true, width: 2, height: 3 });
  });

  it("ignores the claimed type and rejects non-images", () => {
    expect(sniffImage(new TextEncoder().encode("GIF89a"))).toBeNull();
    expect(checkImage(new TextEncoder().encode("<html>not an image</html>"))).toEqual({ ok: false, reason: "type" });
    expect(checkImage(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]))).toEqual({ ok: false, reason: "type" });
    expect(checkImage(new Uint8Array([0xff, 0xd8, 0xff]))).toEqual({ ok: false, reason: "type" });
    expect(checkImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toEqual({ ok: false, reason: "type" });
  });

  it("rejects decompression bombs", () => {
    expect(checkImage(jpeg(8000, 10))).toEqual({ ok: false, reason: "dimensions" });
    expect(checkImage(jpeg(7000, 7000))).toEqual({ ok: false, reason: "dimensions" });
    expect(checkImage(png(100_000, 1))).toEqual({ ok: false, reason: "dimensions" });
    expect(checkImage(webp(9000, 100))).toEqual({ ok: false, reason: "dimensions" });
  });

  it("does not mention server secrets in the browser sources", () => {
    const files = [
      "public/player.html",
      "lib/supabase-browser.ts",
      "lib/api.ts",
      "lib/prepare-image.ts",
      "app/login/page.tsx",
      "app/dashboard/layout.tsx",
      "app/dashboard/media/page.tsx",
      "app/dashboard/displays/page.tsx",
      "components/tv.tsx",
    ];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
      expect(text, file).not.toContain("PAIRING_CODE_SECRET");
      expect(text, file).not.toContain("service_role");
    }
  });
});
