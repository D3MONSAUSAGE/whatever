import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { GET as overview } from "@/app/api/overview/route";
import { GET as listDisplays } from "@/app/api/displays/route";
import { GET as oneDisplay } from "@/app/api/displays/[id]/route";
import { POST as createPair } from "@/app/api/player/pair/route";
import { POST as pairStatus } from "@/app/api/player/pair/status/route";
import { POST as claimPair } from "@/app/api/displays/pair/route";
import { DELETE as deleteMenu } from "@/app/api/menus/[id]/route";
import { setTestDb } from "@/lib/server/supabase";
import { createFakeDb, type Store } from "./fake-db";

// Parity Phase 1 (t353u): /api/overview counts, /api/displays reportedState for screens with no TV,
// and menu delete cleanup (0031). Fixture data only (public repo).
type Fake = ReturnType<typeof createFakeDb>;
let fake: Fake;
let store: Store;

beforeEach(() => {
  fake = createFakeDb();
  store = fake.store;
  setTestDb(fake.client);
  fake.addUser("token-a", "11111111-1111-4111-8111-111111111111", "cafe@example.com");
  fake.addUser("token-b", "22222222-2222-4222-8222-222222222222", "other@example.com");
});

afterAll(() => setTestDb(null));

function auth(token: string, init: RequestInit = {}): RequestInit {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return { ...init, headers };
}

type Handler = (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
async function call(handler: Handler, url: string, init?: RequestInit, id = "missing") {
  const res = await handler(new Request(url, init), { params: Promise.resolve({ id }) });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, body: (await res.json().catch(() => null)) as any };
}

/** Claims a code; collect=true lets the TV collect its token (connected). */
async function screen(name: string, collect: boolean) {
  const created = await call(createPair, "http://localhost/api/player/pair", { method: "POST", body: "{}" });
  const { sessionId, code, secret } = created.body as { sessionId: string; code: string; secret: string };
  const claimed = await call(claimPair, "http://localhost/api/displays/pair", auth("token-a", { method: "POST", body: JSON.stringify({ code, name }) }));
  if (collect) await call(pairStatus, "http://localhost/api/player/pair/status", { method: "POST", body: JSON.stringify({ sessionId, secret }) });
  const row = store.displays.find((d) => d.id === claimed.body.id)!;
  return row;
}

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

describe("GET /api/overview screen counts", () => {
  it("counts paired online, paired offline, stale heartbeat, never-seen and unpaired screens", async () => {
    const online = await screen("Online", true);
    const offline = await screen("Offline", true);
    const stale = await screen("Stale", true);
    const neverSeen = await screen("Never seen", true);
    const waiting = await screen("Waiting", false);
    const unpaired = await screen("Unpaired for reconnect", true);
    online.last_seen_at = ago(5_000);
    offline.last_seen_at = ago(60 * 60_000);
    stale.last_seen_at = ago(91_000); // just past ONLINE_MS (90 s)
    neverSeen.last_seen_at = null;
    waiting.last_seen_at = null;
    // Unpaired a moment ago: the old TV's heartbeat is still fresh, but no TV holds the token.
    unpaired.token_hash = null;
    unpaired.last_seen_at = ago(2_000);
    expect(online.token_hash).toBeTruthy();

    const res = await call(overview, "http://localhost/api/overview", auth("token-a"));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ screens: 6, online: 1, offline: 3, waiting: 2, media: 0, playlists: 0, activeSchedules: 0 });
    expect(res.body.online + res.body.offline + res.body.waiting).toBe(res.body.screens);
    for (const key of Object.keys(res.body)) expect(typeof res.body[key]).toBe("number");
  });

  it("an account whose only screen is waiting reads 1 screen, 0 online, 0 offline, 1 waiting", async () => {
    const waiting = await screen("Waiting", false);
    waiting.last_seen_at = ago(1_000);
    const res = await call(overview, "http://localhost/api/overview", auth("token-a"));
    expect(res.body).toMatchObject({ screens: 1, online: 0, offline: 0, waiting: 1 });
    const other = await call(overview, "http://localhost/api/overview", auth("token-b"));
    expect(other.body).toMatchObject({ screens: 0, online: 0, offline: 0, waiting: 0 });
  });
});

