import { expect, test } from "@playwright/test";

const shots = process.env.SHOT_DIR;

test("offline screens are called out on Overview and Displays", async ({ page }) => {
  // Redesign phase 2: Overview lists each offline screen under Needs attention; Displays keeps its summary.
  for (const [screen, width] of [["overview", 1440], ["overview", 390]] as const) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/preview?screen=${screen}`);
    const attention = page.getByTestId("offline-attention");
    await expect(attention).toBeVisible();
    await expect(attention).toContainText("Bar TV is offline");
    await expect(attention).toContainText("no heartbeat for");
    await expect(attention.getByRole("link", { name: "Open screen" })).toHaveAttribute("href", /\/dashboard\/screens\//);
    await expect(page).toHaveTitle(/^\(1 offline\) /);
    if (shots) await page.screenshot({ path: `${shots}/offline-${screen}-${width}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/preview?screen=displays");
  const alert = page.getByTestId("offline-alert");
  await expect(alert.locator("summary")).toContainText("1 screen offline:");
  await expect(page).toHaveTitle(/^\(1 offline\) /);
});

test("published legal pages, friendly 404, and health check", async ({ page, request }) => {
  for (const path of ["/terms", "/privacy"]) {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(path);
    await expect(page.getByTestId("legal-draft")).toHaveCount(0);
    await expect(page.getByText("20227 Saticoy St, Apt 202, Winnetka, CA 91306, US")).toBeVisible();
    await expect(page.getByRole("link", { name: "support@pekkotv.com" })).toBeVisible();
    if (shots) await page.screenshot({ path: `${shots}${path}-390.png`, fullPage: true });
  }
  await expect(page.getByRole("heading", { name: "Privacy Policy" })).toBeVisible();
  await page.goto("/login");
  await expect(page.getByRole("link", { name: "Privacy" })).toBeVisible();

  const missing = await page.goto("/no-such-page");
  expect(missing?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();

  const health = await request.get("/api/health");
  expect(health.status()).toBe(200);
  expect(await health.json()).toMatchObject({ ok: true, database: "ok" });
  expect(health.headers()["cache-control"]).toContain("no-store");
});
