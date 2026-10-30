import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { removeCreatedTestEmails } from "../helpers/account-cleanup";

/** M8: setup tracker on Overview, and the Analytics page empty state. Local/preview only. */
const baseURL = process.env.BASE_URL || "";
test.skip(!baseURL, "Skipped: BASE_URL is not set. Onboarding checks did not run and are not a pass.");

test("new account sees setup, completes steps inline, hides and resumes it", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const user = { email: `pantalla-e2e-${randomUUID()}@mailinator.com`, password: `Pantalla-${randomUUID()}` };
  try {
    await signUp(page, user);
    const setup = page.getByRole("region", { name: "Set up your first screen" });
    await expect(setup).toBeVisible();
    await expect(setup.getByText("1 of 8 steps done")).toBeVisible();

    await setup.getByLabel("Business name").fill("Taqueria E2E");
    await setup.getByRole("button", { name: "Save", exact: true }).click();
    await expect(setup.getByText("2 of 8 steps done")).toBeVisible({ timeout: 15_000 });

    await setup.getByLabel("Location name").fill("Downtown");
    await setup.getByRole("button", { name: "Save location" }).click();
    await expect(setup.getByText("3 of 8 steps done")).toBeVisible({ timeout: 15_000 });

    await setup.getByRole("button", { name: "Hide setup" }).click();
    await expect(page.getByRole("button", { name: "Resume setup" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("button", { name: "Resume setup" })).toBeVisible();
    await page.getByRole("button", { name: "Resume setup" }).click();
    await expect(page.getByText("3 of 8 steps done")).toBeVisible();

    await page.goto("/dashboard/analytics");
    await expect(page.getByRole("heading", { name: "Analytics" })).toBeVisible();
    await expect(page.getByText("No screens yet")).toBeVisible();
  } finally {
    await context.close();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && key) await removeCreatedTestEmails(createClient(url, key, { auth: { persistSession: false } }), [user.email]);
  }
});

async function signUp(page: Page, user: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByRole("button", { name: "New here? Create an account" }).click();
  await page.getByPlaceholder("Email").fill(user.email);
  await page.getByPlaceholder("Password").fill(user.password);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.waitForURL("**/dashboard**", { timeout: 25_000 });
}