describe("GET /api/displays reportedState with no TV connected", () => {
  it("reports pending (never playing) for unpaired screens and leaves connected screens alone", async () => {
    const live = await screen("Live", true);
    const gone = await screen("Unpaired", true);
    const fresh = await screen("Never paired", false);
    for (const row of [live, gone]) {
      // Both TVs had confirmed the current version: the old report was "playing".
      Object.assign(row, { content_version: 3, confirmed_version: 3, confirmed_at: ago(30_000), acknowledged_version: 3, acknowledged_at: ago(31_000), last_seen_at: ago(4_000) });
      row.assigned_media_id = null;
    }
    gone.token_hash = null;

    const list = await call(listDisplays, "http://localhost/api/displays", auth("token-a"));
    const byName = new Map((list.body as { name: string }[]).map((row) => [row.name, row as Record<string, unknown>]));
    expect(byName.get("Live")).toMatchObject({ connected: true, reportedState: "playing" });
    expect(byName.get("Unpaired")).toMatchObject({ connected: false, reportedState: "pending", acknowledgedAt: null, playingAt: null, contentVersion: 3 });
    expect(byName.get("Never paired")).toMatchObject({ connected: false, reportedState: "pending", acknowledgedAt: null, playingAt: null });
    // The one-screen route is the same object.
    const one = await call(oneDisplay, `http://localhost/api/displays/${gone.id}`, auth("token-a"), String(gone.id));
    expect(one.body).toEqual(byName.get("Unpaired"));
    expect(fresh.token_hash).toBeNull();
  });
});

