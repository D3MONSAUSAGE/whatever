import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";
import { removeCreatedTestUsers } from "../helpers/account-cleanup";
import { GET as listGet, POST as menuPost } from "@/app/api/menus/route";
import { DELETE as menuDelete, GET as menuGet, PATCH as menuPatch } from "@/app/api/menus/[id]/route";
import { POST as previewPost } from "@/app/api/menus/preview/route";
import { POST as dayPartsPost } from "@/app/api/schedules/day-parts/route";
import { sampleMenu } from "@/lib/menu-templates";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const service = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const configured = /^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url) && anon.length > 20 && service.length > 20 && process.env.PANTALLA_MENUS_MIGRATION !== "absent";

/** M10 (0007_menu_boards.sql) through the real handlers against the local database. */
describe.skipIf(!configured)("menu boards and day parts", () => {
  const admin: SupabaseClient = createClient(url || "http://127.0.0.1:54321", service || "unset", { auth: { persistSession: false, autoRefreshToken: false } });
  const created: string[] = [];
  afterAll(() => removeCreatedTestUsers(admin, created));

  async function owner() {
    const email = `pantalla-rls-${randomUUID()}@mailinator.com`;
    const password = `${randomUUID()}Aa1!`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw new Error(error?.message);
    created.push(data.user.id);
    const { data: accountId } = await admin.rpc("ensure_account", { p_user_id: data.user.id, p_name: "Menu Cafe" });
    const c = createClient(url, anon, { auth: { persistSession: false } });
    const s = await c.auth.signInWithPassword({ email, password });
    return { accountId: accountId as string, token: s.data.session!.access_token, client: c };
  }
  const req = (path: string, token: string, init: RequestInit = {}) => {
    const h = new Headers(init.headers); h.set("Authorization", `Bearer ${token}`); h.set("content-type", "application/json");
    return new Request(`http://localhost${path}`, { ...init, headers: h });
  };
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

  it("creates a menu as a normal PNG + published playlist, edits swap it everywhere, and day parts create schedules", async () => {
    const a = await owner();
    const b = await owner();
    const { data: tv } = await admin.from("displays").insert({ account_id: a.accountId, name: "Counter", token_hash: `h-${randomUUID()}` }).select("id, content_version").single();

    // Preview: PNG, nothing stored.
    const pv = await previewPost(req("/api/menus/preview", a.token, { method: "POST", body: JSON.stringify({ template: "fresh", content: sampleMenu() }) }));
    expect(pv.status).toBe(200);
    expect(pv.headers.get("content-type")).toBe("image/png");
    expect((await admin.from("media").select("id").eq("account_id", a.accountId)).data).toHaveLength(0);

    // Validation.
    expect((await menuPost(req("/api/menus", a.token, { method: "POST", body: JSON.stringify({ name: "x", template: "neon", content: sampleMenu() }) }))).status).toBe(400);
    expect((await menuPost(req("/api/menus", a.token, { method: "POST", body: JSON.stringify({ name: "x", template: "bold", content: { sections: [] } }) }))).status).toBe(400);

    const res = await menuPost(req("/api/menus", a.token, { method: "POST", body: JSON.stringify({ name: "Lunch", template: "classic", content: sampleMenu(), displayIds: [tv!.id] }) }));
    expect(res.status).toBe(201);
    const made = await res.json();
    expect(made.published).toBe(true);

    const media = (await admin.from("media").select("id, mime_type, storage_path").eq("account_id", a.accountId)).data!;
    expect(media).toEqual([expect.objectContaining({ id: made.mediaId, mime_type: "image/png" })]);
    const items = (await admin.from("playlist_items").select("media_id, kind").eq("playlist_id", made.playlistId)).data!;
    expect(items.map((i) => i.kind).sort()).toEqual(["draft", "published"]);
    let display = (await admin.from("displays").select("assigned_playlist_id, content_version").eq("id", tv!.id).single()).data!;
    expect(display.assigned_playlist_id).toBe(made.playlistId);
    const versionBefore = display.content_version;
    const revBefore = (await admin.from("playlists").select("revision").eq("id", made.playlistId).single()).data!.revision;

    const list = await (await listGet(req("/api/menus", a.token))).json();
    expect(list.available).toBe(true);
    expect(list.menus).toHaveLength(1);
    expect(list.menus[0].imageUrl).toMatch(/^http/);

    // Edit: new image swapped in, old image removed, TV and playlist revision bumped.
    const content = { ...sampleMenu(), title: "New prices" };
    const ed = await menuPatch(req(`/api/menus/${made.id}`, a.token, { method: "PATCH", body: JSON.stringify({ content, template: "bold" }) }), ctx(made.id));
    expect(ed.status).toBe(200);
    const edited = await ed.json();
    expect(edited.mediaId).not.toBe(made.mediaId);
    expect(edited.playlistId).toBe(made.playlistId);
    const media2 = (await admin.from("media").select("id").eq("account_id", a.accountId)).data!;
    expect(media2.map((m) => m.id)).toEqual([edited.mediaId]);
    const items2 = (await admin.from("playlist_items").select("media_id").eq("playlist_id", made.playlistId)).data!;
    expect(items2.every((i) => i.media_id === edited.mediaId)).toBe(true);
    display = (await admin.from("displays").select("assigned_playlist_id, content_version").eq("id", tv!.id).single()).data!;
    expect(display.content_version).toBeGreaterThan(versionBefore);
    expect((await admin.from("playlists").select("revision").eq("id", made.playlistId).single()).data!.revision).toBe(revBefore + 1);
    const one = await (await menuGet(req(`/api/menus/${made.id}`, a.token), ctx(made.id))).json();
    expect(one).toMatchObject({ template: "bold", content: { title: "New prices" } });

    // Day parts: breakfast / lunch / dinner into the existing schedules table.
    const dp = await dayPartsPost(req("/api/schedules/day-parts", a.token, { method: "POST", body: JSON.stringify({
      displayId: tv!.id,
      parts: [
        { name: "Breakfast", menuId: made.id, startTime: "06:00", endTime: "11:00" },
        { name: "Lunch", playlistId: made.playlistId, startTime: "11:00", endTime: "16:00" },
        { name: "Dinner", menuId: made.id, startTime: "16:00", endTime: "22:00" },
      ],
    }) }));
    expect(dp.status).toBe(201);
    expect((await dp.json()).ids).toHaveLength(3);
    const rules = (await admin.from("schedules").select("name, start_minute, end_minute, weekdays, playlist_id").eq("account_id", a.accountId).order("start_minute")).data!;
    expect(rules.map((r) => [r.name, r.start_minute, r.end_minute])).toEqual([["Breakfast", 360, 660], ["Lunch", 660, 960], ["Dinner", 960, 1320]]);
    expect(rules[0].weekdays).toHaveLength(7);
    // Bad time rejects the whole set.
    const bad = await dayPartsPost(req("/api/schedules/day-parts", a.token, { method: "POST", body: JSON.stringify({ displayId: tv!.id, parts: [{ name: "Late", menuId: made.id, startTime: "25:00", endTime: "26:00" }] }) }));
    expect(bad.status).toBe(400);

    // Isolation: B can't see, edit, delete, or schedule A's menu.
    expect((await (await listGet(req("/api/menus", b.token))).json()).menus).toHaveLength(0);
    expect((await menuGet(req(`/api/menus/${made.id}`, b.token), ctx(made.id))).status).toBe(404);
    expect((await menuPatch(req(`/api/menus/${made.id}`, b.token, { method: "PATCH", body: JSON.stringify({ name: "x" }) }), ctx(made.id))).status).toBe(404);
    expect((await menuDelete(req(`/api/menus/${made.id}`, b.token, { method: "DELETE" }), ctx(made.id))).status).toBe(404);
    expect((await dayPartsPost(req("/api/schedules/day-parts", b.token, { method: "POST", body: JSON.stringify({ displayId: tv!.id, parts: [{ name: "x", menuId: made.id, startTime: "06:00", endTime: "07:00" }] }) }))).status).toBe(404);
    // Direct table access with a user token is blocked (server only).
    const direct = await a.client.from("menus").select("id");
    expect(direct.data ?? []).toHaveLength(0);
    const rpc = await a.client.rpc("menu_swap_media", { p_account_id: a.accountId, p_old_media_id: edited.mediaId, p_new_media_id: edited.mediaId });
    expect(rpc.error).not.toBeNull();

    // Delete keeps the image + playlist so the screen never goes blank.
    expect((await menuDelete(req(`/api/menus/${made.id}`, a.token, { method: "DELETE" }), ctx(made.id))).status).toBe(200);
    expect((await admin.from("media").select("id").eq("id", edited.mediaId)).data).toHaveLength(1);
    expect((await admin.from("displays").select("assigned_playlist_id").eq("id", tv!.id).single()).data!.assigned_playlist_id).toBe(made.playlistId);
  }, 60_000);
});
