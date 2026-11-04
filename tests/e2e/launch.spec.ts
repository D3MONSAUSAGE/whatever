import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { devices, expect, test } from "@playwright/test";
import { removeCreatedTestEmails } from "../helpers/account-cleanup";

/**
 * M17.5/M17.6: public pricing, support, contact and deletion pages; self-service
 * deletion (owner only); staff overview allowlist. LOCAL only. The server must run with
 * ACCOUNT_DELETION=1, CRON_SECRET=$E2E_CRON_SECRET and STAFF_EMAILS=$E2E_STAFF_EMAIL.
 */
const baseURL = process.env.BASE_URL || "";
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const service = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const staffEmail = process.env.E2E_STAFF_EMAIL || "";
const cronSecret = process.env.E2E_CRON_SECRET || "";
const local = /localhost|127\.0\.0\.1/.test(baseURL) && /127\.0\.0\.1|localhost/.test(sbUrl);
test.skip(!local || !staffEmail || !cronSecret, "Skipped: needs local BASE_URL/Supabase, E2E_STAFF_EMAIL and E2E_CRON_SECRET.");
test.use({ ...devices["Pixel 7"] });

const emails: string[] = [];
let db: SupabaseClient;
test.beforeAll(() => { db = createClient(sbUrl, service, { auth: { persistSession: false } }); });
test.afterAll(async () => { if (emails.length) await removeCreatedTestEmails(db, emails); });

async function owner(email = `pantalla-e2e-${randomUUID()}@mailinator.com`) {
  const password = `Pekko-${randomUUID()}`;
  emails.push(email);
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(error.message);
  const { data: accountId } = await db.rpc("ensure_account", { p_user_id: data.user!.id, p_name: "Taqueria" });
  const c = createClient(sbUrl, anonKey, { auth: { persistSession: false } });
  const { data: s } = await c.auth.signInWithPassword({ email, password });
  return { email, password, userId: data.user!.id, accountId: accountId as string, token: s.session!.access_token };
}
const auth = (t: string) => ({ authorization: `Bearer ${t}` });

test("pricing shows the approved plans and Start free trial opens sign-up", async ({ page }) => {
  await page.goto("/pricing");
  for (const [id, price] of [["starter", "$19"], ["business", "$39"], ["multi", "$59"]]) {
    await expect(page.getByTestId(`plan-${id}`)).toContainText(price);
  }
  await expect(page.getByText("14 days free · up to 5 screens · no card needed")).toBeVisible();
  await page.getByTestId("start-trial").click();
  await page.waitForURL(/\/login\?mode=up/);
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test("support, contact and legal pages carry placeholders, not invented details", async ({ page }) => {
  for (const path of ["/support", "/contact", "/account-deletion"]) {
    await page.goto(path);
    await expect(page.getByTestId("support-todo")).toBeVisible();
    expect(await page.locator("a[href^='mailto:']").count()).toBe(0);
  }
  await page.goto("/account-deletion");
  await expect(page.getByTestId("deleted-table")).toContainText("Uploaded images and videos");
  await expect(page.getByTestId("retained-table")).toContainText("Stripe");
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { name: "Privacy Policy (DRAFT)" })).toBeVisible();
  for (const p of ["Supabase", "Vercel", "Firebase Cloud Messaging", "Stripe (planned)", "[Legal entity name: to be confirmed]"]) {
    await expect(page.getByText(p, { exact: false }).first()).toBeVisible();
  }
  await page.goto("/terms");
  await expect(page.getByRole("heading", { name: "Terms of Service (DRAFT)" })).toBeVisible();
  await expect(page.getByText("[Legal entity name: to be confirmed]", { exact: false })).toBeVisible();
});

test("a signed-out owner deletes their account from the public page, can cancel, and the job deletes it", async ({ page, request }) => {
  const o = await owner();
  const other = await owner();
  await page.goto("/account-deletion");
  await page.getByTestId("deletion-signin").click();
  await page.waitForURL(/\/login\?next=/);
  await page.getByPlaceholder("Email").fill(o.email);
  await page.getByPlaceholder("Password").fill(o.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/dashboard/settings/delete");
  const del = page.getByRole("button", { name: "Delete my account" });
  await expect(del).toBeDisabled();
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await page.getByLabel("Your password").fill("wrong-password");
  await del.click();
  await expect(page.getByText("That password isn't right.")).toBeVisible();
  await page.getByLabel("Your password").fill(o.password);
  await del.click();
  await expect(page.getByTestId("deletion-pending")).toBeVisible();
  await page.getByRole("button", { name: "Cancel deletion" }).click();
  await expect(page.getByRole("button", { name: "Delete my account" })).toBeVisible();

  // API for the app: bad confirm, then schedule; another user sees nothing of it.
  expect((await request.post("/api/account/deletion", { headers: auth(o.token), data: { confirm: "yes", password: o.password } })).status()).toBe(400);
  const r = await request.post("/api/account/deletion", { headers: auth(o.token), data: { confirm: "DELETE", password: o.password } });
  expect(r.status()).toBe(202);
  expect((await (await request.get("/api/account/deletion", { headers: auth(other.token) })).json()).request).toBeNull();
  expect((await request.get("/api/account/deletion")).status()).toBe(401);

  // Not due yet: the job leaves it alone. Then make it due.
  const cron = { authorization: `Bearer ${cronSecret}` };
  expect((await request.get("/api/cron/account-deletion")).status()).toBe(401);
  expect(await (await request.get("/api/cron/account-deletion", { headers: cron })).json()).toMatchObject({ deleted: 0 });
  await db.from("account_deletion_requests").update({ scheduled_for: new Date(Date.now() - 1000).toISOString() }).eq("account_id", o.accountId).eq("status", "pending");
  expect(await (await request.get("/api/cron/account-deletion", { headers: cron })).json()).toMatchObject({ deleted: 1, failed: 0 });
  expect((await db.from("accounts").select("id").eq("id", o.accountId)).data).toHaveLength(0);
  expect((await db.from("accounts").select("id").eq("id", other.accountId)).data).toHaveLength(1);
});

test("staff overview is allowlisted and aggregate-only", async ({ request, page }) => {
  const o = await owner();
  expect((await request.get("/api/admin/overview", { headers: auth(o.token) })).status()).toBe(404);
  const s = await owner(staffEmail);
  const r = await request.get("/api/admin/overview", { headers: auth(s.token) });
  expect(r.status()).toBe(200);
  const body = await r.json();
  expect(body.events.trial_started).toBeGreaterThan(0);
  expect(JSON.stringify(body)).not.toMatch(/@|[0-9a-f]{8}-[0-9a-f]{4}-/);
  await page.goto("/login?next=/dashboard/staff");
  await page.getByPlaceholder("Email").fill(s.email);
  await page.getByPlaceholder("Password").fill(s.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByTestId("staff-overview")).toContainText("trial_started");
});
