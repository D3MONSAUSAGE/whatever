import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { removeCreatedTestEmails } from "../helpers/account-cleanup";
import { libraryFile, waitForLibraryFile } from "./media-locators";
import { expectStatus } from "./status";

/**
 * Phase 2D dashboard flows at 1440 and 390.
 * Skips unless BASE_URL is set. Skips, and does not count as a pass, when
 * migration 0004_scheduling.sql is not applied on that origin's database.
 * On Node 20, run with NODE_OPTIONS=--experimental-websocket so the Supabase
 * cleanup client can open Realtime. Node 22 already includes that websocket.
 */

const pendingEmails: string[] = [];
const baseURL = process.env.BASE_URL || "";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test.afterEach(async () => {
  await deleteTestUsers(pendingEmails.splice(0, pendingEmails.length));
});

test.skip(!baseURL, "Skipped: BASE_URL is not set. Schedule dashboard checks did not run and are not a pass.");

test("locations, groups, a weekday schedule, and the 7-day preview at desktop and phone width", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const tvContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const tv = await tvContext.newPage();
  const owner = account();
  const other = account();
  try {
    await signUp(page, owner);
    const probe = await authed(page, "/api/screen-groups");
    if (probe.status === 503) {
      test.skip(true, "Skipped, not passed: migration 0004_scheduling.sql is not applied, so the schedule dashboard was not verified.");
    }
    expect(probe.status).toBe(200);

    await page.goto("/dashboard/schedule");
    await expect(page.getByRole("heading", { name: "Schedule", exact: true })).toBeVisible();
    await page.getByLabel("Location name").fill("Kitchen");
    await page.getByRole("combobox", { name: "Timezone", exact: true }).fill("America/Los_Angeles");
    await page.getByRole("button", { name: "Add location" }).click();
    await expectStatus(page, "Location added");
    await expect(page.getByLabel("Name for Kitchen")).toBeVisible();
    await page.getByLabel("Name for Kitchen").fill("Kitchen line");
    await page.getByRole("button", { name: "Save Kitchen" }).click();
    await expectStatus(page, "Location saved");
    await expect(page.getByLabel("Name for Kitchen line")).toHaveValue("Kitchen line");

    await tv.goto("/player");
    await pair(page, tv, "Front counter");
    await page.getByLabel("Location for Front counter").selectOption({ label: "Kitchen line" });
    await expectStatus(page, "Location saved");
    await expect(page.getByText("Kitchen line · America/Los_Angeles")).toBeVisible();

    await page.goto("/dashboard/media");
    await page.locator('input[type="file"][accept*="image"]').setInputFiles({ name: "lunch-menu.png", mimeType: "image/png", buffer: png });
    await waitForLibraryFile(page, "lunch-menu.png");
    await expect(libraryFile(page, "lunch-menu.png")).toBeVisible();

    await page.getByRole("link", { name: "Playlists" }).click();
    await page.getByLabel("Playlist name").fill("Lunch specials");
    await page.getByRole("button", { name: "Create playlist" }).click();
    await expect(page.getByRole("heading", { name: "Edit playlist" })).toBeVisible();
    await page.getByRole("button", { name: "Add images" }).click();
    await page.getByRole("checkbox", { name: "lunch-menu.png" }).check();
    await page.getByRole("button", { name: "Add selected" }).click();
    await page.getByRole("button", { name: "Save draft" }).click();
    await expectStatus(page, "Draft saved");

    await page.goto("/dashboard/schedule");
    const playlist = page.getByRole("combobox", { name: "Playlist", exact: true });
    await playlist.selectOption({ label: "Lunch specials (not published)" });
    await expect(playlist).toHaveValue(/.+/);
    await page.getByRole("button", { name: "Publish slides" }).click();
    await expectStatus(page, "Published slides updated");
    await page.getByLabel("Group name").fill("Front of house");
    await page.getByRole("checkbox", { name: "Include Front counter" }).first().check();
    await page.getByRole("button", { name: "Create group" }).click();
    await expectStatus(page, "Group added");

    await page.getByLabel("Schedule name").fill("Weekday lunch");
    await page.getByRole("combobox", { name: "Playlist", exact: true }).selectOption({ label: "Lunch specials" });
    await page.getByRole("combobox", { name: "Screen", exact: true }).selectOption({ label: "Front counter" });
    await page.getByRole("button", { name: "Add schedule" }).click();
    await expectStatus(page, "Schedule added");
    await expect(page.getByText("Weekday lunch").first()).toBeVisible();

    await page.getByLabel("Preview screen").selectOption({ label: "Front counter" });
    await expect(page.getByRole("heading", { name: "Next 7 days" })).toBeVisible();
    await expect(page.getByText("America/Los_Angeles").first()).toBeVisible();
    await expect(page.getByText("Weekday lunch").nth(1)).toBeVisible();
    await expect(page.getByText("Saved assignment").first()).toBeVisible();

    await page.getByRole("button", { name: "Delete Kitchen line" }).click();
    await expectStatus(page, "still has screens");
    await page.getByLabel("Location name").fill("Pop-up");
    await page.getByRole("button", { name: "Add location" }).click();
    await expectStatus(page, "Location added");
    await page.getByRole("button", { name: "Delete Pop-up" }).click();
    await page.getByRole("button", { name: "Delete location" }).click();
    await expectStatus(page, "Location deleted");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/dashboard/schedule");
    await expect(page.getByRole("heading", { name: "Schedule", exact: true })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Mobile" }).getByRole("link", { name: "Schedule", exact: true })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Main" })).toBeHidden();
    await expect(page.getByLabel("Name for Kitchen line")).toBeVisible();
    await expect(page.getByText("Weekday lunch").first()).toBeVisible();
    await expect(page.getByText("Front of house").first()).toBeVisible();
    await page.getByLabel("Preview screen").selectOption({ label: "Front counter" });
    await expect(page.getByText("Saved assignment").first()).toBeVisible();

    await page.getByRole("link", { name: "Settings" }).click();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await signUp(page, other);
    const foreign = await authed(page, "/api/locations");
    expect(JSON.stringify(foreign.body)).not.toContain("Kitchen");
    const foreignSchedules = await authed(page, "/api/schedules");
    expect(JSON.stringify(foreignSchedules.body)).not.toContain("Weekday lunch");
  } finally {
    await context.close();
    await tvContext.close();
    await deleteTestUsers([owner.email, other.email]);
  }
});

