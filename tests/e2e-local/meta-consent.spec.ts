import { test, expect } from "@playwright/test";
// Runs against a LOCAL build only (see docs/meta-tracking.md). Any request to a Meta domain fails the test.
const META = /facebook\.(com|net)|fbcdn|graph\.facebook/;

test("no Meta code or requests before consent", async ({ page }) => {
  const hits: string[] = [];
  page.on("request", (r) => { if (META.test(r.url())) hits.push(r.url()); });
  await page.route(META, (r) => r.abort());
  for (const path of ["/login", "/privacy", "/terms"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    expect(await page.evaluate(() => typeof (window as unknown as { fbq?: unknown }).fbq)).toBe("undefined");
  }
  if (process.env.EXPECT_BANNER === "1") {
    await expect(page.getByTestId("consent-banner")).toBeVisible();
    await expect(page.getByRole("button", { name: "Allow" })).toBeVisible();
  } else {
    await expect(page.getByTestId("consent-banner")).toHaveCount(0);
  }
  await expect(page.getByTestId("privacy-choices")).toBeVisible();
  expect(hits).toEqual([]);
});

test("GPC hides the Allow button and keeps fbq unloaded", async ({ browser }) => {
  test.skip(process.env.EXPECT_BANNER !== "1", "flags off build");
  const ctx = await browser.newContext({ extraHTTPHeaders: { "Sec-GPC": "1" } });
  const page = await ctx.newPage();
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("button", { name: "Allow" })).toHaveCount(0);
  expect(await page.evaluate(() => typeof (window as unknown as { fbq?: unknown }).fbq)).toBe("undefined");
  await ctx.close();
});
