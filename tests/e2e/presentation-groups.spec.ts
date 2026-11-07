import { expect, test } from "@playwright/test";

const base = process.env.BASE_URL || "";

test.skip(!base || !/localhost|127\.0\.0\.1/.test(base), "Local preview only. Production builds 404 this page.");

test("library, detail, playlist editor, and player", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/dev/presentation-groups?view=library");
  await expect(page.getByRole("heading", { name: "Media library" })).toBeVisible();
  await expect(page.getByText("Quarterly review")).toBeVisible();
  await expect(page.getByText("3 slides")).toBeVisible();
  await page.screenshot({ path: "/opt/cursor/artifacts/presentation-library.png", fullPage: true });

  await page.goto("/dev/presentation-groups?view=detail");
  await expect(page.getByRole("heading", { name: "Quarterly review" })).toBeVisible();
  await expect(page.getByText("Title")).toBeVisible();
  await page.screenshot({ path: "/opt/cursor/artifacts/presentation-detail.png", fullPage: true });

  await page.goto("/dev/presentation-groups?view=playlist");
  await expect(page.getByRole("heading", { name: "Edit playlist" })).toBeVisible();
  await expect(page.locator('input[value="Lobby"]')).toBeVisible();
  await expect(page.getByText(/Estimated length/)).toBeVisible();
  await expect(page.getByText(/3 slides/)).toBeVisible();
  await page.screenshot({ path: "/opt/cursor/artifacts/presentation-playlist.png", fullPage: true });

  await page.addInitScript(() => {
    localStorage.setItem("pantalla_display_token", "grouped-player-token-0123456789abcdef");
  });
  await page.route("**/api/player/state**", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("v") === "7") {
      await route.fulfill({ json: { version: 7, unchanged: true, pollMs: 30000, commands: [] } });
      return;
    }
    await route.fulfill({
      json: {
        version: 7,
        mediaId: "s1",
        url: "/marketing/tv-menu.webp",
        pollMs: 30000,
        commands: [],
        playlist: {
          id: "pl",
          transition: "none",
          playbackMode: "auto",
          items: [
            { mediaId: "s1", url: "/marketing/tv-menu.webp", durationMs: 4000, kind: "image", width: 1280, height: 720, groupId: "deck", groupName: "Quarterly review", groupIndex: 0, groupCount: 2 },
            { mediaId: "s2", url: "/marketing/tv-promo.webp", durationMs: 8000, kind: "image", width: 720, height: 1280, groupId: "deck", groupName: "Quarterly review", groupIndex: 1, groupCount: 2 },
          ],
        },
      },
    });
  });
  await page.goto("/player");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "/opt/cursor/artifacts/presentation-player-landscape.png" });
  await page.setViewportSize({ width: 720, height: 1280 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: "/opt/cursor/artifacts/presentation-player-portrait.png" });
});
