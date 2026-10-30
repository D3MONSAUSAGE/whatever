import { randomUUID } from "node:crypto";
import { deflateSync } from "node:zlib";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";
import { removeCreatedTestUsers } from "../helpers/account-cleanup";
import { POST as menuPost } from "@/app/api/menus/route";
import { PATCH as menuPatch } from "@/app/api/menus/[id]/route";
import { POST as previewPost } from "@/app/api/menus/preview/route";
import { GET as brandGet, PUT as brandPut } from "@/app/api/brand/route";
import { POST as applyPost } from "@/app/api/brand/apply/route";
import { sampleMenu } from "@/lib/menu-templates";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const service = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const configured = /^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url) && anon.length > 20 && service.length > 20 && process.env.PANTALLA_BRAND_MIGRATION !== "absent";

/** A tiny valid solid-colour PNG. */
function png(r: number, g: number, b: number, size = 8) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf: Buffer) => { let c = 0xffffffff; for (const x of buf) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer) => { const t = Buffer.from(type); const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.concat(Array.from({ length: size }, () => Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: size }, () => [r, g, b]).flat())])));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

/** M11 (0008_brand_kits.sql) through the real handlers against the local database. */
describe.skipIf(!configured)("brand kits", () => {
  const admin: SupabaseClient = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const created: string[] = [];
  afterAll(() => removeCreatedTestUsers(admin, created));

  async function owner() {
    const email = `pantalla-rls-${randomUUID()}@mailinator.com`;
    const password = `${randomUUID()}Aa1!`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw new Error(error?.message);
    created.push(data.user.id);
    const { data: accountId } = await admin.rpc("ensure_account", { p_user_id: data.user.id, p_name: "Brand Cafe" });
    const c = createClient(url, anon, { auth: { persistSession: false } });
    const s = await c.auth.signInWithPassword({ email, password });
    return { accountId: accountId as string, token: s.data.session!.access_token, client: c };
  }
  async function image(accountId: string, mime: string, bytes: Buffer, ext: string) {
    const id = randomUUID();
    const path = `${accountId}/${id}.${ext}`;
    const up = await admin.storage.from("media").upload(path, bytes, { contentType: mime });
    if (up.error) throw new Error(up.error.message);
    await admin.from("media").insert({ id, account_id: accountId, file_name: `art.${ext}`, storage_path: path, mime_type: mime, size_bytes: bytes.length }).throwOnError();
    return id;
  }
  const req = (path: string, token: string, init: RequestInit = {}) => {
    const h = new Headers(init.headers); h.set("Authorization", `Bearer ${token}`); h.set("content-type", "application/json");
    return new Request(`http://localhost${path}`, { ...init, headers: h });
  };
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

  it("saves a brand per account, validates logos and photos, and applies the brand to menus", async () => {
    const a = await owner();
    const b = await owner();
    const logo = await image(a.accountId, "image/png", png(255, 0, 0), "png");
    const webp = await image(a.accountId, "image/webp", Buffer.from("RIFF0000WEBPVP8 "), "webp");
    const bLogo = await image(b.accountId, "image/png", png(0, 255, 0), "png");

    // Default brand before anything is saved.
    const first = await (await brandGet(req("/api/brand", a.token))).json();
    expect(first).toMatchObject({ primaryColor: "#0066ff", available: true, custom: false, logoMediaId: null });

    // Validation: colours, someone else's logo, unsupported format.
    const put = (token: string, body: unknown) => brandPut(req("/api/brand", token, { method: "PUT", body: JSON.stringify(body) }));
    expect((await put(a.token, { primaryColor: "red", accentColor: "#fff" })).status).toBe(400);
    expect((await put(a.token, { primaryColor: "#c8102e", accentColor: "#fff", logoMediaId: bLogo })).status).toBe(404);
    expect((await put(a.token, { primaryColor: "#c8102e", accentColor: "#fff", logoMediaId: webp })).status).toBe(400);
    const ok = await put(a.token, { primaryColor: "#C8102E", accentColor: "#fff", logoMediaId: logo });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ primaryColor: "#c8102e", accentColor: "#ffffff", logoMediaId: logo });

    // Isolation: B still has defaults; nobody can read brand_kits directly.
    expect(await (await brandGet(req("/api/brand", b.token))).json()).toMatchObject({ custom: false, primaryColor: "#0066ff" });
    const direct = await a.client.from("brand_kits").select("*");
    expect(direct.data ?? []).toHaveLength(0);

    // Preview uses the brand; a photo from another account or a WebP is refused.
    const content = { ...sampleMenu(), photoMediaId: logo };
    const branded = await previewPost(req("/api/menus/preview", a.token, { method: "POST", body: JSON.stringify({ template: "bold", content }) }));
    expect(branded.status).toBe(200);
    const plain = await previewPost(req("/api/menus/preview", a.token, { method: "POST", body: JSON.stringify({ template: "bold", content: { ...content, useBrand: false, photoMediaId: null } }) }));
    expect(Buffer.from(await branded.arrayBuffer()).equals(Buffer.from(await plain.arrayBuffer()))).toBe(false);
    expect((await previewPost(req("/api/menus/preview", a.token, { method: "POST", body: JSON.stringify({ template: "bold", content: { ...content, photoMediaId: bLogo } }) }))).status).toBe(404);
    expect((await menuPost(req("/api/menus", a.token, { method: "POST", body: JSON.stringify({ name: "x", template: "bold", content: { ...content, photoMediaId: webp } }) }))).status).toBe(400);

    // Two menus: one branded, one opted out. Apply re-renders only the branded one.
    const m1 = await (await menuPost(req("/api/menus", a.token, { method: "POST", body: JSON.stringify({ name: "Lunch", template: "bold", content }) }))).json();
    const m2 = await (await menuPost(req("/api/menus", a.token, { method: "POST", body: JSON.stringify({ name: "Plain", template: "classic", content: { ...sampleMenu(), useBrand: false } }) }))).json();
    const stored = (await admin.from("menus").select("content").eq("id", m1.id).single()).data!.content;
    expect(stored).toMatchObject({ photoMediaId: logo, useBrand: true });

    const applied = await (await applyPost(req("/api/brand/apply", a.token, { method: "POST", body: "{}" }))).json();
    expect(applied).toMatchObject({ updated: 1, skipped: 1, failed: 0, next: null });
    const after = (await admin.from("menus").select("id, media_id").eq("account_id", a.accountId)).data!;
    expect(after.find((m) => m.id === m1.id)!.media_id).not.toBe(m1.mediaId);
    expect(after.find((m) => m.id === m2.id)!.media_id).toBe(m2.mediaId);
    // The old menu image was removed; the logo and photo stay.
    const ids = (await admin.from("media").select("id").eq("account_id", a.accountId)).data!.map((m) => m.id);
    expect(ids).not.toContain(m1.mediaId);
    expect(ids).toEqual(expect.arrayContaining([logo, webp]));

    // B's apply touches nothing of A's.
    expect(await (await applyPost(req("/api/brand/apply", b.token, { method: "POST", body: "{}" }))).json()).toMatchObject({ updated: 0 });

    // Patch with a foreign photo is refused.
    expect((await menuPatch(req(`/api/menus/${m1.id}`, a.token, { method: "PATCH", body: JSON.stringify({ content: { ...content, photoMediaId: bLogo } }) }), ctx(m1.id))).status).toBe(404);

    // Deleting the logo media clears it from the brand.
    await admin.from("media").delete().eq("id", logo);
    expect(await (await brandGet(req("/api/brand", a.token))).json()).toMatchObject({ logoMediaId: null, custom: true });
  });
});
