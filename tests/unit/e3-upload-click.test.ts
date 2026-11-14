import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { build } from "esbuild";
import { chromium } from "playwright";
import { openFilePicker } from "@/lib/direct-upload";

// E3 hotfix (retest 5): "Upload a logo" / "Upload a photo" must open the file chooser on click and on Enter.

describe("E3 hotfix: the upload button opens the file chooser", () => {
  it("openFilePicker clicks the hidden input, and does nothing when disabled or missing", () => {
    let clicks = 0;
    expect(openFilePicker({ disabled: false, click: () => { clicks++; } })).toBe(true);
    expect(clicks).toBe(1);
    expect(openFilePicker({ disabled: true, click: () => { clicks++; } })).toBe(false);
    expect(openFilePicker(null)).toBe(false);
    expect(clicks).toBe(1);
  });

  it("is a real button wired to the input through a ref (no wrapping label)", () => {
    const src = readFileSync("components/direct-image-upload.tsx", "utf8");
    expect(src).toMatch(/<button\s+type="button"[\s\S]*?onClick=\{\(\) => openFilePicker\(inputRef\.current\)\}/);
    expect(src).toMatch(/ref=\{inputRef\}\s+type="file"/);
    expect(src).not.toMatch(/<label/);
  });

  const hasBrowser = (() => { try { return existsSync(chromium.executablePath()); } catch { return false; } })();

  it.skipIf(!hasBrowser)("in a real browser, a click, Enter and Space all open the chooser and an upload completes", async () => {
    const root = process.cwd();
    const entry = `
      import React from "react";
      import { createRoot } from "react-dom/client";
      import { DirectImageUpload } from "@/components/direct-image-upload";
      window.__uploaded = [];
      createRoot(document.getElementById("root")).render(
        React.createElement("div", null,
          React.createElement(DirectImageUpload, { what: "logo", upload: async (f) => "id-" + f.name, onUploaded: (id) => { window.__uploaded.push(id); } }),
          React.createElement(DirectImageUpload, { what: "photo", disabled: true, onUploaded: () => {} })));
    `;
    const out = await build({
      stdin: { contents: entry, resolveDir: root, loader: "tsx" },
      bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic",
      alias: { "@": root },
      define: { "process.env.NODE_ENV": '"production"', "process.env": "{}" },
      logLevel: "silent",
    });
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.setContent(`<div id="root"></div><script>${out.outputFiles[0].text}</script>`);
      const logo = page.getByRole("button", { name: "Upload a logo" });
      await expect.poll(() => logo.count()).toBe(1);

      const byClick = page.waitForEvent("filechooser", { timeout: 5000 });
      await logo.click();
      const chooser = await byClick;
      await chooser.setFiles({ name: "logo.png", mimeType: "image/png", buffer: Buffer.from([137, 80, 78, 71]) });
      await expect.poll(() => page.evaluate(() => (window as unknown as { __uploaded: string[] }).__uploaded)).toEqual(["id-logo.png"]);

      const byKey = page.waitForEvent("filechooser", { timeout: 5000 });
      await logo.focus();
      await page.keyboard.press("Enter");
      await byKey;

      const bySpace = page.waitForEvent("filechooser", { timeout: 5000 });
      await logo.focus();
      await page.keyboard.press("Space");
      await bySpace;

      // Disabled stays disabled (editor read-only), and the hidden input is out of the tab order.
      expect(await page.getByRole("button", { name: "Upload a photo" }).isDisabled()).toBe(true);
      expect(await page.locator('[data-testid="direct-upload-logo-input"]').getAttribute("tabindex")).toBe("-1");
    } finally {
      await browser.close();
    }
  }, 60_000);
});
