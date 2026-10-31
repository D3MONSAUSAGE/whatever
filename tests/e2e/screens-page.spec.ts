import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { removeCreatedTestEmails } from "../helpers/account-cleanup";

/** M16 P1: Add screen action, TV address with copy, pairing steps; desktop and phone. */
const baseURL = process.env.BASE_URL || "";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
test.skip(!baseURL || !key, "Skipped: BASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set.");

for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
  test(`screens page shows Add screen, the TV address with copy, and pairing steps (${viewport.width}px)`, async ({ browser }) => {
    test.setTimeout(90_000);
    const admin = createClient(url, key, { auth: { persistSession: false } });
    const context = await browser.newContext({ viewport, permissions: ["clipboard-read", "clipboard-write"] });
    const page = await context.newPage();
    const user = { email: `pantalla-e2e-${randomUUID()}@mailinator.com`, password: `Pantalla-${randomUUID()}` };
    try {
      await page.goto("/login");
      await page.getByRole("button", { name: "New here? Create an account" }).click();
      await page.getByPlaceholder("Email").fill(user.email);
      await page.getByPlaceholder("Password").fill(user.password);
      await page.getByRole("button", { name: "Create account", exact: true }).click();
      await page.waitForURL("**/dashboard**", { timeout: 25_000 });
      await page.goto("/dashboard/displays");
      const add = page.getByTestId("add-screen");
      await expect(add).toBeVisible();
      const playerUrl = `${new URL(baseURL).origin}/player`;
      await expect(page.getByTestId("player-url")).toHaveText(playerUrl);
      await expect(page.getByText("The TV shows a 6-digit code.")).toBeVisible();
      await add.click();
      await expect(page.getByLabel("Code on the TV")).toBeFocused();
      await page.getByRole("button", { name: "Copy TV address" }).click();
      await expect(page.getByRole("button", { name: "Copy TV address" })).toHaveText("Copied");
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(playerUrl);
      await expect(page.getByRole("link", { name: "Open the page with the TV address" })).toHaveAttribute("href", "/dashboard/settings");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      await page.screenshot({ path: `test-results/screens-page-${viewport.width}.png`, fullPage: true });
    } finally {
      await context.close();
      await removeCreatedTestEmails(admin, [user.email]);
    }
  });
}
