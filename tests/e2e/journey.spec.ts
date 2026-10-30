import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { removeCreatedTestEmails } from "../helpers/account-cleanup";
import { libraryFile, waitForLibraryFile } from "./media-locators";

/**
 * M14: one new customer's whole journey, end to end, plus a phone-size and accessibility sweep of
 * every dashboard page, then cleanup with nothing left behind. Local/preview only.
 */
const baseURL = process.env.BASE_URL || "";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
test.skip(!baseURL || !key, "Skipped: BASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set. The journey did not run and is not a pass.");

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const PAGES = [
  ["/dashboard", "Overview"], ["/dashboard/displays", "Displays"], ["/dashboard/media", "Media library"],
  ["/dashboard/media/menus", "Menu boards"], ["/dashboard/media/promos", "Promos & specials"], ["/dashboard/playlists", "Playlists"],
  ["/dashboard/schedule", "Schedule"], ["/dashboard/alerts", "Alerts"], ["/dashboard/analytics", "Analytics"], ["/dashboard/settings", "Settings"],
] as const;

test("a new customer goes from sign-up to a scheduled menu with a promo, and every page works on a phone", async ({ browser }) => {
  test.setTimeout(180_000);
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const phoneCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const tvCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await phoneCtx.newPage();
  const tv = await tvCtx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const user = { email: `pantalla-e2e-${randomUUID()}@mailinator.com`, password: `Pantalla-${randomUUID()}` };
  let accountId = "";
  try {
    await test.step("sign up", async () => {
      await page.goto("/login");
      await page.getByRole("button", { name: "New here? Create an account" }).click();
      await page.getByPlaceholder("Email").fill(user.email);
      await page.getByPlaceholder("Password").fill(user.password);
      await page.getByRole("button", { name: "Create account", exact: true }).click();
      await page.waitForURL("**/dashboard**", { timeout: 25_000 });
      const prefix = user.email.split("@")[0];
      await expect.poll(async () => {
        accountId = (await admin.from("accounts").select("id").eq("name", prefix).maybeSingle()).data?.id ?? "";
        return Boolean(accountId);
      }, { timeout: 15_000 }).toBe(true);
    });

    await test.step("pair a TV", async () => {
      await tv.goto("/player");
      let code = "";
      await expect.poll(async () => (code = ((await tv.locator("#code").innerText()) || "").replace(/\D/g, "")), { timeout: 25_000 }).toMatch(/^\d{6}$/);
      await page.goto("/dashboard/displays");
      await page.getByLabel("Code on the TV").fill(code);
      await page.getByLabel("TV name").fill("Front counter");
      await page.getByRole("button", { name: "Connect TV", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Front counter" })).toBeVisible();
      await expect(tv.locator("#empty")).toHaveClass(/on/, { timeout: 20_000 });
    });

    await test.step("upload, then search and filter the library", async () => {
      await page.goto("/dashboard/media");
      for (const name of ["tacos.png", "burritos.png", "horchata.png"]) {
        await page.locator('input[type="file"][accept*="image"]').setInputFiles({ name, mimeType: "image/png", buffer: png });
        await waitForLibraryFile(page, name);
      }
      await expect(page.getByTestId("media-count")).toContainText("Showing 3 of 3 files");
      await page.getByLabel("Search media").fill("BURR");
      await expect(libraryFile(page, "burritos.png")).toBeVisible();
      await expect(libraryFile(page, "tacos.png")).toBeHidden();
      await expect(page.getByTestId("media-count")).toContainText("Showing 1 of 1 file");
      await page.getByLabel("Search media").fill("");
      await page.getByLabel("Show").selectOption("menu");
      await expect(page.getByText("No files match that search")).toBeVisible();
      await page.getByLabel("Show").selectOption("");
      await page.getByLabel("Sort media").selectOption("name");
      await expect(page.locator("[data-media-library] li").first()).toContainText("burritos.png");
    });

    await test.step("build and publish a playlist; the TV plays it", async () => {
      await page.goto("/dashboard/playlists");
      await page.getByLabel("Playlist name").fill("All day");
      await page.getByRole("button", { name: "Create playlist" }).click();
      await expect(page.getByRole("heading", { name: "Edit playlist" })).toBeVisible();
      await page.getByRole("button", { name: "Add images" }).click();
      await page.getByRole("checkbox", { name: "tacos.png" }).check();
      await page.getByRole("checkbox", { name: "horchata.png" }).check();
      await page.getByRole("button", { name: "Add selected" }).click();
      await page.getByRole("checkbox", { name: "Front counter" }).check();
      await page.getByRole("button", { name: "Publish", exact: true }).click();
      await expect(page.getByText("Published").first()).toBeVisible({ timeout: 20_000 });
      await expect(tv.locator("#empty")).not.toHaveClass(/on/, { timeout: 25_000 });
      await page.goto("/dashboard/media");
      await page.getByLabel("Not in a playlist").check();
      await expect(libraryFile(page, "burritos.png")).toBeVisible();
      await expect(libraryFile(page, "tacos.png")).toBeHidden();
    });

    await test.step("brand, menu board on the TV, dated promo, times of day", async () => {
      await page.goto("/dashboard/media/menus");
      await page.getByRole("button", { name: "New menu board" }).click();
      const editor = page.getByTestId("menu-editor");
      await editor.getByLabel("Menu name (only you see this)").fill("Lunch board");
      await editor.getByLabel("Front counter").check();
      await editor.getByRole("button", { name: "Create menu board" }).click();
      await expect(page.getByText("Menu board created and sent to your screens")).toBeVisible({ timeout: 15_000 });

      const today = new Date().toISOString().slice(0, 10);
      const soon = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
      await page.goto("/dashboard/media/promos");
      await page.getByRole("button", { name: "New promo" }).click();
      const promo = page.getByTestId("promo-editor");
      await promo.getByLabel("Promo name (only you see this)").fill("Two week deal");
      await promo.getByLabel("Headline", { exact: true }).fill("2 tacos + horchata");
      await promo.getByLabel("Starts").fill(today);
      await promo.getByLabel("Ends").fill(soon);
      await promo.getByRole("button", { name: "Create promo" }).click();
      await expect(page.getByText("Promo created.")).toBeVisible({ timeout: 15_000 });
      const card = page.getByRole("list", { name: "Promos" }).getByRole("listitem").first();
      await card.getByRole("button", { name: "Add to Lunch board" }).click();
      await expect(card.getByTestId("promo-screens")).toContainText("Front counter", { timeout: 15_000 });

      await page.goto("/dashboard/schedule");
      await page.getByRole("button", { name: "Set up times of day" }).click();
      const form = page.getByRole("form", { name: "Times of day" });
      await form.getByLabel("Screen or group").selectOption({ label: "Front counter" });
      for (const part of ["Breakfast", "Lunch", "Dinner"]) await form.getByLabel(`${part} shows`).selectOption({ label: "Lunch board" });
      await form.getByRole("button", { name: "Add schedule" }).click();
      await expect(page.getByText("3 times of day added")).toBeVisible({ timeout: 15_000 });
      expect((await admin.from("schedules").select("id").eq("account_id", accountId)).data).toHaveLength(4);
    });

    await test.step("an offline screen raises an alert; analytics loads", async () => {
      await admin.from("displays").insert({ account_id: accountId, name: "Window TV", token_hash: `h-${randomUUID()}`, last_seen_at: new Date(Date.now() - 20 * 60_000).toISOString() });
      await admin.rpc("check_offline_alerts");
      await page.goto("/dashboard");
      await expect(page.getByText('"Window TV" went offline').first()).toBeVisible({ timeout: 20_000 });
      await page.goto("/dashboard/analytics");
      await expect(page.getByRole("heading", { name: "Analytics" })).toBeVisible();
    });

    await test.step("every dashboard page fits a phone and has a heading and labelled controls", async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      for (const [path, heading] of PAGES) {
        await page.goto(path);
        await expect(page.getByRole("heading", { name: heading, exact: true }).first(), path).toBeVisible({ timeout: 15_000 });
        await page.waitForLoadState("networkidle");
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        const wide = overflow > 1 ? await page.evaluate(() => [...document.querySelectorAll("body *")].filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1).slice(-4).map((el) => el.outerHTML.slice(0, 160))) : [];
        expect(overflow, `${path} scrolls sideways: ${wide.join(" | ")}`).toBeLessThanOrEqual(1);
        const unlabeled = await page.evaluate(() => [...document.querySelectorAll("input:not([type=hidden]):not(.sr-only), select, textarea, button")]
          .filter((el) => (el as HTMLElement).offsetParent !== null)
          .filter((el) => {
            const e = el as HTMLInputElement;
            const name = e.getAttribute("aria-label") || e.getAttribute("aria-labelledby") || (e.labels && e.labels.length ? "l" : "") || (e.tagName === "BUTTON" ? e.textContent?.trim() || e.getAttribute("title") : "") || e.getAttribute("placeholder");
            return !name;
          }).map((el) => el.outerHTML.slice(0, 80)));
        expect(unlabeled, `${path} has unlabeled controls`).toEqual([]);
      }
      expect(errors).toEqual([]);
    });

    await test.step("deleting the promo, playlist and menu leaves no rules behind", async () => {
      await page.goto("/dashboard/media/promos");
      const card = page.getByRole("list", { name: "Promos" }).getByRole("listitem").first();
      await card.getByRole("button", { name: "Delete" }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
      await expect(page.getByText("Promo deleted")).toBeVisible({ timeout: 15_000 });
      const promos = await admin.from("promos").select("id").eq("account_id", accountId);
      expect(promos.data).toHaveLength(0);
      expect((await admin.from("schedules").select("id").eq("account_id", accountId)).data).toHaveLength(3);

      await page.goto("/dashboard/media/menus");
      await page.getByRole("list", { name: "Menu boards" }).getByRole("listitem").first().getByRole("button", { name: "Delete" }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
      await expect(page.getByText("Menu board deleted")).toBeVisible({ timeout: 15_000 });
      expect((await admin.from("menus").select("id").eq("account_id", accountId)).data).toHaveLength(0);
    });
  } finally {
    await phoneCtx.close();
    await tvCtx.close();
    await removeCreatedTestEmails(admin, [user.email]);
    if (accountId) {
      for (const table of ["accounts", "media", "playlists", "displays", "schedules", "menus", "promos"]) {
        const col = table === "accounts" ? "id" : "account_id";
        expect((await admin.from(table).select("id").eq(col, accountId)).data ?? [], `${table} left behind`).toHaveLength(0);
      }
      expect((await admin.storage.from("media").list(accountId)).data ?? []).toHaveLength(0);
    }
  }
});

