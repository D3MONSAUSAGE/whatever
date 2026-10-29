import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { removeCreatedTestEmails } from "../helpers/account-cleanup";

const pendingEmails: string[] = [];

test.afterEach(async () => {
  await deleteTestUsers(pendingEmails.splice(0, pendingEmails.length));
});

const baseURL = process.env.BASE_URL || "";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test.skip(!baseURL, "Set BASE_URL to a deployed Pantalla origin.");

test("phone publishes to a TV, and a second account cannot read it", async ({ browser }) => {
  const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const tvContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const phone = await phoneContext.newPage();
  const tv = await tvContext.newPage();
  const created: string[] = [];
  const accountA = account();
  const accountB = account();
  created.push(accountA.email, accountB.email);

  let code = "";
  let firstUrl = "";
  let secondUrl = "";
  let lunchId = "";
  let token = "";

  try {
    await test.step("sign up", async () => {
      await signUp(phone, accountA);
    });

    await test.step("sign out and sign in", async () => {
      await phone.getByRole("link", { name: "Settings" }).click();
      await phone.getByRole("button", { name: "Sign out" }).click();
      await expect(phone).toHaveURL(/\/login/);
      await signIn(phone, accountA);
    });

    await test.step("TV shows a pairing code", async () => {
      await tv.goto("/player");
      await expect(tv).toHaveTitle("Pantalla");
      code = await readCode(tv);
    });

    await test.step("upload the first menu", async () => {
      await phone.goto("/dashboard/media");
      await upload(phone, "lunch-menu.png");
      await expect(phone.getByText("lunch-menu.png")).toBeVisible();
    });

    await test.step("pair the TV", async () => {
      await phone.goto("/dashboard/displays");
      await phone.getByLabel("Code on the TV").fill(code);
      await phone.getByLabel("TV name").fill("Front counter");
      await phone.getByRole("button", { name: "Connect TV", exact: true }).click();
      await expect(phone.getByRole("heading", { name: "Front counter" })).toBeVisible();
      await expect(tv.locator("#empty")).toHaveClass(/on/, { timeout: 20_000 });
    });

    await test.step("publish the first menu", async () => {
      await phone.getByRole("button", { name: "Change image" }).click();
      await phone.getByRole("button", { name: "lunch-menu.png" }).click();
      firstUrl = await waitForImage(tv);
    });

    await test.step("upload the replacement menu", async () => {
      await phone.goto("/dashboard/media");
      await upload(phone, "dinner-menu.png");
      await expect(phone.getByText("dinner-menu.png")).toBeVisible();
      const library = await authed(phone, "/api/media");
      const items = library.body as { id: string; fileName: string }[];
      lunchId = items.find((item) => item.fileName === "lunch-menu.png")?.id || "";
      const dinnerId = items.find((item) => item.fileName === "dinner-menu.png")?.id;
      expect(lunchId).toBeTruthy();
      expect(dinnerId).toBeTruthy();
    });

    await test.step("replace the image on the TV", async () => {
      await phone.goto("/dashboard/displays");
      await phone.getByRole("button", { name: "Change image" }).click();
      await phone.getByRole("button", { name: "dinner-menu.png" }).click();
      secondUrl = await waitForReplacement(tv, firstUrl);
      expect(secondUrl).not.toBe(firstUrl);
    });

    await test.step("network loss keeps the displayed image", async () => {
      await tvContext.setOffline(true);
      await expect(tv.locator("#status")).toContainText("Reconnecting", { timeout: 30_000 });
      expect(await shownUrl(tv)).toBe(secondUrl);
      await expect(tv.locator("#connecting")).not.toHaveClass(/on/);
      await tvContext.setOffline(false);
      await expect(tv.locator("#status")).not.toHaveClass(/on/, { timeout: 30_000 });
      expect(await shownUrl(tv)).toBe(secondUrl);
    });

    await test.step("disconnect revokes the display token", async () => {
      token = (await tv.evaluate(() => localStorage.getItem("pantalla_display_token"))) || "";
      expect(token).toEqual(expect.any(String));
      expect(token.length).toBeGreaterThan(0);
      await phone.getByRole("button", { name: "Disconnect", exact: true }).click();
      await phone.getByRole("button", { name: "Disconnect this TV" }).click();
      await expect(tv.locator("#pair")).toHaveClass(/on/, { timeout: 25_000 });
      expect(await tv.evaluate(() => localStorage.getItem("pantalla_display_token"))).toBeNull();
      const revoked = await fetch(new URL("/api/player/state", baseURL), { headers: { "X-Display-Token": token } });
      expect(revoked.status).toBe(401);
    });

    await test.step("another account cannot read the menu", async () => {
      await phone.getByRole("link", { name: "Settings" }).click();
      await phone.getByRole("button", { name: "Sign out" }).click();
      await expect(phone).toHaveURL(/\/login/);
      await signUp(phone, accountB);
      await phone.goto("/dashboard/media");
      await expect(phone.getByText("No images yet")).toBeVisible();
      const foreignList = await authed(phone, "/api/media");
      expect(foreignList.status).toBe(200);
      expect(JSON.stringify(foreignList.body)).not.toContain(lunchId);
      expect(JSON.stringify(foreignList.body)).not.toContain("lunch-menu.png");
      const foreignDelete = await authed(phone, `/api/media/${lunchId}`, { method: "DELETE" });
      expect(foreignDelete.status).toBe(404);
    });

    await test.step("another account cannot publish the first account's image", async () => {
      const nextCode = await readCode(tv);
      expect(nextCode).not.toBe(code);
      await phone.goto("/dashboard/displays");
      await phone.getByLabel("Code on the TV").fill(nextCode);
      await phone.getByLabel("TV name").fill("Other counter");
      await phone.getByRole("button", { name: "Connect TV", exact: true }).click();
      await expect(phone.getByRole("heading", { name: "Other counter" })).toBeVisible();
      const displays = await authed(phone, "/api/displays");
      expect(displays.status).toBe(200);
      const displayId = (displays.body as { id: string }[])[0]?.id;
      expect(displayId).toBeTruthy();
      const cross = await authed(phone, `/api/displays/${displayId}`, {
        method: "PATCH",
        json: { mediaId: lunchId },
      });
      expect(cross.status).toBe(404);
    });
  } finally {
    await phoneContext.close();
    await tvContext.close();
    await deleteTestUsers(created);
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
  try {
    await page.waitForURL("**/dashboard**", { timeout: 25_000 });
  } catch {
    const note = (await page.locator("main p").last().textContent())?.trim() || "no message";
    throw new Error(
      `Sign-up did not open the dashboard (${note}). Disable Confirm email in Supabase, and add ${baseURL}/dashboard to Authentication redirect URLs.`,
    );
  }
}

async function signIn(page: Page, user: { email: string; password: string }) {
  await page.getByPlaceholder("Email").fill(user.email);
  await page.getByPlaceholder("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/dashboard**");
}

async function upload(page: Page, name: string) {
  await page.locator('input[type="file"][accept*="image"]').setInputFiles({ name, mimeType: "image/png", buffer: png });
}

async function readCode(tv: Page) {
  let code = "";
  await expect.poll(async () => {
    code = ((await tv.locator("#code").innerText()) || "").replace(/\D/g, "");
    return code;
  }, { timeout: 25_000 }).toMatch(/^\d{6}$/);
  return code;
}

async function shownUrl(tv: Page) {
  return tv.evaluate(() => {
    const layers = [document.getElementById("a"), document.getElementById("b")].filter(Boolean) as HTMLElement[];
    const visible = layers.filter((layer) => layer.className.indexOf("on") !== -1);
    visible.sort((a, b) => (parseInt(b.style.zIndex, 10) || 0) - (parseInt(a.style.zIndex, 10) || 0));
    return visible[0] ? visible[0].style.backgroundImage : "";
  });
}

async function waitForImage(tv: Page) {
  let url = "";
  await expect.poll(async () => {
    url = await shownUrl(tv);
    return url.indexOf("url(") === -1 ? "" : url;
  }, { timeout: 25_000 }).not.toBe("");
  return url;
}

async function waitForReplacement(tv: Page, previous: string) {
  let blanks = 0;
  let url = previous;
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    url = await shownUrl(tv);
    if (url.indexOf("url(") === -1) blanks += 1;
    if (url.indexOf("url(") !== -1 && url !== previous) break;
    await tv.waitForTimeout(200);
  }
  expect(blanks, "the TV went blank while the next image loaded").toBe(0);
  expect(url).not.toBe(previous);
  return url;
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

test("a playlist loops three slides, then a single image holds", async ({ browser }) => {
  const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const tvContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const phone = await phoneContext.newPage();
  const tv = await tvContext.newPage();
  const created: string[] = [];
  const owner = account();
  created.push(owner.email);

  try {
    await signUp(phone, owner);
    await tv.goto("/player");
    const code = await readCode(tv);
    await phone.goto("/dashboard/media");
    for (const name of ["slide-a.png", "slide-b.png", "slide-c.png"]) {
      await upload(phone, name);
      await expect(phone.getByText(name)).toBeVisible();
    }
    await phone.goto("/dashboard/displays");
    await phone.getByLabel("Code on the TV").fill(code);
    await phone.getByLabel("TV name").fill("Front counter");
    await phone.getByRole("button", { name: "Connect TV", exact: true }).click();
    await expect(phone.getByRole("heading", { name: "Front counter" })).toBeVisible();
    await expect(tv.locator("#empty")).toHaveClass(/on/, { timeout: 20_000 });

    const library = await authed(phone, "/api/media");
    const items = library.body as { id: string; fileName: string }[];
    const idOf = (name: string) => items.find((item) => item.fileName === name)?.id || "";
    const ids = { a: idOf("slide-a.png"), b: idOf("slide-b.png"), c: idOf("slide-c.png") };
    expect(ids.a && ids.b && ids.c).toBeTruthy();

    await phone.getByRole("link", { name: "Playlists" }).click();
    await phone.getByLabel("Playlist name").fill("Lunch loop");
    await phone.getByRole("button", { name: "Create playlist" }).click();
    await expect(phone.getByRole("heading", { name: "Edit playlist" })).toBeVisible();
    for (const name of ["slide-a.png", "slide-b.png", "slide-c.png"]) {
      await phone.getByRole("button", { name: "Add images" }).click();
      await phone.getByRole("checkbox", { name }).check();
      await phone.getByRole("button", { name: "Add selected" }).click();
    }
    await phone.getByLabel("Seconds for slide-a.png").fill("2");
    await phone.getByLabel("Seconds for slide-b.png").fill("3");
    await phone.getByLabel("Seconds for slide-c.png").fill("4");
    await phone.getByLabel("Transition").selectOption("none");
    await phone.getByRole("checkbox", { name: "Front counter" }).check();
    await phone.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(phone.getByRole("status")).toContainText("Published", { timeout: 20_000 });
    await phone.setViewportSize({ width: 1280, height: 800 });
    await expect(phone.locator("nav").first().getByRole("link", { name: "Playlists" })).toBeVisible();
    await expect(phone.getByRole("button", { name: "Publish", exact: true })).toBeVisible();
    await phone.setViewportSize({ width: 390, height: 844 });

    const firstLoop = await slideChanges(tv, ids, 4, 40_000);
    expect(firstLoop.map((event) => event.id)).toEqual([ids.a, ids.b, ids.c, ids.a]);
    const gap = (index: number) => firstLoop[index].at - firstLoop[index - 1].at;
    expect(gap(1)).toBeGreaterThan(1000);
    expect(gap(1)).toBeLessThan(4500);
    expect(gap(2)).toBeGreaterThan(1800);
    expect(gap(2)).toBeLessThan(5500);
    expect(gap(3)).toBeGreaterThan(2500);
    expect(gap(3)).toBeLessThan(7000);

    await phone.goto("/dashboard/media");
    await upload(phone, "slide-d.png");
    await expect(phone.getByText("slide-d.png")).toBeVisible();
    const again = await authed(phone, "/api/media");
    const dId = (again.body as { id: string; fileName: string }[]).find((item) => item.fileName === "slide-d.png")?.id || "";
    expect(dId).toBeTruthy();
    await phone.goto("/dashboard/playlists");
    await phone.getByRole("link", { name: "Lunch loop" }).click();
    await phone.getByRole("button", { name: "Add images" }).click();
    await phone.getByRole("checkbox", { name: "slide-d.png" }).check();
    await phone.getByRole("button", { name: "Add selected" }).click();
    for (let step = 0; step < 3; step++) await phone.getByRole("button", { name: "Move slide-d.png up" }).click();
    await phone.getByRole("checkbox", { name: "Front counter" }).check();
    await phone.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(phone.getByRole("status")).toContainText("Published", { timeout: 20_000 });
    expect(tv.url()).toContain("/player");
    await expect.poll(async () => (await shownUrl(tv)).includes(dId), { timeout: 25_000 }).toBe(true);
    const updated = await slideChanges(tv, { a: ids.a, d: dId }, 2, 20_000);
    expect(updated.map((event) => event.id)).toEqual([dId, ids.a]);

    await phone.goto("/dashboard/media");
    await upload(phone, "slide-e.png");
    await expect(phone.getByText("slide-e.png")).toBeVisible();
    const withStill = await authed(phone, "/api/media");
    const stillId = (withStill.body as { id: string; fileName: string }[]).find((item) => item.fileName === "slide-e.png")?.id || "";
    expect(stillId).toBeTruthy();
    await phone.goto("/dashboard/displays");
    await phone.getByRole("button", { name: "Change image" }).click();
    await phone.getByRole("button", { name: "slide-e.png" }).click();
    await expect.poll(async () => (await shownUrl(tv)).includes(stillId), { timeout: 20_000 }).toBe(true);
    const holdUntil = Date.now() + 5000;
    while (Date.now() < holdUntil) {
      const url = await shownUrl(tv);
      expect(url).toContain(stillId);
      expect(url).not.toContain(ids.a);
      expect(url).not.toContain(dId);
      await tv.waitForTimeout(400);
    }
  } finally {
    await phoneContext.close();
    await tvContext.close();
    await deleteTestUsers(created);
  }
});

async function slideChanges(tv: Page, ids: Record<string, string>, count: number, timeout: number) {
  const events: { id: string; at: number }[] = [];
  let last = "";
  const start = Date.now();
  while (events.length < count && Date.now() - start < timeout) {
    const url = await shownUrl(tv);
    const id = Object.keys(ids).map((key) => ids[key]).find((mediaId) => mediaId && url.includes(mediaId)) || "";
    if (id && id !== last) {
      events.push({ id, at: Date.now() });
      last = id;
    }
    await tv.waitForTimeout(100);
  }
  return events;
}

test("an unsupported video is rejected in the library", async ({ browser }) => {
  const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const phone = await phoneContext.newPage();
  const owner = account();
  try {
    await signUp(phone, owner);
    await phone.goto("/dashboard/media");
    const videoInput = phone.locator('input[type="file"][accept*="video"]');
    if ((await videoInput.count()) === 0) test.skip(true, "This deployment has no video upload yet.");
    await videoInput.setInputFiles("tests/fixtures/hevc.mp4");
    await expect(phone.getByRole("status")).toContainText("H.264", { timeout: 15_000 });
    await expect(phone.getByText("No images yet")).toBeVisible();
  } finally {
    await phoneContext.close();
    await deleteTestUsers([owner.email]);
  }
});

test("a video playlist plays on the TV and survives a dropped connection", async ({ browser }) => {
  const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const tvContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const phone = await phoneContext.newPage();
  const tv = await tvContext.newPage();
  const owner = account();

  try {
    await signUp(phone, owner);
    await phone.goto("/dashboard/media");
    const videoInput = phone.locator('input[type="file"][accept*="video"]');
    if ((await videoInput.count()) === 0) test.skip(true, "This deployment has no video upload yet.");
    const probe = await authed(phone, "/api/media/upload", {
      method: "POST",
      json: { fileName: "probe.mp4", sizeBytes: 1024 },
    });
    if (probe.status === 503) test.skip(true, "Apply migration 0003_video.sql before the video playback check.");
    expect(probe.status).toBe(201);

    await videoInput.setInputFiles("tests/fixtures/h264-aac.mp4");
    await expect(phone.getByText("h264-aac.mp4")).toBeVisible({ timeout: 20_000 });
    await expect(phone.getByText(/s ·/)).toBeVisible();

    await tv.goto("/player");
    const code = await readCode(tv);
    await phone.goto("/dashboard/displays");
    await phone.getByLabel("Code on the TV").fill(code);
    await phone.getByLabel("TV name").fill("Video screen");
    await phone.getByRole("button", { name: "Connect TV", exact: true }).click();
    await expect(phone.getByRole("heading", { name: "Video screen" })).toBeVisible();

    await phone.getByRole("link", { name: "Playlists" }).click();
    await phone.getByLabel("Playlist name").fill("Video loop");
    await phone.getByRole("button", { name: "Create playlist" }).click();
    await expect(phone.getByRole("heading", { name: "Edit playlist" })).toBeVisible();
    await phone.getByRole("button", { name: "Add images" }).click();
    await phone.getByRole("checkbox", { name: "h264-aac.mp4" }).check();
    await phone.getByRole("button", { name: "Add selected" }).click();
    await expect(phone.getByText("Plays until the end")).toBeVisible();
    await phone.getByRole("checkbox", { name: "Video screen" }).check();
    await phone.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(phone.getByRole("status")).toContainText("Published", { timeout: 20_000 });

    await expect.poll(async () => playingVideo(tv), { timeout: 25_000 }).toBe(true);
    const started = await videoTime(tv);
    await tv.waitForTimeout(700);
    const later = await videoTime(tv);
    expect(later !== started || await playingVideo(tv)).toBeTruthy();

    await tvContext.setOffline(true);
    await expect(tv.locator("#status")).toContainText("Reconnecting", { timeout: 30_000 });
    expect(await playingVideo(tv)).toBe(true);
    await tvContext.setOffline(false);
    await expect(tv.locator("#status")).not.toHaveClass(/on/, { timeout: 30_000 });
    expect(await playingVideo(tv)).toBe(true);
  } finally {
    await phoneContext.close();
    await tvContext.close();
    await deleteTestUsers([owner.email]);
  }
});

test("a mixed image, video, and image playlist loops in order", async ({ browser }) => {
  const ctx = await openPhoneAndTv(browser);
  try {
    await signUp(ctx.phone, ctx.owner);
    if (!(await videoReady(ctx.phone))) return;
    await ctx.phone.goto("/dashboard/media");
    await upload(ctx.phone, "mix-a.png");
    await expect(ctx.phone.getByText("mix-a.png")).toBeVisible();
    await upload(ctx.phone, "mix-c.png");
    await expect(ctx.phone.getByText("mix-c.png")).toBeVisible();
    await ctx.phone.locator('input[type="file"][accept*="video"]').setInputFiles("tests/fixtures/h264-aac.mp4");
    await expect(ctx.phone.getByText("h264-aac.mp4")).toBeVisible({ timeout: 20_000 });

    await ctx.tv.goto("/player");
    await pairTv(ctx.phone, ctx.tv, "Mix screen");
    const library = await authed(ctx.phone, "/api/media");
    const items = library.body as { id: string; fileName: string }[];
    const ids = {
      a: idOf(items, "mix-a.png"),
      v: idOf(items, "h264-aac.mp4"),
      c: idOf(items, "mix-c.png"),
    };
    expect(ids.a && ids.v && ids.c).toBeTruthy();
    await publishSlides(ctx.phone, "Image video image", [
      { name: "mix-a.png", seconds: "2" },
      { name: "h264-aac.mp4", seconds: null },
      { name: "mix-c.png", seconds: "2" },
    ], "Mix screen");

    const watched = await watchScreen(ctx.tv, ids, 4, 25_000);
    expect(watched.blanks, "the TV went blank between slides").toBe(0);
    expect(watched.events.map((event) => event.id)).toEqual([ids.a, ids.v, ids.c, ids.a]);
    const gap = (index: number) => watched.events[index].at - watched.events[index - 1].at;
    expect(gap(1)).toBeGreaterThan(1000);
    expect(gap(1)).toBeLessThan(5000);
    expect(gap(2)).toBeGreaterThan(400);
    expect(gap(2)).toBeLessThan(3500);
    expect(gap(3)).toBeGreaterThan(1000);
    expect(gap(3)).toBeLessThan(5000);
  } finally {
    await ctx.phoneContext.close();
    await ctx.tvContext.close();
    await deleteTestUsers([ctx.owner.email]);
  }
});

test("a broken video between two images does not stretch them or go blank", async ({ browser }) => {
  const ctx = await openPhoneAndTv(browser);
  try {
    await signUp(ctx.phone, ctx.owner);
    if (!(await videoReady(ctx.phone))) return;
    await ctx.phone.goto("/dashboard/media");
    await upload(ctx.phone, "hold-a.png");
    await expect(ctx.phone.getByText("hold-a.png")).toBeVisible();
    await upload(ctx.phone, "hold-c.png");
    await expect(ctx.phone.getByText("hold-c.png")).toBeVisible();
    await ctx.phone.locator('input[type="file"][accept*="video"]').setInputFiles("tests/fixtures/h264-aac.mp4");
    await expect(ctx.phone.getByText("h264-aac.mp4")).toBeVisible({ timeout: 20_000 });
    const library = await authed(ctx.phone, "/api/media");
    const items = library.body as { id: string; fileName: string }[];
    const ids = {
      a: idOf(items, "hold-a.png"),
      v: idOf(items, "h264-aac.mp4"),
      c: idOf(items, "hold-c.png"),
    };
    expect(ids.a && ids.v && ids.c).toBeTruthy();
    // Chrome plays the renamed VP9 file for its full second, so that fixture never
// fails on the TV. HEVC is refused before playback starts.
await replaceStoredMedia(ids.v, "tests/fixtures/hevc.mp4");

    await ctx.tv.goto("/player");
    await pairTv(ctx.phone, ctx.tv, "Hold screen");
    await publishSlides(ctx.phone, "Image broken video image", [
      { name: "hold-a.png", seconds: "2" },
      { name: "h264-aac.mp4", seconds: null },
      { name: "hold-c.png", seconds: "2" },
    ], "Hold screen");

    const watched = await watchScreen(ctx.tv, { a: ids.a, c: ids.c }, 4, 25_000);
    expect(watched.blanks, "the TV went blank while the bad video was skipped").toBe(0);
    expect(watched.events.map((event) => event.id)).toEqual([ids.a, ids.c, ids.a, ids.c]);
    expect(watched.sawVideo).toBe(false);
    watched.events.slice(1).forEach((event, index) => {
      const gap = event.at - watched.events[index].at;
      expect(gap).toBeGreaterThan(1000);
      // The first pass may wait out the short start cap. Later passes skip the known-bad clip
      // and must stay near the 2 second slide, not the old ~13 second retry hold.
      expect(gap).toBeLessThan(index === 0 ? 7000 : 4500);
    });
  } finally {
    await ctx.phoneContext.close();
    await ctx.tvContext.close();
    await deleteTestUsers([ctx.owner.email]);
  }
});

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

async function videoReady(phone: Page) {
  await phone.goto("/dashboard/media");
  if ((await phone.locator('input[type="file"][accept*="video"]').count()) === 0) {
    test.skip(true, "This deployment has no video upload yet.");
  }
  const probe = await authed(phone, "/api/media/upload", {
    method: "POST",
    json: { fileName: "probe.mp4", sizeBytes: 1024 },
  });
  if (probe.status === 503) test.skip(true, "Apply migration 0003_video.sql before the video playback check.");
  expect(probe.status).toBe(201);
  return true;
}

async function pairTv(phone: Page, tv: Page, name: string) {
  const code = await readCode(tv);
  await phone.goto("/dashboard/displays");
  await phone.getByLabel("Code on the TV").fill(code);
  await phone.getByLabel("TV name").fill(name);
  await phone.getByRole("button", { name: "Connect TV", exact: true }).click();
  await expect(phone.getByRole("heading", { name })).toBeVisible();
  await expect(tv.locator("#empty")).toHaveClass(/on/, { timeout: 20_000 });
}

async function publishSlides(phone: Page, playlistName: string, slides: { name: string; seconds: string | null }[], displayName: string) {
  await phone.getByRole("link", { name: "Playlists" }).click();
  await phone.getByLabel("Playlist name").fill(playlistName);
  await phone.getByRole("button", { name: "Create playlist" }).click();
  await expect(phone.getByRole("heading", { name: "Edit playlist" })).toBeVisible();
  for (const slide of slides) {
    await phone.getByRole("button", { name: "Add images" }).click();
    await phone.getByRole("checkbox", { name: slide.name }).check();
    await phone.getByRole("button", { name: "Add selected" }).click();
    if (slide.seconds) await phone.getByLabel(`Seconds for ${slide.name}`).fill(slide.seconds);
  }
  await phone.getByRole("checkbox", { name: displayName }).check();
  await phone.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(phone.getByRole("status")).toContainText("Published", { timeout: 20_000 });
}

function idOf(items: { id: string; fileName: string }[], name: string) {
  return items.find((item) => item.fileName === name)?.id || "";
}

async function screenState(tv: Page) {
  return tv.evaluate(() => {
    function top(ids: string[]) {
      const nodes = ids.map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
      const visible = nodes.filter((node) => node.className.indexOf("on") !== -1);
      visible.sort((a, b) => (parseInt(b.style.zIndex, 10) || 0) - (parseInt(a.style.zIndex, 10) || 0));
      return visible[0] || null;
    }
    const video = top(["va", "vb"]) as HTMLVideoElement | null;
    const image = top(["a", "b"]);
    const empty = document.getElementById("empty");
    const connecting = document.getElementById("connecting");
    const videoOn = !!(video && video.currentSrc);
    const imageOn = !!(image && image.style.backgroundImage && image.style.backgroundImage !== "none");
    const blocked = (!!empty && empty.className.indexOf("on") !== -1) || (!!connecting && connecting.className.indexOf("on") !== -1);
    return {
      visible: (videoOn || imageOn) && !blocked,
      videoOn,
      url: videoOn ? video!.currentSrc : image ? image.style.backgroundImage : "",
    };
  });
}

async function watchScreen(tv: Page, ids: Record<string, string>, count: number, timeout: number) {
  const events: { id: string; at: number }[] = [];
  let last = "";
  let blanks = 0;
  let sawVideo = false;
  let started = false;
  const start = Date.now();
  while (events.length < count && Date.now() - start < timeout) {
    const state = await screenState(tv);
    if (state.visible) started = true;
    else if (started) blanks += 1;
    if (state.videoOn) sawVideo = true;
    const id = Object.values(ids).find((mediaId) => mediaId && state.url.includes(mediaId)) || "";
    if (id && id !== last) {
      events.push({ id, at: Date.now() });
      last = id;
    }
    await tv.waitForTimeout(80);
  }
  return { events, blanks, sawVideo };
}

async function replaceStoredMedia(mediaId: string, filePath: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !service) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required to plant a broken video.");
  const admin = createClient(supabaseUrl, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const row = await admin.from("media").select("storage_path").eq("id", mediaId).single();
  if (row.error || !row.data?.storage_path) throw new Error(row.error?.message || "Could not find the uploaded video.");
  const bytes = readFileSync(filePath);
  const replaced = await admin.storage.from("media").upload(row.data.storage_path, bytes, {
    contentType: "video/mp4",
    upsert: true,
  });
  if (replaced.error) throw new Error(replaced.error.message);
}

async function playingVideo(tv: Page) {
  return tv.evaluate(() => {
    const nodes = [document.getElementById("va"), document.getElementById("vb")];
    return nodes.some((node) => !!node && node.className.indexOf("on") !== -1 && !!node.getAttribute("src"));
  });
}

async function videoTime(tv: Page) {
  return tv.evaluate(() => {
    const nodes = [document.getElementById("va"), document.getElementById("vb")] as HTMLVideoElement[];
    const node = nodes.find((item) => item && item.className.indexOf("on") !== -1);
    return node ? node.currentTime : -1;
  });
}

async function deleteTestUsers(emails: string[]) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !service || emails.length === 0) return;
  const admin = createClient(supabaseUrl, service, { auth: { persistSession: false, autoRefreshToken: false } });
  await removeCreatedTestEmails(admin, emails);
}
