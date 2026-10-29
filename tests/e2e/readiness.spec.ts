import { expect, test } from "@playwright/test";

const shots = process.env.SHOT_DIR;

test("offline screens are called out on Overview and Displays", async ({ page }) => {
  for (const [screen, width] of [["overview", 1440], ["displays", 1440], ["overview", 390]] as const) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/preview?screen=${screen}`);
    const alert = page.getByTestId("offline-alert");
    await expect(alert).toBeVisible();
    await expect(alert).toContainText("1 screen is offline");
    await expect(alert).toContainText("no heartbeat for 12 min");
    await expect(page).toHaveTitle(/^\(1 offline\) /);
    if (shots) await page.screenshot({ path: `${shots}/offline-${screen}-${width}.png`, fullPage: true });
  }
});

test("draft legal pages, friendly 404, and health check", async ({ page, request }) => {
  for (const path of ["/terms", "/privacy"]) {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(path);
    await expect(page.getByTestId("legal-draft")).toContainText("not yet reviewed by a lawyer");
    if (shots) await page.screenshot({ path: `${shots}${path}-390.png`, fullPage: true });
  }
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
