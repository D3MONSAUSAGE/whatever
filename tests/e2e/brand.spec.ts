import { randomUUID } from "node:crypto";
import { deflateSync } from "node:zlib";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { removeCreatedTestEmails } from "../helpers/account-cleanup";

/** M11: set a logo and colours, use a photo on a menu, and apply the brand to all menus. Local/preview only. */
const baseURL = process.env.BASE_URL || "";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
test.skip(!baseURL || !key, "Skipped: BASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set. Brand checks did not run and are not a pass.");

function png(r: number, g: number, b: number, size = 16) {
  const table = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf: Buffer) => { let c = 0xffffffff; for (const x of buf) c = table[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer) => { const t = Buffer.from(type); const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.concat(Array.from({ length: size }, () => Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: size }, () => [r, g, b]).flat())])));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

test.afterEach(async () => {
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const emails = test.info().annotations.filter((a) => a.type === "cleanup").map((a) => a.description!);
  await removeCreatedTestEmails(admin, emails);
});

test("a customer sets their brand, adds a photo to a menu and applies the brand", async ({ browser }) => {
  test.setTimeout(90_000);
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const prefix = `pantalla-e2e-${randomUUID()}`;
  const user = { email: `${prefix}@mailinator.com`, password: `Pantalla-${randomUUID()}` };
  test.info().annotations.push({ type: "cleanup", description: user.email });
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
  for (const [name, bytes] of [["logo.png", png(200, 16, 46)], ["tacos.png", png(240, 160, 40)]] as const) {
    const id = randomUUID();
    const path = `${acct!.id}/${id}.png`;
    await admin.storage.from("media").upload(path, bytes, { contentType: "image/png" });
    await admin.from("media").insert({ id, account_id: acct!.id, file_name: name, storage_path: path, mime_type: "image/png", size_bytes: bytes.length });
  }

  // Settings links to the brand card.
  await page.goto("/dashboard/settings");
  await page.getByRole("link", { name: "Set up your brand" }).click();
  await page.waitForURL("**/dashboard/media/menus**");
  const brand = page.getByRole("region", { name: "Your brand" });
  await brand.getByLabel("Logo").selectOption({ label: "logo.png" });
  await brand.getByLabel("Main colour", { exact: true }).fill("#c8102e");
  await brand.getByRole("button", { name: "Save brand" }).click();
  await expect(page.getByText("Brand saved.")).toBeVisible({ timeout: 15_000 });
  const kit = (await admin.from("brand_kits").select("primary_color, logo_media_id").eq("account_id", acct!.id).single()).data!;
  expect(kit.primary_color).toBe("#c8102e");
  expect(kit.logo_media_id).not.toBeNull();

  await page.getByRole("button", { name: "New menu board" }).click();
  const editor = page.getByTestId("menu-editor");
  await editor.getByLabel("Photo (optional)").selectOption({ label: "tacos.png" });
  await expect(editor.getByLabel("Use my brand (logo and colours)")).toBeChecked();
  await expect(editor.getByTestId("menu-preview")).toBeVisible({ timeout: 15_000 });
  await editor.getByRole("button", { name: "Create menu board" }).click();
  await expect(page.getByText("Menu board created.")).toBeVisible({ timeout: 15_000 });
  const menu = (await admin.from("menus").select("id, media_id, content").eq("account_id", acct!.id).single()).data!;
  expect(menu.content).toMatchObject({ useBrand: true, photoMediaId: expect.any(String) });

  await page.getByRole("region", { name: "Your brand" }).getByRole("button", { name: "Apply to all menus" }).click();
  await expect(page.getByText("Updated 1 menu.")).toBeVisible({ timeout: 20_000 });
  const after = (await admin.from("menus").select("media_id").eq("id", menu.id).single()).data!;
  expect(after.media_id).not.toBe(menu.media_id);
  await context.close();
});
