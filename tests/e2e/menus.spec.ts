import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { removeCreatedTestEmails } from "../helpers/account-cleanup";

/** M10: make a menu board from a template, edit it, then set breakfast/lunch/dinner. Local/preview only. */
const baseURL = process.env.BASE_URL || "";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
test.skip(!baseURL || !key, "Skipped: BASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set. Menu board checks did not run and are not a pass.");

test("a menu board is made from a template, edited, and scheduled by time of day", async ({ browser }) => {
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

    // Setup tracker offers the menu board shortcut.
    await page.getByRole("link", { name: "Make a menu board" }).first().click();
    await page.waitForURL("**/dashboard/media/menus");
    await page.getByRole("button", { name: "New menu board" }).click();
    const editor = page.getByTestId("menu-editor");
    await editor.getByText("Fresh day").click();
    await editor.getByLabel("Menu name (only you see this)").fill("Breakfast board");
    await editor.getByLabel("Item 1 in section 1", { exact: true }).fill("Chilaquiles");
    await editor.getByLabel("Price 1 in section 1", { exact: true }).fill("$9");
    await expect(editor.getByTestId("menu-preview")).toBeVisible({ timeout: 15_000 });
    await editor.getByLabel("Counter TV").check();
    await editor.getByRole("button", { name: "Create menu board" }).click();
    await expect(page.getByText("Menu board created and sent to your screens")).toBeVisible({ timeout: 15_000 });
    const card = page.getByRole("list", { name: "Menu boards" }).getByRole("listitem").first();
    await expect(card).toContainText("Breakfast board");
    await expect(card).toContainText("Fresh day");

    const { data: menu } = await admin.from("menus").select("id, media_id, playlist_id, content").eq("account_id", acct!.id).single();
    expect((menu!.content as { sections: { items: { name: string }[] }[] }).sections[0].items[0].name).toBe("Chilaquiles");
    const { data: tv } = await admin.from("displays").select("assigned_playlist_id").eq("account_id", acct!.id).single();
    expect(tv!.assigned_playlist_id).toBe(menu!.playlist_id);

    // Edit swaps the image in place.
    await card.getByRole("button", { name: "Edit" }).click();
    await editor.getByLabel("Price 1 in section 1", { exact: true }).fill("$10");
    await editor.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Menu updated.")).toBeVisible({ timeout: 15_000 });
    const { data: after } = await admin.from("menus").select("media_id").eq("id", menu!.id).single();
    expect(after!.media_id).not.toBe(menu!.media_id);

    // Breakfast / lunch / dinner on the Schedule page.
    await page.goto("/dashboard/schedule");
    await page.getByRole("button", { name: "Set up times of day" }).click();
    const form = page.getByRole("form", { name: "Times of day" });
    await form.getByLabel("Screen or group").selectOption({ label: "Counter TV" });
    for (const part of ["Breakfast", "Lunch", "Dinner"]) {
      await form.getByLabel(`${part} shows`).selectOption({ label: "Breakfast board" });
    }
    await form.getByLabel("Dinner starts").fill("17:00");
    await form.getByRole("button", { name: "Add schedule" }).click();
    await expect(page.getByText("3 times of day added")).toBeVisible({ timeout: 15_000 });
    const { data: rules } = await admin.from("schedules").select("name, start_minute").eq("account_id", acct!.id).order("start_minute");
    expect(rules!.map((r) => `${r.name}@${r.start_minute}`)).toEqual(["Breakfast@360", "Lunch@660", "Dinner@1020"]);
  } finally {
    await context.close();
    await removeCreatedTestEmails(admin, [user.email]);
  }
});
