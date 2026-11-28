import { expect, test } from "@playwright/test";

test("signed-out visitors get the landing page with verified claims only", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/$/);
  // The hero test id differs by home variant (landing-hero: classic and Peek; home-title: Option B).
  await expect(page.locator('[data-testid="landing-hero"], [data-testid="home-title"]').first()).toBeVisible();
  const text = await page.locator("main").innerText();
  for (const s of ["$19", "$39", "$59", "14 days free", "No credit card"]) expect(text).toContain(s);
  expect(text).not.toMatch(/Technologies|LLC|Inc\.|checkout/i);
  await expect(page.locator('[data-testid="start-trial"], [data-testid="hero-cta"]').first()).toHaveAttribute("href", /^\/(signup|create)$/);
  for (const href of ["/support", "/privacy", "/terms", "/pricing"]) await expect(page.locator(`a[href="${href}"]`).first()).toBeVisible();
});

test("signed-in visitors still go straight to /dashboard", async ({ page }) => {
  await page.goto("/pricing");
  await page.evaluate(() => localStorage.setItem("sb-test-auth-token", "{}"));
  await page.goto("/");
  await page.waitForURL(/\/(dashboard|login)/);
});

test("player is unaffected", async ({ page }) => {
  const r = await page.goto("/player");
  expect(r?.status()).toBe(200);
  await expect(page.locator("#code")).toBeAttached();
});
