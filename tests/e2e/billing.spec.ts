import { createHash, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { devices, expect, test } from "@playwright/test";
import { removeCreatedTestEmails } from "../helpers/account-cleanup";

/**
 * M17.1/M17.2: plan page on a phone browser, sign-in return path, pairing limit,
 * screen selection and the player's paused card. LOCAL only (writes plan state),
 * and the server must run with BILLING_ENFORCE=1.
 */
const baseURL = process.env.BASE_URL || "";
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const service = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const local = /localhost|127\.0\.0\.1/.test(baseURL) && /127\.0\.0\.1|localhost/.test(sbUrl);
test.skip(!local || process.env.BILLING_ENFORCE !== "1", "Skipped: needs a local BASE_URL/Supabase and BILLING_ENFORCE=1.");
test.use({ ...devices["Pixel 7"] });

const emails: string[] = [];
let db: SupabaseClient;
test.beforeAll(() => { db = createClient(sbUrl, service, { auth: { persistSession: false } }); });
test.afterAll(async () => { if (emails.length) await removeCreatedTestEmails(db, emails); });

async function owner() {
  const email = `pantalla-e2e-${randomUUID()}@mailinator.com`;
  const password = `Pekko-${randomUUID()}`;
  emails.push(email);
  const { data } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  const { data: accountId } = await db.rpc("ensure_account", { p_user_id: data.user!.id, p_name: "Taqueria" });
  const anonClient = createClient(sbUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "", { auth: { persistSession: false } });
  const { data: s } = await anonClient.auth.signInWithPassword({ email, password });
  return { email, password, accountId: accountId as string, token: s.session!.access_token };
}
async function screen(accountId: string, name: string) {
  const token = `e2e-${randomUUID()}-display-token`;
  const { data } = await db.from("displays").insert({ account_id: accountId, name,
    token_hash: createHash("sha256").update(token).digest("hex") }).select("id").single();
  return { id: data!.id as string, token };
}

test("billing page works from a phone browser after sign-in", async ({ page }) => {
  const o = await owner();
  await page.goto("/dashboard/billing");
  await page.waitForURL(/\/login\?next=%2Fdashboard%2Fbilling/);
  await page.getByPlaceholder("Email").fill(o.email);
  await page.getByPlaceholder("Password").fill(o.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/dashboard/billing");
  await expect(page.getByTestId("plan-status")).toContainText("Free trial");
  await expect(page.getByTestId("trial-countdown")).toContainText("14 days left");
  await expect(page.getByText("$19")).toBeVisible();
  await expect(page.getByText("$59")).toBeVisible();
  // No horizontal scrolling on a phone.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test("?next= cannot send the user off Pekko", async ({ page }) => {
  const o = await owner();
  await page.goto("/login?next=https://evil.example/");
  await page.getByPlaceholder("Email").fill(o.email);
  await page.getByPlaceholder("Password").fill(o.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/\/dashboard$/);
});

test("entitlements API, pairing limit and screen selection", async ({ request }) => {
  const o = await owner();
  const auth = { Authorization: `Bearer ${o.token}` };
  const e = await (await request.get("/api/entitlements", { headers: auth })).json();
  expect(e).toMatchObject({ state: "trial", screen_limit: 5, enforced: true, features_locked: [] });

  const ids = [];
  for (let i = 0; i < 5; i++) ids.push((await screen(o.accountId, `S${i + 1}`)).id);
  const code = "135790";
  // A real pending session for that code (hash matches the server's HMAC only via the route), so
  // the limit check, which runs first, is what's under test.
  const pair = await request.post("/api/displays/pair", { headers: auth, data: { code, name: "Sixth" } });
  expect(pair.status()).toBe(403);
  expect(await pair.json()).toMatchObject({ code: "screen_limit" });

  await db.from("accounts").update({ plan: "business", subscription_status: "active" }).eq("id", o.accountId);
  const over = await (await request.get("/api/entitlements", { headers: auth })).json();
  expect(over.warning).toMatchObject({ kind: "over_limit", action: "select_screens" });
  const tooMany = await request.post("/api/entitlements/active-screens", { headers: auth, data: { displayIds: ids.slice(0, 4) } });
  expect(tooMany.status()).toBe(400);
  const ok = await request.post("/api/entitlements/active-screens", { headers: auth, data: { displayIds: ids.slice(0, 3) } });
  expect(ok.status()).toBe(200);
  expect(await ok.json()).toMatchObject({ active_screens: 3, screen_limit: 3, warning: null });
  const list = await (await request.get("/api/displays", { headers: auth })).json();
  expect(list.filter((d: { entitled: boolean }) => d.entitled).map((d: { id: string }) => d.id).sort()).toEqual(ids.slice(0, 3).sort());

  const other = await owner();
  const foreign = await request.post("/api/entitlements/active-screens", { headers: { Authorization: `Bearer ${other.token}` }, data: { displayIds: [ids[0]] } });
  expect(foreign.status()).toBe(403);
});

test("an expired trial pauses the player without unpairing it, and it resumes", async ({ page, request }) => {
  const o = await owner();
  const s = await screen(o.accountId, "Front counter");
  await db.from("accounts").update({ trial_ends_at: new Date(Date.now() - 4 * 86_400_000).toISOString() }).eq("id", o.accountId);
  const api = await request.get("/api/player/state", { headers: { "x-display-token": s.token } });
  expect(api.status()).toBe(402);
  await page.addInitScript((t) => window.localStorage.setItem("pantalla_display_token", t), s.token);
  await page.goto("/player");
  await expect(page.locator("#paused")).toBeVisible();
  await expect(page.locator("#paused-title")).toHaveText("This screen is paused");
  expect(await page.evaluate(() => window.localStorage.getItem("pantalla_display_token"))).toBe(s.token);
  const { data: d } = await db.from("displays").select("status").eq("id", s.id).single();
  expect(d!.status).toBe("active");

  await db.from("accounts").update({ plan: "starter", subscription_status: "active" }).eq("id", o.accountId);
  expect((await request.get("/api/player/state", { headers: { "x-display-token": s.token } })).status()).toBe(200);
});
