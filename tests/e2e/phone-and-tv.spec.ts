import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

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

  try {
    const accountA = account();
    const accountB = account();
    created.push(accountA.email, accountB.email);

    await signUp(phone, accountA);
    await phone.getByRole("link", { name: "Settings" }).click();
    await phone.getByRole("button", { name: "Sign out" }).click();
    await phone.waitForURL("**/login**");
    await signIn(phone, accountA);

    await tv.goto("/player");
    await expect(tv).toHaveTitle("Pantalla");
    const code = await readCode(tv);

    await phone.goto("/dashboard/media");
    await upload(phone, "lunch-menu.png");
    await expect(phone.getByText("lunch-menu.png")).toBeVisible();

    await phone.goto("/dashboard/displays");
    await phone.getByLabel("Code on the TV").fill(code);
    await phone.getByLabel("TV name").fill("Front counter");
    await phone.getByRole("button", { name: "Connect TV", exact: true }).click();
    await expect(phone.getByRole("heading", { name: "Front counter" })).toBeVisible();
    await expect(tv.locator("#empty")).toHaveClass(/on/, { timeout: 20_000 });

    await phone.getByRole("button", { name: "Change image" }).click();
    await phone.getByRole("button", { name: "lunch-menu.png" }).click();
    const firstUrl = await waitForImage(tv);

    await phone.goto("/dashboard/media");
    await upload(phone, "dinner-menu.png");
    await expect(phone.getByText("dinner-menu.png")).toBeVisible();
    const library = await authed(phone, "/api/media");
    const items = library.body as { id: string; fileName: string }[];
    const lunchId = items.find((item) => item.fileName === "lunch-menu.png")?.id;
    const dinnerId = items.find((item) => item.fileName === "dinner-menu.png")?.id;
    expect(lunchId).toBeTruthy();
    expect(dinnerId).toBeTruthy();

    await phone.goto("/dashboard/displays");
    await phone.getByRole("button", { name: "Change image" }).click();
    await phone.getByRole("button", { name: "dinner-menu.png" }).click();
    const secondUrl = await waitForReplacement(tv, firstUrl);
    expect(secondUrl).not.toBe(firstUrl);

    await tvContext.setOffline(true);
    await expect(tv.locator("#status")).toContainText("Reconnecting", { timeout: 30_000 });
    expect(await shownUrl(tv)).toBe(secondUrl);
    await expect(tv.locator("#connecting")).not.toHaveClass(/on/);
    await tvContext.setOffline(false);
    await expect(tv.locator("#status")).not.toHaveClass(/on/, { timeout: 30_000 });
    expect(await shownUrl(tv)).toBe(secondUrl);

    const token = await tv.evaluate(() => localStorage.getItem("pantalla_display_token"));
    expect(token).toEqual(expect.any(String));
    phone.once("dialog", (dialog) => dialog.accept());
    await phone.getByRole("button", { name: "Disconnect" }).click();
    await expect(tv.locator("#pair")).toHaveClass(/on/, { timeout: 25_000 });
    expect(await tv.evaluate(() => localStorage.getItem("pantalla_display_token"))).toBeNull();
    const revoked = await fetch(new URL("/api/player/state", baseURL), { headers: { "X-Display-Token": token || "" } });
    expect(revoked.status).toBe(401);

    await phone.getByRole("link", { name: "Settings" }).click();
    await phone.getByRole("button", { name: "Sign out" }).click();
    await phone.waitForURL("**/login**");
    await signUp(phone, accountB);
    await phone.goto("/dashboard/media");
    await expect(phone.getByText("No images yet")).toBeVisible();
    const foreignList = await authed(phone, "/api/media");
    expect(foreignList.status).toBe(200);
    expect(JSON.stringify(foreignList.body)).not.toContain(lunchId);
    expect(JSON.stringify(foreignList.body)).not.toContain("lunch-menu.png");
    const foreignDelete = await authed(phone, `/api/media/${lunchId}`, { method: "DELETE" });
    expect(foreignDelete.status).toBe(404);

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
  } finally {
    await phoneContext.close();
    await tvContext.close();
    await deleteTestUsers(created);
  }
});

function account() {
  return {
    email: `pantalla-e2e-${Date.now()}-${randomUUID().slice(0, 8)}@example.com`,
    password: `Pantalla-${randomUUID()}`,
  };
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
  await page.locator('input[type="file"]').setInputFiles({ name, mimeType: "image/png", buffer: png });
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

async function deleteTestUsers(emails: string[]) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !service || emails.length === 0) return;
  const admin = createClient(supabaseUrl, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  for (const user of data?.users ?? []) {
    if (user.email && emails.includes(user.email)) await admin.auth.admin.deleteUser(user.id);
  }
}
