import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { removeCreatedTestEmails } from "../helpers/account-cleanup";

/**
 * Password recovery and account settings. Local only: recovery reads the link
 * from the local Supabase Mailpit inbox (MAILPIT_URL, default 127.0.0.1:54324).
 */
const baseURL = process.env.BASE_URL || "";
const mailpit = process.env.MAILPIT_URL || "http://127.0.0.1:54324";
const local = /localhost|127\.0\.0\.1/.test(baseURL);
const pending: string[] = [];
const shots = process.env.SHOT_DIR || "";

test.skip(!baseURL || !local, "Skipped: recovery needs a local BASE_URL and the local Supabase Mailpit inbox.");

test.afterEach(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const emails = pending.splice(0);
  if (!url || !key || !emails.length) return;
  await removeCreatedTestEmails(createClient(url, key, { auth: { persistSession: false } }), emails);
});

function account() {
  const user = { email: `pantalla-e2e-${randomUUID()}@mailinator.com`, password: `Pantalla-${randomUUID()}` };
  pending.push(user.email);
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

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByPlaceholder("Email").fill(email);
  await page.getByPlaceholder("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

async function recoveryLink(email: string) {
  let link = "";
  await expect.poll(async () => {
    const res = await fetch(`${mailpit}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
    if (!res.ok) return "";
    const list = (await res.json()) as { messages?: { ID: string }[] };
    const id = list.messages?.[0]?.ID;
    if (!id) return "";
    const msg = (await (await fetch(`${mailpit}/api/v1/message/${id}`)).json()) as { HTML?: string; Text?: string };
    const body = `${msg.Text ?? ""} ${msg.HTML ?? ""}`;
    link = (body.match(/https?:\/\/[^\s"'<>]+\/auth\/v1\/verify[^\s"'<>]+/) ?? [""])[0].replace(/&amp;/g, "&");
    return link;
  }, { timeout: 30_000 }).toContain("type=recovery");
  return link;
}

async function shot(page: Page, name: string) {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
}

test("forgot password emails a link, the link sets a new password, and the old one stops working", async ({ browser }) => {
  const user = account();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await signUp(page, user);
  await page.evaluate(() => localStorage.clear());

  await page.goto("/login");
  await shot(page, "login-390");
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await expect(page.getByRole("heading", { name: "Reset your password" })).toBeVisible();
  await shot(page, "forgot-390");
  await page.getByLabel("Email").fill(user.email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await shot(page, "forgot-sent-390");

  const link = await recoveryLink(user.email);
  expect(decodeURIComponent(link)).toContain("redirect_to=" + baseURL.replace(/\/$/, "") + "/reset-password");
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible({ timeout: 20_000 });
  await shot(page, "reset-390");
  const fresh = `Fresh-${randomUUID()}`;
  await page.getByLabel("New password", { exact: true }).fill(fresh);
  await page.getByLabel("Confirm new password").fill("mismatch-123");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.locator("p[role=alert]")).toHaveText("The two passwords don't match.");
  await page.getByLabel("Confirm new password").fill(fresh);
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByRole("heading", { name: "Password updated" })).toBeVisible();
  await page.evaluate(() => localStorage.clear());

  await signIn(page, user.email, user.password);
  await expect(page.locator("p[role=alert]")).toHaveText("That email and password don't match.");
  await signIn(page, user.email, fresh);
  await page.waitForURL("**/dashboard**");

  // A used or broken link shows the friendly invalid state, not a blank page.
  await page.goto("/reset-password#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired");
  await expect(page.getByRole("heading", { name: "This link can't be used" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Send a new link" })).toBeVisible();
  await context.close();
});

test("settings shows the email, saves a display name, changes the password, and signs out everywhere", async ({ browser }) => {
  const user = account();
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await desktop.newPage();
  await signUp(page, user);
  const other = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const phone = await other.newPage();
  await signIn(phone, user.email, user.password);
  await phone.waitForURL("**/dashboard**");

  await page.goto("/dashboard/settings");
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  await expect(page.getByText(user.email, { exact: true }).first()).toBeVisible();
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Front of house");
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByText("Name saved")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Name", exact: true })).toHaveValue("Front of house");
  await shot(page, "settings-1440");

  await page.getByLabel("Current password").fill("wrong-password-1");
  await page.getByLabel("New password", { exact: true }).fill("Another-pass-1");
  await page.getByLabel("Confirm new password").fill("Another-pass-1");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.locator("p[role=alert]")).toHaveText("Your current password isn't right.");
  const next = `Next-${randomUUID()}`;
  await page.getByLabel("Current password").fill(user.password);
  await page.getByLabel("New password", { exact: true }).fill(next);
  await page.getByLabel("Confirm new password").fill(next);
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("Password changed. Other devices are signed out.")).toBeVisible();

  // Supabase revokes every other session when the password changes.
  await phone.goto("/dashboard/settings");
  await phone.waitForURL("**/login", { timeout: 20_000 });

  await signIn(phone, user.email, next);
  await phone.waitForURL("**/dashboard**");
  await phone.goto("/dashboard/settings");
  await expect(phone.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  await shot(phone, "settings-390");
  const refresh = await phone.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith("sb-") && k.endsWith("-auth-token"));
    return key ? (JSON.parse(localStorage.getItem(key) || "{}").refresh_token as string) : "";
  });
  expect(refresh).toBeTruthy();
  await page.getByRole("button", { name: "Sign out of all devices" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Sign out everywhere" }).click();
  await page.waitForURL("**/login");
  // The phone's refresh token (read before signing out) is now revoked.
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "", "content-type": "application/json" },
    body: JSON.stringify({ refresh_token: refresh }),
  });
  expect(res.status).toBeGreaterThanOrEqual(400);

  await signIn(page, user.email, next);
  await page.waitForURL("**/dashboard**");
  await desktop.close();
  await other.close();
});
