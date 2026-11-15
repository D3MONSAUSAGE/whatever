import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { build, type Plugin } from "esbuild";
import { chromium } from "playwright";
import { duplicateImageMessage, sameLibraryImage } from "@/lib/media-dupes";
import { directUploadStatus } from "@/lib/direct-upload";
import type { MediaItem } from "@/lib/api";

// QA r8 lows: U1-04c (classic preview not redrawn after "Upload a photo") and
// U1-04d (direct upload skipped the "Already in your library" check).

const item = (id: string, fileName: string, createdAt: string, kind: MediaItem["kind"] = "image"): MediaItem =>
  ({ id, fileName, sizeBytes: 10, createdAt, url: null, kind });

describe("U1-04d: same-name check for direct logo/photo uploads", () => {
  it("finds an image with the same file name, newest first, ignoring videos and presentations", () => {
    const list = [item("a", "burger.jpg", "2026-11-01"), item("b", "burger.jpg", "2026-11-10"), item("v", "promo.jpg", "2026-11-12", "video"), item("p", "logo.png", "2026-11-12", "presentation")];
    expect(sameLibraryImage(list, { name: "burger.jpg" })?.id).toBe("b");
    expect(sameLibraryImage(list, { name: "promo.jpg" })).toBeNull();
    expect(sameLibraryImage(list, { name: "logo.png" })).toBeNull();
    expect(sameLibraryImage(list, { name: "Burger.jpg" })).toBeNull();
    expect(sameLibraryImage(undefined, { name: "burger.jpg" })).toBeNull();
  });

  it("uses the Media page wording and says when the existing file was kept", () => {
    expect(duplicateImageMessage("burger.jpg")).toBe("“burger.jpg” is already in your library. Uploading again makes a second copy with the same name.");
    expect(directUploadStatus({ phase: "kept", name: "logo.png" }, "logo")).toBe("Selected logo.png from your library. Click Save brand to apply.");
    expect(directUploadStatus({ phase: "kept", name: "burger.jpg" }, "photo")).toBe("Selected burger.jpg from your library. Save the board to apply.");
  });

  it("Brand Kit and the classic editor pass their logo/photo choices to the check", () => {
    expect(readFileSync("components/brand-kit.tsx", "utf8")).toMatch(/what="logo"\s+library=\{images\}/);
    expect(readFileSync("components/classic-editor.tsx", "utf8")).toMatch(/what="photo"\s+library=\{images\}/);
  });
});