function account() {
  const user = {
    email: `pantalla-e2e-${randomUUID()}@mailinator.com`,
    password: `Pantalla-${randomUUID()}`,
  };
  pendingEmails.push(user.email);
  return user;
}

async function signUp(page: Page, user: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByRole("button", { name: "New here? Create an account" }).click();
  await page.getByPlaceholder("Email").fill(user.email);
  await page.getByPlaceholder("Password").fill(user.password);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.waitForURL("**/dashboard**", { timeout: 25_000 });
}

async function readCode(tv: Page) {
  let code = "";
  await expect.poll(async () => {
    code = ((await tv.locator("#code").innerText()) || "").replace(/\D/g, "");
    return code;
  }, { timeout: 25_000 }).toMatch(/^\d{6}$/);
  return code;
}

async function pair(phone: Page, tv: Page, name: string) {
  const code = await readCode(tv);
  await phone.goto("/dashboard/displays");
  await phone.getByLabel("Code on the TV").fill(code);
  await phone.getByLabel("TV name").fill(name);
  await phone.getByRole("button", { name: "Connect TV", exact: true }).click();
  await expect(phone.getByRole("heading", { name })).toBeVisible();
}

async function authed(page: Page, path: string) {
  return page.evaluate(async (path) => {
    const key = Object.keys(localStorage).find((name) => name.indexOf("auth-token") !== -1);
    const raw = key ? localStorage.getItem(key) : null;
    const session = raw ? JSON.parse(raw) : null;
    const token = session && (session.access_token || (session.currentSession && session.currentSession.access_token));
    const res = await fetch(path, { headers: { Authorization: "Bearer " + token } });
    let body: unknown = null;
    try { body = await res.json(); } catch { body = null; }
    return { status: res.status, body };
  }, path);
}

async function deleteTestUsers(emails: string[]) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !service || emails.length === 0) return;
  const admin = createClient(supabaseUrl, service, { auth: { persistSession: false, autoRefreshToken: false } });
  await removeCreatedTestEmails(admin, emails);
}
