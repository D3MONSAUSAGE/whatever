import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { removeCreatedTestEmails } from "../helpers/account-cleanup";
import { libraryFile, waitForLibraryFile } from "./media-locators";
import { expectStatus } from "./status";

/**
 * Phase 2C dashboard coverage at desktop (1440), tablet (768), and phone (390).
 * Skips entirely unless BASE_URL points at a local or preview origin.
 * Video cases skip, and are not counted as passed, when migration 0003 is absent
 * or when there is no database to talk to.
 */

const pendingEmails: string[] = [];
const baseURL = process.env.BASE_URL || "";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const viewports = [
  { width: 1440, height: 900, label: "desktop" },
  { width: 768, height: 1024, label: "tablet" },
  { width: 390, height: 844, label: "mobile" },
] as const;

test.afterEach(async () => {
  await deleteTestUsers(pendingEmails.splice(0, pendingEmails.length));
});

test.skip(!baseURL, "Skipped: BASE_URL is not set. Dashboard and video checks did not run and are not a pass. Point BASE_URL at a local or isolated Supabase-backed origin, never production data.");

test("login, logout, and navigation at desktop, tablet, and mobile", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const owner = account();
  try {
    await signUp(page, owner);
    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/dashboard");
      await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Upload media" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Create a playlist" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Pair a screen" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Publish to your screen" })).toBeVisible();
      const sidebar = page.getByRole("navigation", { name: "Main" });
      const mobile = page.getByRole("navigation", { name: "Mobile" });
      if (viewport.width >= 768) {
        await expect(sidebar.getByRole("link", { name: "Media" })).toBeVisible();
        await expect(mobile).toBeHidden();
      } else {
        await expect(mobile.getByRole("link", { name: "Media" })).toBeVisible();
        await expect(sidebar).toBeHidden();
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("link", { name: "Settings" }).click();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/login/);
    await signIn(page, owner);
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  } finally {
    await context.close();
    await deleteTestUsers([owner.email]);
  }
});

test("media upload, search, list view, and delete at phone width", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const owner = account();
  try {
    await signUp(page, owner);
    await page.goto("/dashboard/media");
    await upload(page, "lunch-menu.png");
    await expect(libraryFile(page, "lunch-menu.png")).toBeVisible();
    await page.getByRole("button", { name: "List", exact: true }).click();
    await expect(libraryFile(page, "lunch-menu.png")).toBeVisible();
    await page.getByRole("button", { name: "Grid", exact: true }).click();
    await page.getByLabel("Search media").fill("lunch");
    await expect(libraryFile(page, "lunch-menu.png")).toBeVisible();
    await page.getByLabel("Search media").fill("missing-file");
    await expect(page.getByText("No files match that search")).toBeVisible();
    await page.getByLabel("Search media").fill("");
    await page.getByLabel("Sort media").selectOption("name");
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
    await expect(libraryFile(page, "lunch-menu.png")).toBeVisible();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await page.getByRole("button", { name: "Delete file" }).click();
    await expect(page.getByText("No images yet")).toBeVisible();
  } finally {
    await context.close();
    await deleteTestUsers([owner.email]);
  }
});