describe("U1-04c: preview never silently drops a selected photo", () => {
  it("the preview route answers 503 instead of drawing a photo-less board", () => {
    const src = readFileSync("app/api/menus/preview/route.ts", "utf8");
    expect(src).toMatch(/if \(content\.value\.photoMediaId && !art\.photo\) return json\(\{ error: [^}]*\}, 503, \{ "Retry-After": "2" \}\)/);
  });

  const hasBrowser = (() => { try { return existsSync(chromium.executablePath()); } catch { return false; } })();
  const root = process.cwd();
  const stubs: Record<string, string> = {
    "@/lib/api": `export async function authToken(){return "t"} export async function api(p,o){const r=await fetch(p,o);return r.json()}`,
    "@/components/uploads": `export async function uploadArtImage(f,on){on(50,"");window.__uploads=(window.__uploads||0)+1;return "new-photo-id"}`,
  };
  const stubPlugin: Plugin = { name: "stubs", setup(b) {
    b.onResolve({ filter: /^@\/(lib\/api|components\/uploads)$/ }, (a) => ({ path: a.path, namespace: "stub" }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: stubs[a.path], loader: "js" }));
  } };
  const entry = `
    import React, { useState } from "react";
    import { createRoot } from "react-dom/client";
    import { ClassicEditor } from "@/components/classic-editor";
    const base = { id: "b1", name: "QA", template: "classic", displayIds: [], content: { title: "T", subtitle: "", footer: "", sections: [{ name: "Drinks", items: [{ name: "Tea", price: "2", description: "" }] }], photoMediaId: null, useBrand: true } };
    function App() {
      const [draft, setDraft] = useState(base);
      const [images, setImages] = useState([{ id: "old-burger", fileName: "burger.jpg", kind: "image", sizeBytes: 1, createdAt: "2026-11-01", url: null }]);
      return React.createElement(ClassicEditor, { images, draft, setDraft: (d) => d && setDraft(d), displays: [], onSaved() {}, onError() {}, brand: null,
        onImageUploaded: async () => { setImages((list) => list.some((m) => m.id === "new-photo-id") ? list : [{ id: "new-photo-id", fileName: "fresh.jpg", kind: "image", sizeBytes: 2, createdAt: "2026-11-14", url: null }, ...list]); } });
    }
    createRoot(document.getElementById("root")).render(React.createElement(App));
  `;

  it.skipIf(!hasBrowser)("redraws with the uploaded photo, retries a not-ready photo, and Keep selects the existing copy", async () => {
    const out = await build({
      stdin: { contents: entry, resolveDir: root, loader: "tsx" }, bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic",
      alias: { "@": root }, define: { "process.env.NODE_ENV": '"production"', "process.env": "{}" }, logLevel: "silent", plugins: [stubPlugin],
    });
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      const sent: (string | null)[] = [];
      let notReadyOnce = true;
      await page.route("http://u104.test/", (r) => r.fulfill({ contentType: "text/html", body: `<div id="root"></div>` }));
      await page.route("**/api/menus/preview", async (r) => {
        const photo = JSON.parse(r.request().postData() || "{}").content.photoMediaId ?? null;
        sent.push(photo);
        if (photo === "new-photo-id" && notReadyOnce) { notReadyOnce = false; return r.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Couldn't load the photo." }) }); }
        return r.fulfill({ status: 200, contentType: "image/png", body: Buffer.from("89504e470d0a1a0a", "hex") });
      });
      await page.goto("http://u104.test/");
      await page.addScriptTag({ content: out.outputFiles[0].text });
      await expect.poll(() => sent.length).toBeGreaterThan(0);

      // New file: uploads, selects it, and the preview is asked for again with the new id (503 once, then retried).
      await page.locator('[data-testid="direct-upload-photo-input"]').setInputFiles({ name: "fresh.jpg", mimeType: "image/jpeg", buffer: Buffer.from([255, 216, 255]) });
      await expect.poll(() => sent.filter((p) => p === "new-photo-id").length, { timeout: 8000 }).toBeGreaterThanOrEqual(2);
      expect(await page.locator("select").first().inputValue()).toBe("new-photo-id");
      await expect.poll(() => page.locator('[role="alert"]').count()).toBe(0);

      // Same name as a library photo: the dialog appears, Keep selects the existing one and uploads nothing.
      const before = await page.evaluate(() => (window as unknown as { __uploads?: number }).__uploads ?? 0);
      await page.locator('[data-testid="direct-upload-photo-input"]').setInputFiles({ name: "burger.jpg", mimeType: "image/jpeg", buffer: Buffer.from([255, 216, 255]) });
      await page.getByRole("button", { name: "Keep the one I have" }).click();
      await expect.poll(() => page.locator("select").first().inputValue()).toBe("old-burger");
      await expect.poll(() => sent.includes("old-burger")).toBe(true);
      expect(await page.evaluate(() => (window as unknown as { __uploads?: number }).__uploads ?? 0)).toBe(before);
      expect(await page.getByTestId("direct-upload-photo").textContent()).toContain("Selected burger.jpg from your library.");

      // Upload a copy anyway: goes through the normal upload.
      await page.locator('[data-testid="direct-upload-photo-input"]').setInputFiles({ name: "burger.jpg", mimeType: "image/jpeg", buffer: Buffer.from([255, 216, 255]) });
      await page.getByRole("button", { name: "Upload a copy anyway" }).click();
      await expect.poll(() => page.evaluate(() => (window as unknown as { __uploads?: number }).__uploads ?? 0)).toBe(before + 1);
    } finally {
      await browser.close();
    }
  }, 60_000);
});
