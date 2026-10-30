import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";
import { removeCreatedTestUsers } from "../helpers/account-cleanup";
import { GET as mediaGet } from "@/app/api/media/route";
import { GET as playlistsGet } from "@/app/api/playlists/route";
import { GET as displaysGet } from "@/app/api/displays/route";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const service = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const configured = /^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url) && anon.length > 20 && service.length > 20;

const MEDIA_KEYS = ["createdAt", "durationMs", "fileName", "height", "id", "kind", "sizeBytes", "thumbnailUrl", "url", "usedIn", "width"];

/** M14: lists keep their old shape and return everything without the new params; paging/search are opt-in. */
describe.skipIf(!configured)("list paging and search", () => {
  const admin: SupabaseClient = createClient(url || "http://127.0.0.1:54321", service || "unset", { auth: { persistSession: false, autoRefreshToken: false } });
  const created: string[] = [];
  afterAll(() => removeCreatedTestUsers(admin, created));

  async function owner() {
    const email = `pantalla-rls-${randomUUID()}@mailinator.com`;
    const password = `${randomUUID()}Aa1!`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw new Error(error?.message);
    created.push(data.user.id);
    const { data: accountId } = await admin.rpc("ensure_account", { p_user_id: data.user.id, p_name: "Paging Cafe" });
    const c = createClient(url, anon, { auth: { persistSession: false } });
    const s = await c.auth.signInWithPassword({ email, password });
    return { accountId: accountId as string, token: s.data.session!.access_token };
  }
  const get = (path: string, token: string) => new Request(`http://localhost${path}`, { headers: { Authorization: `Bearer ${token}` } });

  it("returns all 1,105 files without params (past the old 1,000 cap) and pages, searches and filters when asked", async () => {
    const a = await owner();
    const b = await owner();
    const base = Date.parse("2026-01-01T00:00:00Z");
    const rows = Array.from({ length: 1105 }, (_, i) => ({
      account_id: a.accountId,
      file_name: i === 7 ? "Taco Tuesday.png" : i === 8 ? "Lunch (menu).png" : i === 9 ? "Happy hour (promo).png" : `photo-${String(i).padStart(4, "0")}.jpg`,
      storage_path: `${a.accountId}/paging-${randomUUID()}.jpg`,
      mime_type: "image/jpeg",
      size_bytes: 1000 + i,
      created_at: new Date(base + i * 1000).toISOString(),
    }));
    for (let i = 0; i < rows.length; i += 500) {
      const ins = await admin.from("media").insert(rows.slice(i, i + 500));
      expect(ins.error).toBeNull();
    }
    await admin.from("media").insert({ account_id: b.accountId, file_name: "Taco B.png", storage_path: `${b.accountId}/x-${randomUUID()}.png`, mime_type: "image/png", size_bytes: 5 });
    const taco = (await admin.from("media").select("id").eq("account_id", a.accountId).eq("file_name", "Taco Tuesday.png").single()).data!.id;
    const { data: list } = await admin.from("playlists").insert({ account_id: a.accountId, name: "Breakfast specials" }).select("id").single();
    await admin.from("playlist_items").insert({ account_id: a.accountId, playlist_id: list!.id, media_id: taco, position: 0, duration_ms: 8000, kind: "draft" });
    await admin.from("playlists").insert([{ account_id: a.accountId, name: "Dinner" }, { account_id: a.accountId, name: "Weekend brunch" }]);
    await admin.from("displays").insert([
      { account_id: a.accountId, name: "Front counter", token_hash: `h-${randomUUID()}` },
      { account_id: a.accountId, name: "Patio", token_hash: `h-${randomUUID()}` },
    ]);

    // Unchanged contract: a plain array with every row, same item shape, newest first.
    const all = await (await mediaGet(get("/api/media", a.token))).json();
    expect(Array.isArray(all)).toBe(true);
    expect(all).toHaveLength(1105);
    expect(Object.keys(all[0]).sort()).toEqual(MEDIA_KEYS);
    expect(all[0].fileName).toBe("photo-1104.jpg");
    expect(new Set(all.map((m: { id: string }) => m.id)).size).toBe(1105);
    expect(all.find((m: { id: string }) => m.id === taco).usedIn).toEqual([{ id: list!.id, name: "Breakfast specials" }]);

    // Opt-in paging.
    const p1 = await (await mediaGet(get("/api/media?limit=50", a.token))).json();
    expect(p1).toMatchObject({ total: 1105, offset: 0, limit: 50, nextOffset: 50 });
    expect(p1.items).toHaveLength(50);
    expect(Object.keys(p1.items[0]).sort()).toEqual(MEDIA_KEYS);
    expect(p1.items[0].id).toBe(all[0].id);
    const last = await (await mediaGet(get("/api/media?limit=50&offset=1100", a.token))).json();
    expect(last.items.map((m: { id: string }) => m.id)).toEqual(all.slice(1100).map((m: { id: string }) => m.id));
    expect(last.nextOffset).toBeNull();
    expect((await (await mediaGet(get("/api/media?limit=9999", a.token))).json()).limit).toBe(200);

    // Search, filters, sort.
    const q = await (await mediaGet(get("/api/media?q=TACO", a.token))).json();
    expect(q.items.map((m: { fileName: string }) => m.fileName)).toEqual(["Taco Tuesday.png"]);
    expect((await (await mediaGet(get("/api/media?kind=menu", a.token))).json()).items.map((m: { fileName: string }) => m.fileName)).toEqual(["Lunch (menu).png"]);
    expect((await (await mediaGet(get("/api/media?kind=promo", a.token))).json()).total).toBe(1);
    expect((await (await mediaGet(get("/api/media?kind=upload", a.token))).json()).total).toBe(1103);
    expect((await (await mediaGet(get("/api/media?kind=video", a.token))).json()).total).toBe(0);
    expect((await (await mediaGet(get("/api/media?unused=1&limit=1", a.token))).json()).total).toBe(1104);
    expect((await (await mediaGet(get("/api/media?sort=oldest&limit=1", a.token))).json()).items[0].fileName).toBe("photo-0000.jpg");
    expect((await (await mediaGet(get("/api/media?sort=name&limit=1", a.token))).json()).items[0].fileName).toBe("Happy hour (promo).png");
    expect((await (await mediaGet(get("/api/media?sort=size&limit=1", a.token))).json()).items[0].fileName).toBe("photo-1104.jpg");

    // Other accounts never leak in.
    const bAll = await (await mediaGet(get("/api/media?q=taco", b.token))).json();
    expect(bAll.items.map((m: { fileName: string }) => m.fileName)).toEqual(["Taco B.png"]);

    // Playlists and screens: same contract.
    const lists = await (await playlistsGet(get("/api/playlists", a.token))).json();
    expect(Array.isArray(lists)).toBe(true);
    expect(lists).toHaveLength(3);
    const lq = await (await playlistsGet(get("/api/playlists?q=brunch", a.token))).json();
    expect(lq).toMatchObject({ total: 1, nextOffset: null });
    expect(Object.keys(lq.items[0]).sort()).toEqual(Object.keys(lists[0]).sort());
    expect((await (await playlistsGet(get("/api/playlists?sort=name&limit=2", a.token))).json()).items.map((l: { name: string }) => l.name)).toEqual(["Breakfast specials", "Dinner"]);
    const screens = await (await displaysGet(get("/api/displays", a.token))).json();
    expect(Array.isArray(screens)).toBe(true);
    expect(screens).toHaveLength(2);
    const sq = await (await displaysGet(get("/api/displays?q=patio", a.token))).json();
    expect(sq).toMatchObject({ total: 1, offset: 0 });
    expect(Object.keys(sq.items[0]).sort()).toEqual(Object.keys(screens[0]).sort());
    expect((await (await displaysGet(get("/api/displays?q=patio", b.token))).json()).total).toBe(0);
  }, 60_000);
});