describe("DELETE /api/menus/{id} cleanup (0031)", () => {
  async function accountId() {
    await call(overview, "http://localhost/api/overview", auth("token-a"));
    return String(store.accounts.find((a) => a.owner_user_id === "11111111-1111-4111-8111-111111111111")!.id);
  }

  function seedMenu(account: string, name = "Lunch") {
    const mediaId = crypto.randomUUID();
    const playlistId = crypto.randomUUID();
    const menuId = crypto.randomUUID();
    const path = `${account}/${mediaId}.png`;
    store.media.push({ id: mediaId, account_id: account, file_name: `${name} (menu).png`, storage_path: path, mime_type: "image/png", kind: "image" });
    store.objects.set(path, new Uint8Array([1, 2, 3]));
    store.playlists.push({ id: playlistId, account_id: account, name, revision: 1, published_at: ago(0) });
    for (const kind of ["draft", "published"]) {
      store.playlist_items.push({ id: crypto.randomUUID(), playlist_id: playlistId, account_id: account, media_id: mediaId, kind, position: 0, duration_ms: 30000 });
    }
    store.menus.push({ id: menuId, account_id: account, name, template: "classic", content: { sections: [] }, media_id: mediaId, playlist_id: playlistId });
    return { mediaId, playlistId, menuId, path };
  }

  const del = (menuId: string, token = "token-a") =>
    call(deleteMenu, `http://localhost/api/menus/${menuId}`, auth(token, { method: "DELETE" }), menuId);

  it("removes an unused menu's playlist, image and stored file", async () => {
    const account = await accountId();
    const m = seedMenu(account);
    const res = await del(m.menuId);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, playlistDeleted: true, imageDeleted: true });
    expect(store.menus).toHaveLength(0);
    expect(store.playlists.find((p) => p.id === m.playlistId)).toBeUndefined();
    expect(store.playlist_items.filter((i) => i.playlist_id === m.playlistId)).toHaveLength(0);
    expect(store.media.find((x) => x.id === m.mediaId)).toBeUndefined();
    expect(store.objects.has(m.path)).toBe(false);
  });

  it("keeps the playlist and image when a screen shows the board (no screen goes blank)", async () => {
    const account = await accountId();
    const m = seedMenu(account);
    const tv = await screen("Counter", true);
    tv.assigned_playlist_id = m.playlistId;
    const before = tv.content_version;
    const res = await del(m.menuId);
    expect(res.body).toEqual({ ok: true, playlistDeleted: false, imageDeleted: false });
    expect(store.menus).toHaveLength(0);
    expect(tv.assigned_playlist_id).toBe(m.playlistId);
    expect(tv.content_version).toBe(before);
    expect(store.media.some((x) => x.id === m.mediaId)).toBe(true);
    expect(store.objects.has(m.path)).toBe(true);
  });

  it("keeps the playlist when a schedule uses it, and keeps the image when another playlist or screen uses it", async () => {
    const account = await accountId();
    const scheduled = seedMenu(account, "Scheduled");
    store.schedules.push({ id: crypto.randomUUID(), account_id: account, playlist_id: scheduled.playlistId, name: "Lunch rule", enabled: true });
    expect((await del(scheduled.menuId)).body).toMatchObject({ playlistDeleted: false, imageDeleted: false });
    expect(store.schedules).toHaveLength(1);

    const shared = seedMenu(account, "Shared image");
    const otherPlaylist = crypto.randomUUID();
    store.playlists.push({ id: otherPlaylist, account_id: account, name: "Mix", revision: 1 });
    store.playlist_items.push({ id: crypto.randomUUID(), playlist_id: otherPlaylist, account_id: account, media_id: shared.mediaId, kind: "published", position: 0 });
    expect((await del(shared.menuId)).body).toMatchObject({ playlistDeleted: true, imageDeleted: false });
    expect(store.media.some((x) => x.id === shared.mediaId)).toBe(true);

    const direct = seedMenu(account, "Direct image");
    const tv = await screen("Counter", true);
    tv.assigned_media_id = direct.mediaId;
    expect((await del(direct.menuId)).body).toMatchObject({ playlistDeleted: true, imageDeleted: false });
    expect(tv.assigned_media_id).toBe(direct.mediaId);
  });

  it("keeps a playlist the owner added other slides to (ambiguous ownership)", async () => {
    const account = await accountId();
    const m = seedMenu(account);
    const extra = crypto.randomUUID();
    store.media.push({ id: extra, account_id: account, file_name: "photo.png", storage_path: `${account}/${extra}.png`, mime_type: "image/png" });
    store.playlist_items.push({ id: crypto.randomUUID(), playlist_id: m.playlistId, account_id: account, media_id: extra, kind: "draft", position: 1 });
    expect((await del(m.menuId)).body).toMatchObject({ playlistDeleted: false, imageDeleted: false });
    expect(store.playlists.some((p) => p.id === m.playlistId)).toBe(true);
    expect(store.media.some((x) => x.id === m.mediaId)).toBe(true);
  });

  it("is account-scoped and 404s for another account", async () => {
    const account = await accountId();
    const m = seedMenu(account);
    const res = await del(m.menuId, "token-b");
    expect(res.status).toBe(404);
    expect(store.menus).toHaveLength(1);
    expect(store.playlists.some((p) => p.id === m.playlistId)).toBe(true);
  });

  it("falls back to the menu row only when 0031 isn't applied", async () => {
    const account = await accountId();
    const m = seedMenu(account);
    const rpc = fake.client.rpc.bind(fake.client);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (fake.client as any).rpc = async (name: string, args: Record<string, unknown>) =>
      name === "menu_delete_cleanup"
        ? { data: null, error: { code: "PGRST202", message: "Could not find the function public.menu_delete_cleanup" } }
        : rpc(name, args);
    const res = await del(m.menuId);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(store.menus).toHaveLength(0);
    expect(store.playlists.some((p) => p.id === m.playlistId)).toBe(true);
    expect(store.media.some((x) => x.id === m.mediaId)).toBe(true);
  });
});
