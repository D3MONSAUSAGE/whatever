import { expect, test } from "@playwright/test";

// Guest editor (GUEST_EDITOR=on): build a menu with no account, keep it through refreshes and an interrupted
// sign-up, and see the account actions. Read-only: nothing is created on the server. Skipped while the flag is off.
test.describe("guest menu designer", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    const href = await page.getByTestId("hero-cta").getAttribute("href");
    test.skip(href !== "/create", "GUEST_EDITOR is off on this deployment");
  });

  test("the homepage demo hands its menu to the real editor, and the work survives refreshes", async ({ page }) => {
    await page.getByTestId("live-demo").scrollIntoViewIfNeeded();
    await page.locator("#hb-d-title").fill("Casa Lupita");
    await page.locator("#hb-d-price").fill("$4.50");
    await page.getByTestId("demo-cta").click();
    await page.waitForURL((u) => u.pathname === "/create");
    await expect(page.getByTestId("template-editor")).toBeVisible({ timeout: 30_000 });
    const board = page.getByTestId("tpl-preview").locator("svg").first();
    await expect(board).toContainText(/casa lupita/i);
    await expect(board).toContainText("4.50");
    await expect(page.getByTestId("tpl-status")).toHaveText(/saved on this device/i);

    await page.getByTestId("tpl-step-0").click();
    await page.getByTestId("tpl-title").fill("Casa Lupita Grill");
    await page.waitForTimeout(800);
    await page.reload();
    await expect(page.getByTestId("tpl-preview").locator("svg").first()).toContainText(/casa lupita grill/i, { timeout: 30_000 });
  });

  test("account actions ask to sign up over the finished menu, and closing it loses nothing", async ({ page }) => {
    await page.goto("/create?design=taqueria-specials");
    if (await page.getByTestId("guest-resume-new").count()) await page.getByTestId("guest-resume-new").click();
    await expect(page.getByTestId("template-editor")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("guest-preview").click();
    await expect(page.getByTestId("guest-done")).toBeVisible();
    await page.getByTestId("guest-done-display").click();
    const sheet = page.getByTestId("guest-sheet");
    await expect(sheet).toBeVisible();
    await expect(page.getByTestId("guest-sheet-title")).toContainText(/TV/);
    await expect(page.getByTestId("guest-sheet-tab-in")).toBeVisible();
    // An interrupted sign-up comes back after a refresh, then can be dismissed.
    await page.reload();
    await expect(page.getByTestId("guest-sheet")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("guest-sheet-close").click();
    await expect(page.getByTestId("guest-sheet")).toHaveCount(0);
    await expect(page.getByTestId("template-editor")).toBeVisible();
  });
});
