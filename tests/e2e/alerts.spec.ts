import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { removeCreatedTestEmails } from "../helpers/account-cleanup";

/** M9: alert settings, the in-app banner, and the alerts page. Local/preview only (needs the service key). */
const baseURL = process.env.BASE_URL || "";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
test.skip(!baseURL || !key, "Skipped: BASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set. Alert checks did not run and are not a pass.");

test("an offline screen raises a banner, settings save, and alerts can be marked read", async ({ browser }) => {
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const prefix = `pantalla-e2e-${randomUUID()}`;
  const user = { email: `${prefix}@mailinator.com`, password: `Pantalla-${randomUUID()}` };
  try {
    await page.goto("/login");
    await page.getByRole("button", { name: "New here? Create an account" }).click();
    await page.getByPlaceholder("Email").fill(user.email);
    await page.getByPlaceholder("Password").fill(user.password);
    await page.getByRole("button", { name: "Create account", exact: true }).click();
    await page.waitForURL("**/dashboard**", { timeout: 25_000 });
    await expect(page.getByTestId("alerts-banner")).toHaveCount(0);

    await page.goto("/dashboard/settings");
    const minutes = page.getByLabel("Alert after (minutes offline)");
    await expect(minutes).toHaveValue("10");
    await minutes.fill("15");
    await page.locator("#alerts").getByRole("button", { name: "Save" }).click();
    await expect(page.locator("#alerts").getByText("Saved.")).toBeVisible();
    await expect(page.locator("#alerts").getByText("aren't switched on for Seemple yet")).toBeVisible();

    const { data: acct } = await admin.from("accounts").select("id, alert_threshold_minutes").eq("name", prefix).single();
    expect(acct!.alert_threshold_minutes).toBe(15);
    await admin.from("displays").insert({ account_id: acct!.id, name: "Window TV", token_hash: `h-${randomUUID()}`, last_seen_at: new Date(Date.now() - 20 * 60_000).toISOString() });
    await admin.rpc("check_offline_alerts");

    await page.goto("/dashboard");
    const banner = page.getByTestId("alerts-banner");
    await expect(banner).toContainText("1 new screen alert");
    await expect(banner).toContainText('"Window TV" went offline');
    await banner.getByRole("link", { name: "All alerts" }).click();
    await expect(page.getByTestId("alerts-list")).toContainText("Offline");
    await page.getByRole("button", { name: "Mark all as read" }).click();
    await expect(page.getByTestId("alerts-banner")).toHaveCount(0, { timeout: 15_000 });
  } finally {
    await context.close();
    await removeCreatedTestEmails(admin, [user.email]);
  }
});