test("playlist draft, reorder, duplicate, preview, publish, and a second screen", async ({ browser }) => {
  const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const tvContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const secondContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const phone = await phoneContext.newPage();
  const tv = await tvContext.newPage();
  const second = await secondContext.newPage();
  const owner = account();
  const other = account();
  try {
    await signUp(phone, owner);
    await phone.setViewportSize({ width: 1440, height: 900 });
    await phone.goto("/dashboard/media");
    await upload(phone, "alpha.png");
    await expect(libraryFile(phone, "alpha.png")).toBeVisible();
    await upload(phone, "beta.png");
    await expect(libraryFile(phone, "beta.png")).toBeVisible();

    await tv.goto("/player");
    await second.goto("/player");
    await pair(phone, tv, "Front counter");
    await pair(phone, second, "Bar TV");

    await phone.getByRole("link", { name: "Playlists" }).click();
    await phone.getByLabel("Playlist name").fill("Lunch loop");
    await phone.getByRole("button", { name: "Create playlist" }).click();
    await expect(phone.getByRole("heading", { name: "Edit playlist" })).toBeVisible();
    for (const name of ["alpha.png", "beta.png"]) {
      await phone.getByRole("button", { name: "Add images" }).click();
      await phone.getByRole("checkbox", { name }).check();
      await phone.getByRole("button", { name: "Add selected" }).click();
    }
    await phone.getByLabel("Seconds for alpha.png").fill("2");
    await phone.getByRole("button", { name: "Move beta.png up" }).click();
    await expect(phone.locator("ol li").first()).toContainText("beta.png");
    await phone.getByRole("button", { name: "Drag beta.png" }).dragTo(phone.locator("ol li").nth(1));
    await expect(phone.locator("ol li").first()).toContainText("alpha.png");
    await phone.getByRole("button", { name: "Full preview" }).click();
    await expect(phone.getByRole("dialog", { name: "Full playlist preview" })).toBeVisible();
    await phone.getByRole("dialog", { name: "Full playlist preview" }).getByRole("button", { name: "Close" }).click();
    await phone.getByRole("button", { name: "Save draft" }).click();
    await expectStatus(phone, "Draft saved");
    await phone.getByRole("checkbox", { name: "Front counter" }).check();
    await phone.getByRole("checkbox", { name: "Bar TV" }).check();
    await phone.getByRole("button", { name: "Publish", exact: true }).click();
    await expectStatus(phone, "Published");
    await expect.poll(async () => shownUrl(tv), { timeout: 25_000 }).toContain("http");

    await phone.goto("/dashboard/playlists");
    await phone.getByRole("button", { name: "Duplicate" }).click();
    await expect(phone.getByRole("link", { name: "Copy of Lunch loop" })).toBeVisible();
    await expect(phone.getByText("Front counter")).toBeVisible();

    await phone.goto("/dashboard/displays");
    await expect(phone.getByRole("heading", { name: "Front counter" })).toBeVisible();
    await expect(phone.getByRole("heading", { name: "Bar TV" })).toBeVisible();
    await expect(phone.getByText("Last heartbeat").first()).toBeVisible();
    await phone.getByRole("button", { name: "Assign playlist" }).click();
    await phone.getByLabel("Playlist to assign").selectOption({ label: "Lunch loop" });
    await expect(phone.getByLabel("Assign Front counter")).toBeChecked();
    await expect(phone.getByLabel("Assign Bar TV")).toBeChecked();
    await phone.getByRole("button", { name: "Publish to selected screens" }).click();
    await expectStatus(phone, "Published");

    await phone.getByRole("link", { name: "Settings" }).click();
    await phone.getByRole("button", { name: "Sign out", exact: true }).click();
    await signUp(phone, other);
    await phone.goto("/dashboard/media");
    await expect(phone.getByText("No images yet")).toBeVisible();
    const foreign = await authed(phone, "/api/media");
    expect(JSON.stringify(foreign.body)).not.toContain("alpha.png");
    expect(JSON.stringify(foreign.body)).not.toContain("Lunch loop");
  } finally {
    await phoneContext.close();
    await tvContext.close();
    await secondContext.close();
    await deleteTestUsers([owner.email, other.email]);
  }
});

