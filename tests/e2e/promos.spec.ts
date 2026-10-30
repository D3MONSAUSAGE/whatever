import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { removeCreatedTestEmails } from "../helpers/account-cleanup";

/** M12: make a promo, add it to a menu with one tap, take it off, and schedule a dated one. Local/preview only. */
const baseURL = process.env.BASE_URL || "";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
test.skip(!baseURL || !key, "Skipped: BASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set. Promo checks did not run and are not a pass.");

test("a promo is made, added to a menu in one tap, taken off, and a dated promo is scheduled", async ({ browser }) => {
  test.setTimeout(90_000);
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
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
    await admin.from("displays").insert({ account_id: acct!.id, name: "Counter TV", token_hash: `h-${randomUUID()}` });

    // A menu on the screen first.
    await page.goto("/dashboard/media/menus");
    await page.getByRole("button", { name: "New menu board" }).click();
    const menuEditor = page.getByTestId("menu-editor");
    await menuEditor.getByLabel("Menu name (only you see this)").fill("Lunch board");
    await menuEditor.getByLabel("Counter TV").check();
    await menuEditor.getByRole("button", { name: "Create menu board" }).click();
    await expect(page.getByText("Menu board created and sent to your screens")).toBeVisible({ timeout: 15_000 });

    // Promo from the menu page link.
    await page.getByRole("link", { name: "Promos & specials" }).click();
    await page.waitForURL("**/dashboard/media/promos");
    await page.getByRole("button", { name: "New promo" }).click();
    const editor = page.getByTestId("promo-editor");
    await editor.getByText("Deal", { exact: true }).click();
    await editor.getByLabel("Headline", { exact: true }).fill("2 tacos + horchata");
    await editor.getByLabel("Price", { exact: true }).fill("$8");
    await expect(editor.getByTestId("promo-preview")).toBeVisible({ timeout: 15_000 });
    await editor.getByRole("button", { name: "Create promo" }).click();
    await expect(page.getByText("Promo created.")).toBeVisible({ timeout: 15_000 });

    const card = page.getByRole("list", { name: "Promos" }).getByRole("listitem").first();
    await expect(card.getByTestId("promo-status")).toHaveText("Not on a menu yet");
    await card.getByRole("button", { name: "Add to Lunch board" }).click();
    await expect(page.getByText("Added to Lunch board.")).toBeVisible({ timeout: 15_000 });
    await expect(card.getByTestId("promo-status")).toHaveText("On Lunch board");
    const { data: menu } = await admin.from("menus").select("playlist_id").eq("account_id", acct!.id).single();
    const items = async () => (await admin.from("playlist_items").select("id").eq("playlist_id", menu!.playlist_id).eq("kind", "published")).data!.length;
    expect(await items()).toBe(2);

    await card.getByRole("button", { name: "Take off menu" }).click();
    await expect(page.getByText("Taken off the menu.")).toBeVisible({ timeout: 15_000 });
    expect(await items()).toBe(1);

    // Dated promo: scheduled on the screen showing the menu.
    await page.getByRole("button", { name: "New promo" }).click();
    await editor.getByLabel("Promo name (only you see this)").fill("Holiday special");
    await editor.getByLabel("Starts").fill("2026-12-01");
    await editor.getByLabel("Ends").fill("2026-12-24");
    await editor.getByRole("button", { name: "Create promo" }).click();
    await expect(page.getByText("Promo created.")).toBeVisible({ timeout: 15_000 });
    const holiday = page.getByRole("list", { name: "Promos" }).getByRole("listitem").filter({ hasText: "Holiday special" });
    await expect(holiday).toContainText("2026-12-01 to 2026-12-24");
    await holiday.getByRole("button", { name: "Add to Lunch board" }).click();
    await expect(page.getByText("Scheduled on 1 screen showing Lunch board")).toBeVisible({ timeout: 15_000 });
    const rules = (await admin.from("schedules").select("starts_on, ends_on").eq("account_id", acct!.id)).data!;
    expect(rules).toEqual([{ starts_on: "2026-12-01", ends_on: "2026-12-24" }]);
  } finally {
    await context.close();
    await removeCreatedTestEmails(admin, [user.email]);
  }
});
