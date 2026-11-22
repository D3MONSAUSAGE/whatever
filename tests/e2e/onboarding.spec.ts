import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { removeCreatedTestEmails } from "../helpers/account-cleanup";

/**
 * Menu-first onboarding (v2) on Overview. Needs BASE_URL and the service role for the target database
 * (0036 applied) to seed content for fresh test accounts. Never point this at customer data.
 */
const baseURL = process.env.BASE_URL || "";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
test.skip(!baseURL, "Skipped: BASE_URL is not set. Onboarding checks did not run and are not a pass.");

const SHOTS = process.env.ONBOARDING_SHOTS_DIR || "";
const ITEM_BOARD = { title: "Lunch", sections: [{ name: "Tacos", items: [{ name: "Al pastor", price: "3" }] }] };
const created: string[] = [];
const admin = (): SupabaseClient | null => (supabaseUrl && serviceKey ? createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } }) : null);

test.afterAll(async () => {
  const a = admin();
  if (a && created.length) await removeCreatedTestEmails(a, created);
});

const VIEWPORTS = [{ name: "phone", width: 390, height: 844 }, { name: "desktop", width: 1280, height: 900 }] as const;
const COPY = {
  en: { heading: "Get your menu on your TV", zero: "0 of 5 steps done", one: "1 of 5 steps done", create: "Create my menu", upload: "Already have a menu? Upload it instead.", success: "Your first menu is ready!", close: "Close", connect: "Connect TV", optional: "Optional", preview: "Preview menu" },
  es: { heading: "Ponga su menú en su TV", zero: "0 de 5 pasos completados", one: "1 de 5 pasos completados", create: "Crear mi menú", upload: "¿Ya tiene un menú? Súbalo.", success: "¡Su primer menú está listo!", close: "Cerrar", connect: "Conectar TV", optional: "Opcional", preview: "Ver vista previa" },
} as const;

async function fresh(browser: Browser, lang: "en" | "es", vp: (typeof VIEWPORTS)[number]) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, baseURL });
  if (lang === "es") await context.addCookies([{ name: "pekko_locale", value: "es", url: baseURL }]);
  const page = await context.newPage();
  const user = { email: `pantalla-e2e-${randomUUID()}@mailinator.com`, password: `Pantalla-${randomUUID()}` };
  created.push(user.email);
  await signUp(page, user);
  return { context, page, user };
}

async function accountId(email: string) {
  const a = admin();
  if (!a) throw new Error("SUPABASE_SERVICE_ROLE_KEY is needed to seed a test account's first menu.");
  let id: string | null = null;
  await expect.poll(async () => {
    const users = await a.auth.admin.listUsers({ perPage: 200 });
    const u = users.data.users.find((x) => x.email === email);
    if (!u) return false;
    id = (await a.from("accounts").select("id").eq("owner_user_id", u.id).maybeSingle()).data?.id ?? null;
    return Boolean(id);
  }, { timeout: 20_000 }).toBe(true);
  return { a, id: id! };
}

for (const lang of ["en", "es"] as const) {
  for (const vp of VIEWPORTS) {
    const c = COPY[lang];
    test(`${lang} ${vp.name}: fresh account, TV pairing usable first, optional steps marked`, async ({ browser }) => {
      const { context, page } = await fresh(browser, lang, vp);
      try {
        const setup = page.getByTestId("setup-tracker");
        await expect(setup.getByRole("heading", { name: c.heading })).toBeVisible();
        await expect(setup.getByText(c.zero)).toBeVisible();
        await expect(setup.getByRole("link", { name: c.create })).toHaveAttribute("href", "/dashboard/media/menus?new=1");
        await expect(setup.getByRole("link", { name: c.upload })).toHaveAttribute("href", "/dashboard/media");
        await expect(setup.getByText(c.optional, { exact: true })).toHaveCount(3);
        await expect(page.getByTestId("first-success")).toHaveCount(0);
        if (SHOTS) await page.screenshot({ path: `${SHOTS}/e2e-${lang}-${vp.name}-fresh.png`, fullPage: true });
        await setup.getByRole("link", { name: c.connect }).click();
        await page.waitForURL("**/dashboard/screens/add**");
      } finally {
        await context.close();
      }
    });

    test(`${lang} ${vp.name}: Path A board with an item shows the success card once`, async ({ browser }) => {
      const { context, page, user } = await fresh(browser, lang, vp);
      try {
        const { a, id } = await accountId(user.email);
        await a.from("menus").insert({ account_id: id, name: "Lunch", template: "fresh", content: ITEM_BOARD });
        await page.reload();
        const card = page.getByTestId("first-success");
        await expect(card.getByText(c.success)).toBeVisible({ timeout: 15_000 });
        await expect(page.getByTestId("setup-tracker").getByText(c.one)).toBeVisible();
        if (SHOTS) await page.screenshot({ path: `${SHOTS}/e2e-${lang}-${vp.name}-success.png`, fullPage: true });
        await card.getByRole("button", { name: c.close }).click();
        await expect(card).toHaveCount(0);
        await page.reload();
        await expect(page.getByTestId("setup-tracker")).toBeVisible();
        await expect(page.getByTestId("first-success")).toHaveCount(0);
      } finally {
        await context.close();
      }
    });
  }
}

test("Path B: a finished upload counts; preview goes to the library", async ({ browser }) => {
  const { context, page, user } = await fresh(browser, "en", VIEWPORTS[0]);
  try {
    const { a, id } = await accountId(user.email);
    await a.from("media").insert({ account_id: id, file_name: "my-menu.jpg", kind: "image", storage_path: `${id}/e2e-${randomUUID()}.jpg`, size_bytes: 1000, mime_type: "image/jpeg" });
    await page.reload();
    const card = page.getByTestId("first-success");
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card.getByRole("link", { name: "Preview menu" })).toHaveAttribute("href", "/dashboard/media");
  } finally {
    await context.close();
  }
});

test("negatives: a title-only board and server stills earn nothing", async ({ browser }) => {
  const { context, page, user } = await fresh(browser, "en", VIEWPORTS[1]);
  try {
    const { a, id } = await accountId(user.email);
    await a.from("menus").insert({ account_id: id, name: "Only a title", template: "fresh", content: { title: "Taqueria", sections: [] } });
    await a.from("media").insert({ account_id: id, file_name: "Taqueria (menu).png", kind: "image", storage_path: `${id}/e2e-${randomUUID()}.png`, size_bytes: 1000, mime_type: "image/png" });
    await page.reload();
    await expect(page.getByTestId("setup-tracker").getByText("0 of 5 steps done")).toBeVisible();
    await expect(page.getByTestId("first-success")).toHaveCount(0);
  } finally {
    await context.close();
  }
});

async function signUp(page: Page, user: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByRole("button", { name: /New here\? Create an account|¿Es nuevo\?/ }).click();
  await page.getByPlaceholder(/Email|Correo/).fill(user.email);
  await page.getByPlaceholder(/Password|Contraseña/).fill(user.password);
  await page.getByRole("button", { name: /^(Create account|Crear cuenta)$/ }).click();
  await page.waitForURL("**/dashboard**", { timeout: 25_000 });
}