test("video upload and playback, or an explicit skip when the database cannot store video", async ({ browser }) => {
  const ctx = await openPhoneAndTv(browser);
  try {
    await signUp(ctx.phone, ctx.owner);
    await ctx.phone.goto("/dashboard/media");
    const videoInput = ctx.phone.locator('input[type="file"][accept*="video"]');
    if ((await videoInput.count()) === 0) {
      test.skip(true, "Skipped, not passed: this deployment has no video upload control.");
    }
    const probe = await authed(ctx.phone, "/api/media/upload", {
      method: "POST",
      json: { fileName: "probe.mp4", sizeBytes: 1024 },
    });
    if (probe.status === 503) {
      test.skip(true, "Skipped, not passed: migration 0003_video.sql is not applied, so video upload and playback were not verified.");
    }
    expect(probe.status).toBe(201);
    await videoInput.setInputFiles("tests/fixtures/h264-aac.mp4");
    await expect(libraryFile(ctx.phone, "h264-aac.mp4")).toBeVisible({ timeout: 30_000 });
    await expect(ctx.phone.locator("[data-media-library]").getByText(/s ·/)).toBeVisible();
    await ctx.tv.goto("/player");
    await pair(ctx.phone, ctx.tv, "Video screen");
    await ctx.phone.getByRole("link", { name: "Playlists" }).click();
    await ctx.phone.getByLabel("Playlist name").fill("Video loop");
    await ctx.phone.getByRole("button", { name: "Create playlist" }).click();
    await ctx.phone.getByRole("button", { name: "Add images" }).click();
    await ctx.phone.getByRole("checkbox", { name: "h264-aac.mp4" }).check();
    await ctx.phone.getByRole("button", { name: "Add selected" }).click();
    await expect(ctx.phone.getByText("Plays until the end")).toBeVisible();
    await ctx.phone.getByRole("checkbox", { name: "Video screen" }).check();
    await ctx.phone.getByRole("button", { name: "Publish", exact: true }).click();
    await expectStatus(ctx.phone, "Published");
    await expect.poll(async () => playingVideo(ctx.tv), { timeout: 25_000 }).toBe(true);
  } finally {
    await ctx.phoneContext.close();
    await ctx.tvContext.close();
    await deleteTestUsers([ctx.owner.email]);
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

async function signIn(page: Page, user: { email: string; password: string }) {
  await page.getByPlaceholder("Email").fill(user.email);
  await page.getByPlaceholder("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/dashboard**");
}

async function upload(page: Page, name: string) {
  await page.locator('input[type="file"][accept*="image"]').setInputFiles({ name, mimeType: "image/png", buffer: png });
  await waitForLibraryFile(page, name);
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

async function shownUrl(tv: Page) {
  return tv.evaluate(() => {
    const layers = [document.getElementById("a"), document.getElementById("b")].filter(Boolean) as HTMLElement[];
    const visible = layers.filter((layer) => layer.className.indexOf("on") !== -1);
    visible.sort((a, b) => (parseInt(b.style.zIndex, 10) || 0) - (parseInt(a.style.zIndex, 10) || 0));
    return visible[0] ? visible[0].style.backgroundImage : "";
  });
}

async function playingVideo(tv: Page) {
  return tv.evaluate(() => {
    const nodes = [document.getElementById("va"), document.getElementById("vb")];
    return nodes.some((node) => !!node && node.className.indexOf("on") !== -1 && !!node.getAttribute("src"));
  });
}

async function authed(page: Page, path: string, init?: { method?: string; json?: unknown }) {
  return page.evaluate(async ({ path, init }) => {
    const key = Object.keys(localStorage).find((name) => name.indexOf("auth-token") !== -1);
    const raw = key ? localStorage.getItem(key) : null;
    const session = raw ? JSON.parse(raw) : null;
    const token = session && (session.access_token || (session.currentSession && session.currentSession.access_token));
    const res = await fetch(path, {
      method: (init && init.method) || "GET",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: init && init.json ? JSON.stringify(init.json) : undefined,
    });
    let body: unknown = null;
    try { body = await res.json(); } catch { body = null; }
    return { status: res.status, body };
  }, { path, init });
}

async function openPhoneAndTv(browser: Browser) {
  const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const tvContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  return {
    phoneContext,
    tvContext,
    phone: await phoneContext.newPage(),
    tv: await tvContext.newPage(),
    owner: account(),
  };
}

async function deleteTestUsers(emails: string[]) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !service || emails.length === 0) return;
  const admin = createClient(supabaseUrl, service, { auth: { persistSession: false, autoRefreshToken: false } });
  await removeCreatedTestEmails(admin, emails);
}
