import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { removeCreatedTestEmails } from "../helpers/account-cleanup";

/** M15: limit-reached messages and one loading/error pattern. Local/preview only. */
const baseURL = process.env.BASE_URL || "";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
test.skip(!baseURL || !key, "Skipped: BASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set. Polish checks did not run and are not a pass.");

test("account limits are explained before and at the cap, and a failed load says so with a way to retry", async ({ browser }) => {
  test.setTimeout(90_000);
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
    let acct: { id: string } | null = null;
    await expect.poll(async () => {
      acct = (await admin.from("accounts").select("id").eq("name", prefix).maybeSingle()).data;
      return Boolean(acct);
    }, { timeout: 15_000 }).toBe(true);
    const have = (await admin.from("locations").select("id").eq("account_id", acct!.id)).data!.length;

    // 40 of 50 locations: a quiet count; the button still works.
    const add = (n: number, from: number) => admin.from("locations").insert(Array.from({ length: n }, (_, i) => ({ account_id: acct!.id, name: `Spot ${from + i}`, timezone: "UTC" })));
    await add(40 - have, have);
    await page.goto("/dashboard/schedule");
    const note = page.getByTestId("limit-note").first();
    await expect(note).toHaveText("40 of 50 locations used.", { timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Add location" })).toBeEnabled();

    // At 50: the message says what to do and the button is off.
    await add(10, 40);
    await page.reload();
    await expect(note).toHaveText("You've reached the limit of 50 locations. Delete one to add another.", { timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Add location" })).toBeDisabled();

    // Below 80% there is no note at all.
    await page.goto("/dashboard/media/menus");
    await expect(page.getByRole("button", { name: "New menu board" })).toBeEnabled({ timeout: 15_000 });
    await expect(page.getByTestId("limit-note")).toHaveCount(0);

    // A failed load is an error with Try again, not an endless "Loading…".
    await page.route("**/api/menus", (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Couldn't load menus." }) }));
    await page.reload();
    const err = page.getByTestId("load-error");
    await expect(err).toBeVisible({ timeout: 15_000 });
    await expect(err).toHaveAttribute("role", "alert");
    await expect(err.getByRole("button", { name: "Try again" })).toBeVisible();
    await expect(page.getByTestId("loading")).toHaveCount(0);
    await page.unroute("**/api/menus");

    // A slow load shows one labelled status.
    await page.route("**/api/promos", async (route) => { await new Promise((r) => setTimeout(r, 1500)); await route.continue(); });
    await page.goto("/dashboard/media/promos");
    await expect(page.getByTestId("loading")).toHaveAttribute("role", "status");
    await expect(page.getByTestId("loading")).toHaveCount(0, { timeout: 15_000 });
  } finally {
    await context.close();
    await removeCreatedTestEmails(admin, [user.email]);
  }
});
