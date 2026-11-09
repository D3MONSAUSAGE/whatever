import { expect, test } from "@playwright/test";

const widths = [360, 390, 414, 768];

test.skip(!process.env.BASE_URL, "Skipped: BASE_URL is not set.");

for (const width of widths) {
  test(`screen workspace stays inside ${width}px`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width, height: 800 } });
    const page = await context.newPage();
    await page.goto("/preview?screen=workspace");
    await expect(page.getByRole("heading", { name: "Front counter" })).toBeVisible();
    const nav = page.getByRole("navigation", { name: width < 768 ? "Mobile" : "Main" });
    await expect(nav.getByRole("link", { name: "Content" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Schedules" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Account" })).toBeVisible();
    for (const name of ["Add media", "Change content", "Create", "Edit playlist", "Schedule"]) {
      await page.getByRole("button", { name, exact: true }).click();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      const height = await page.getByRole("button", { name, exact: true }).evaluate((node) => node.getBoundingClientRect().height);
      expect(height).toBeGreaterThanOrEqual(44);
    }
    await context.close();
  });
}
