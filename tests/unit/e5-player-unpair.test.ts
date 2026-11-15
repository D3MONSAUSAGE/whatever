import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { chromium } from "playwright";

// E5: "Unpair this TV" on the web player (public/player.html), in a real browser.

const hasBrowser = (() => { try { return existsSync(chromium.executablePath()); } catch { return false; } })();
const html = readFileSync("public/player.html", "utf8");
const TOKEN = "t".repeat(43);

describe("E5: on-TV unpair", () => {
  it.skipIf(!hasBrowser)("opens with OK, Cancel is focused first, and Unpair clears this TV and shows a new code", async () => {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      const calls: string[] = [];
      let unpairToken: string | null = null;
      await page.route("http://player.test/**", async (route) => {
        const url = new URL(route.request().url());
        calls.push(`${route.request().method()} ${url.pathname}`);
        if (url.pathname === "/tv") return route.fulfill({ contentType: "text/html", body: html });
        if (url.pathname === "/api/player/state") return route.fulfill({ contentType: "application/json", body: JSON.stringify({ version: 1, media: null, playlist: null, pollMs: 60000 }) });
        if (url.pathname === "/api/player/unpair") { unpairToken = route.request().headers()["x-display-token"] ?? null; return route.fulfill({ contentType: "application/json", body: '{"ok":true}' }); }
        if (url.pathname === "/api/player/pair") return route.fulfill({ contentType: "application/json", body: JSON.stringify({ sessionId: "00000000-0000-4000-8000-000000000001", code: "482913", secret: "s".repeat(43), expiresInSeconds: 600 }) });
        if (url.pathname === "/api/player/pair/status") return route.fulfill({ contentType: "application/json", body: '{"status":"pending"}' });
        return route.fulfill({ status: 404, body: "" });
      });
      await page.addInitScript((token) => { try { localStorage.setItem("pantalla_display_token", token); } catch { /* ignore */ } }, TOKEN);
      await page.goto("http://player.test/tv");
      await expect.poll(() => calls.includes("GET /api/player/state")).toBe(true);

      const dialog = page.locator("#unpair");
      expect(await dialog.isVisible()).toBe(false);

      // OK opens it with Cancel focused; OK again (on Cancel) closes without unpairing.
      await page.keyboard.press("Enter");
      await expect.poll(() => dialog.isVisible()).toBe(true);
      expect(await page.evaluate(() => document.activeElement?.id)).toBe("unpair-no");
      await page.keyboard.press("Enter");
      await expect.poll(() => dialog.isVisible()).toBe(false);
      expect(calls).not.toContain("POST /api/player/unpair");

      // Back/Escape closes too.
      await page.keyboard.press("Enter");
      await expect.poll(() => dialog.isVisible()).toBe(true);
      await page.keyboard.press("Escape");
      await expect.poll(() => dialog.isVisible()).toBe(false);

      // Right moves to Unpair; OK unpairs, drops the token and shows a new pairing code.
      await page.keyboard.press("Enter");
      await page.keyboard.press("ArrowRight");
      expect(await page.evaluate(() => document.activeElement?.id)).toBe("unpair-yes");
      await page.keyboard.press("Enter");
      await expect.poll(() => unpairToken).toBe(TOKEN);
      await expect.poll(() => page.locator("#code").textContent()).toContain("482 913");
      expect(await page.evaluate(() => localStorage.getItem("pantalla_display_token"))).toBeNull();
      expect(await dialog.isVisible()).toBe(false);

      // On the pairing screen OK does not open the dialog (nothing to unpair).
      await page.keyboard.press("Enter");
      expect(await dialog.isVisible()).toBe(false);
    } finally {
      await browser.close();
    }
  }, 60_000);

  it.skipIf(!hasBrowser)("a pointer needs a 3-second press; a tap does nothing", async () => {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      await page.route("http://player.test/**", async (route) => {
        const url = new URL(route.request().url());
        if (url.pathname === "/tv") return route.fulfill({ contentType: "text/html", body: html });
        if (url.pathname === "/api/player/state") return route.fulfill({ contentType: "application/json", body: JSON.stringify({ version: 1, media: null, playlist: null, pollMs: 60000 }) });
        return route.fulfill({ status: 404, body: "" });
      });
      await page.addInitScript((token) => { try { localStorage.setItem("pantalla_display_token", token); } catch { /* ignore */ } }, TOKEN);
      await page.goto("http://player.test/tv");
      await page.waitForTimeout(500);
      await page.mouse.click(640, 360);
      await page.waitForTimeout(3300);
      expect(await page.locator("#unpair").isVisible()).toBe(false);
      await page.mouse.move(640, 360);
      await page.mouse.down();
      await page.waitForTimeout(3300);
      await page.mouse.up();
      expect(await page.locator("#unpair").isVisible()).toBe(true);
    } finally {
      await browser.close();
    }
  }, 60_000);
});
