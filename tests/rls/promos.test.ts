import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";
import { removeCreatedTestUsers } from "../helpers/account-cleanup";
import { POST as menuPost } from "@/app/api/menus/route";
import { DELETE as menuDelete } from "@/app/api/menus/[id]/route";
import { GET as listGet, POST as promoPost } from "@/app/api/promos/route";
import { DELETE as promoDelete, PATCH as promoPatch } from "@/app/api/promos/[id]/route";
import { DELETE as detach, POST as attach } from "@/app/api/promos/[id]/menu/route";
import { POST as previewPost } from "@/app/api/promos/preview/route";
import { POST as applyPost } from "@/app/api/brand/apply/route";
import { sampleMenu } from "@/lib/menu-templates";
import { readPlaybackSchedule } from "@/lib/server/playback";
import { setScheduleClock } from "@/lib/server/schedule";
import { GET as schedulesGet, POST as schedulePost } from "@/app/api/schedules/route";
import { GET as displaysGet } from "@/app/api/displays/route";
import { samplePromo } from "@/lib/promo-templates";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const service = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const configured = /^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url) && anon.length > 20 && service.length > 20 && process.env.PANTALLA_PROMOS_MIGRATION !== "absent";

/** M12 (0009_promos.sql) through the real handlers against the local database. */
describe.skipIf(!configured)("promo slides", () => {
  const admin: SupabaseClient = createClient(url || "http://127.0.0.1:54321", service || "unset", { auth: { persistSession: false, autoRefreshToken: false } });
  const created: string[] = [];
  afterAll(() => removeCreatedTestUsers(admin, created));

  async function owner() {
    const email = `pantalla-rls-${randomUUID()}@mailinator.com`;
    const password = `${randomUUID()}Aa1!`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw new Error(error?.message);
    created.push(data.user.id);
    const { data: accountId } = await admin.rpc("ensure_account", { p_user_id: data.user.id, p_name: "Promo Cafe" });
    const c = createClient(url, anon, { auth: { persistSession: false } });
    const s = await c.auth.signInWithPassword({ email, password });
    return { accountId: accountId as string, token: s.data.session!.access_token, client: c };
  }
  const req = (path: string, token: string, init: RequestInit = {}) => {
    const h = new Headers(init.headers); h.set("Authorization", `Bearer ${token}`); h.set("content-type", "application/json");
    return new Request(`http://localhost${path}`, { ...init, headers: h });
  };
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
  const published = async (playlistId: string) =>
    ((await admin.from("playlist_items").select("media_id, position").eq("playlist_id", playlistId).eq("kind", "published").order("position")).data ?? []).map((r) => r.media_id);
  const post = (path: string, token: string, body: unknown) => req(path, token, { method: "POST", body: JSON.stringify(body) });

  it("creates promos, adds them to a menu (always on or dated), keeps them current, and takes them off", async () => {
    const a = await owner();
    const b = await owner();
    const { data: tv } = await admin.from("displays").insert({ account_id: a.accountId, name: "Counter", token_hash: `h-${randomUUID()}` }).select("id").single();
    const menu = await (await menuPost(post("/api/menus", a.token, { name: "Lunch", template: "classic", content: sampleMenu(), displayIds: [tv!.id] }))).json();
    const bMenu = await (await menuPost(post("/api/menus", b.token, { name: "B menu", template: "classic", content: sampleMenu() }))).json();

    // Preview and validation.
    const pv = await previewPost(post("/api/promos/preview", a.token, { template: "happy", content: samplePromo("happy") }));
    expect(pv.status).toBe(200);
    expect(pv.headers.get("content-type")).toBe("image/png");
    expect((await promoPost(post("/api/promos", a.token, { name: "x", template: "neon", content: samplePromo() }))).status).toBe(400);
    expect((await promoPost(post("/api/promos", a.token, { name: "x", template: "deal", content: { ...samplePromo(), headline: "" } }))).status).toBe(400);
    expect((await promoPost(post("/api/promos", a.token, { name: "x", template: "deal", content: samplePromo(), startsOn: "2026-12-10", endsOn: "2026-12-01" }))).status).toBe(400);
    expect((await promoPost(post("/api/promos", a.token, { name: "x", template: "deal", content: { ...samplePromo(), photoMediaId: bMenu.mediaId } }))).status).toBe(404);

    // Always-on promo: one tap adds the slide to the menu's playlist and bumps the screen.
    const always = await (await promoPost(post("/api/promos", a.token, { name: "Happy hour", template: "happy", content: samplePromo("happy") }))).json();
    expect(always.mediaId).toBeTruthy();
    const before = (await admin.from("displays").select("content_version").eq("id", tv!.id).single()).data!.content_version;
    expect((await attach(post(`/api/promos/${always.id}/menu`, b.token, { menuId: bMenu.id }), ctx(always.id))).status).toBe(404);
    expect((await attach(post(`/api/promos/${always.id}/menu`, a.token, { menuId: bMenu.id }), ctx(always.id))).status).toBe(404);
    const added = await attach(post(`/api/promos/${always.id}/menu`, a.token, { menuId: menu.id }), ctx(always.id));
    expect(await added.json()).toEqual({ mode: "added", screens: 1 });
    expect(await published(menu.playlistId)).toEqual([menu.mediaId, always.mediaId]);
    expect((await admin.from("displays").select("content_version").eq("id", tv!.id).single()).data!.content_version).toBeGreaterThan(before);

    // Editing swaps the slide in the menu playlist.
    const ed = await (await promoPatch(req(`/api/promos/${always.id}`, a.token, { method: "PATCH", body: JSON.stringify({ content: { ...samplePromo("happy"), price: "$3" } }) }), ctx(always.id))).json();
    expect(await published(menu.playlistId)).toEqual([menu.mediaId, ed.mediaId]);
    // Dates can't be set while it's always on.
    expect((await promoPatch(req(`/api/promos/${always.id}`, a.token, { method: "PATCH", body: JSON.stringify({ endsOn: "2026-12-31" }) }), ctx(always.id))).status).toBe(400);

    // Take it off: the menu keeps playing alone.
    expect((await detach(req(`/api/promos/${always.id}/menu`, a.token, { method: "DELETE" }), ctx(always.id))).status).toBe(200);
    expect(await published(menu.playlistId)).toEqual([menu.mediaId]);

    // Dated promo: a "menu + promo" playlist plus date-limited rules on the menu's screens.
    const dated = await (await promoPost(post("/api/promos", a.token, { name: "Holiday deal", template: "deal", content: samplePromo("deal"), startsOn: "2026-12-01", endsOn: "2026-12-24" }))).json();
    const sch = await (await attach(post(`/api/promos/${dated.id}/menu`, a.token, { menuId: menu.id }), ctx(dated.id))).json();
    expect(sch).toEqual({ mode: "scheduled", screens: 1 });
    const row = (await admin.from("promos").select("placement, combo_playlist_id").eq("id", dated.id).single()).data!;
    expect(row.placement).toBe("scheduled");
    expect(await published(row.combo_playlist_id)).toEqual([menu.mediaId, dated.mediaId]);
    expect(await published(menu.playlistId)).toEqual([menu.mediaId]);
    let rules = (await admin.from("schedules").select("display_id, starts_on, ends_on, priority, start_minute, end_minute, weekdays").eq("playlist_id", row.combo_playlist_id)).data!;
    expect(rules).toEqual([{ display_id: tv!.id, starts_on: "2026-12-01", ends_on: "2026-12-24", priority: 5, start_minute: 0, end_minute: 1440, weekdays: [1, 2, 3, 4, 5, 6, 7] }]);

    // M14: promo-managed rules are marked in GET /api/schedules and on screens; others are null.
    await schedulePost(post("/api/schedules", a.token, { name: "Manual", playlistId: menu.playlistId, displayId: tv!.id, weekdays: [1], startTime: "09:00", endTime: "10:00" }));
    const scheds = await (await schedulesGet(req("/api/schedules", a.token))).json();
    expect(scheds).toHaveLength(2);
    for (const s of scheds) {
      if (s.playlistId === row.combo_playlist_id) expect([s.managedBy, s.promoId]).toEqual(["promo", dated.id]);
      else expect([s.managedBy, s.promoId]).toEqual([null, null]);
    }
    expect((await (await schedulesGet(req("/api/schedules", b.token))).json())).toEqual([]);
    setScheduleClock(() => new Date("2026-12-10T18:00:00Z"));
    try {
      const screens = await (await displaysGet(req("/api/displays", a.token))).json();
      const cur = screens.find((d: { id: string }) => d.id === tv!.id).currentSchedule;
      expect([cur.managedBy, cur.promoId]).toEqual(["promo", dated.id]);
    } finally { setScheduleClock(null); }
    await admin.from("schedules").delete().eq("account_id", a.accountId).eq("name", "Manual");

    // The player gets the "menu + promo" playlist only between the dates (noon UTC is the same date in any US zone).
    const playing = async (iso: string) => {
      setScheduleClock(() => new Date(iso));
      try {
        const p = await readPlaybackSchedule(tv!.id, 1);
        return p.kind === "on" ? p.overridePlaylistId : null;
      } finally {
        setScheduleClock(null);
      }
    };
    expect(await playing("2026-11-30T18:00:00Z")).toBeNull();
    expect(await playing("2026-12-10T18:00:00Z")).toBe(row.combo_playlist_id);
    expect(await playing("2026-12-26T18:00:00Z")).toBeNull();

    // Moving the dates moves the rules; menu edits reach the combo playlist too.
    await promoPatch(req(`/api/promos/${dated.id}`, a.token, { method: "PATCH", body: JSON.stringify({ endsOn: "2026-12-31" }) }), ctx(dated.id));
    rules = (await admin.from("schedules").select("display_id, starts_on, ends_on, priority, start_minute, end_minute, weekdays").eq("playlist_id", row.combo_playlist_id)).data!;
    expect(rules[0].ends_on).toBe("2026-12-31");
    expect((await promoPatch(req(`/api/promos/${dated.id}`, a.token, { method: "PATCH", body: JSON.stringify({ startsOn: null, endsOn: null }) }), ctx(dated.id))).status).toBe(400);

    const list = await (await listGet(req("/api/promos", a.token))).json();
    expect(list.available).toBe(true);
    expect(list.promos.map((p: { placement: string }) => p.placement).sort()).toEqual(["none", "scheduled"]);
    expect((await (await listGet(req("/api/promos", b.token))).json()).promos).toHaveLength(0);
    expect((await a.client.from("promos").select("*")).data ?? []).toHaveLength(0);

    // "Apply brand" re-renders promos too, and the new image reaches the dated playlist.
    const applied = await (await applyPost(post("/api/brand/apply", a.token, { kind: "promos" }))).json();
    expect(applied).toMatchObject({ updated: 2, failed: 0, next: null });
    const newMedia = (await admin.from("promos").select("media_id").eq("id", dated.id).single()).data!.media_id;
    expect(newMedia).not.toBe(dated.mediaId);
    expect(await published(row.combo_playlist_id)).toEqual([menu.mediaId, newMedia]);
    dated.mediaId = newMedia;

    // Deleting the promo removes the rules and the combo playlist; the image stays in media.
    expect((await promoDelete(req(`/api/promos/${dated.id}`, a.token, { method: "DELETE" }), ctx(dated.id))).status).toBe(200);
    expect((await admin.from("schedules").select("id").eq("account_id", a.accountId)).data).toHaveLength(0);
    expect((await admin.from("playlists").select("id").eq("id", row.combo_playlist_id)).data).toHaveLength(0);
    expect((await admin.from("media").select("id").eq("id", dated.mediaId)).data).toHaveLength(1);
    expect((await admin.from("displays").select("assigned_playlist_id").eq("id", tv!.id).single()).data!.assigned_playlist_id).toBe(menu.playlistId);

    // M13: a dated promo can be added before any screen shows the menu, then follows the menu.
    const lone = await (await menuPost(post("/api/menus", a.token, { name: "Unused", template: "fresh", content: sampleMenu() }))).json();
    const d2 = await (await promoPost(post("/api/promos", a.token, { name: "Soon", template: "special", content: samplePromo("special"), startsOn: "2027-01-01" }))).json();
    expect(await (await attach(post(`/api/promos/${d2.id}/menu`, a.token, { menuId: lone.id }), ctx(d2.id))).json()).toEqual({ mode: "scheduled", screens: 0 });
    const combo2 = (await admin.from("promos").select("combo_playlist_id").eq("id", d2.id).single()).data!.combo_playlist_id;
    const rulesFor = async () => ((await admin.from("schedules").select("display_id, starts_on, ends_on, priority").eq("playlist_id", combo2)).data ?? []);
    expect(await rulesFor()).toEqual([]);
    const screensOf = async () => ((await (await listGet(req("/api/promos", a.token))).json()).promos.find((p: { id: string }) => p.id === d2.id).screens);
    expect(await screensOf()).toEqual([]);

    // Switching the screen to the menu brings the promo rule; switching away removes it.
    await admin.from("displays").update({ assigned_playlist_id: lone.playlistId }).eq("id", tv!.id);
    expect(await rulesFor()).toEqual([{ display_id: tv!.id, starts_on: "2027-01-01", ends_on: null, priority: 5 }]);
    expect(await screensOf()).toEqual([{ id: tv!.id, name: "Counter" }]);
    // A new screen created already showing the menu gets it too; unrelated schedules are untouched.
    const { data: tv2 } = await admin.from("displays").insert({ account_id: a.accountId, name: "Patio", token_hash: `h-${randomUUID()}`, assigned_playlist_id: lone.playlistId }).select("id").single();
    const other = await admin.from("schedules").insert({ account_id: a.accountId, name: "Mine", playlist_id: menu.playlistId, display_id: tv!.id, weekdays: [1], start_minute: 0, end_minute: 60, priority: 0 }).select("id").single();
    expect((await rulesFor()).length).toBe(2);
    await admin.from("displays").update({ assigned_playlist_id: menu.playlistId }).eq("id", tv!.id);
    expect((await rulesFor()).map((r) => r.display_id)).toEqual([tv2!.id]);
    expect((await admin.from("schedules").select("id").eq("id", other.data!.id)).data).toHaveLength(1);
    // Date changes still apply to every screen it follows.
    await promoPatch(req(`/api/promos/${d2.id}`, a.token, { method: "PATCH", body: JSON.stringify({ startsOn: "2027-01-01", endsOn: "2027-01-31" }) }), ctx(d2.id));
    expect((await rulesFor())[0].ends_on).toBe("2027-01-31");
    // Another account's screens never pick it up.
    await admin.from("displays").insert({ account_id: b.accountId, name: "B tv", token_hash: `h-${randomUUID()}`, assigned_playlist_id: lone.playlistId }).then(() => null, () => null);
    expect((await rulesFor()).length).toBe(1);

    // Deleting the menu takes its promos off first: no leftover rules or "menu + promo" playlist.
    expect((await menuDelete(req(`/api/menus/${lone.id}`, a.token, { method: "DELETE" }), ctx(lone.id))).status).toBe(200);
    expect(await rulesFor()).toEqual([]);
    expect((await admin.from("promos").select("placement").eq("id", d2.id).single()).data!.placement).toBe("none");
  });
});
