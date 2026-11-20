import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as me } from "@/app/api/me/route";
import { POST as studioPost } from "@/app/api/layout-studio/route";
import { POST as assignBoard } from "@/app/api/layout-studio/assign/route";
import { POST as menusPost } from "@/app/api/menus/route";
import { PATCH as menuPatch } from "@/app/api/menus/[id]/route";
import { POST as displaysPublish } from "@/app/api/displays/publish/route";
import { accountSaveBody } from "@/lib/layout-account";
import { sampleLayout } from "@/lib/layout-studio";
import { sampleMenu } from "@/lib/menu-templates";
import { setTestDb } from "@/lib/server/supabase";
import { createFakeDb, type Store } from "./fake-db";

/**
 * Gother P0: putting a menu board on another TV must never take it off the TVs already showing it.
 * publish_playlist clears every screen it isn't given, so menu callers must pass the screens already on the board.
 */
const previousFlag = process.env.LAYOUT_STUDIO;
const A = "11111111-1111-4111-8111-111111111111";
let store: Store;
let account = "";
const screen = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const OTHER_PLAYLIST = "30000000-0000-4000-8000-000000000001";

function req(url: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", "Bearer token-a");
  if (init.body) headers.set("Content-Type", "application/json");
  return new Request(`http://localhost${url}`, { ...init, headers });
}
const patch = (id: string, body: unknown) => menuPatch(req(`/api/menus/${id}`, { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });
const onPlaylist = (playlistId: string) => store.displays.filter((d) => d.assigned_playlist_id === playlistId).map((d) => String(d.id)).sort();

beforeEach(async () => {
  const fake = createFakeDb();
  store = fake.store;
  setTestDb(fake.client);
  process.env.LAYOUT_STUDIO = "1";
  fake.addUser("token-a", A, "cafe@example.com");
  expect((await me(req("/api/me"))).status).toBe(200);
  account = String(store.accounts.find((row) => row.owner_user_id === A)!.id);
  // Five screens; screen 5 shows an unrelated playlist and must never move.
  for (let n = 1; n <= 5; n++) {
    store.displays.push({ id: screen(n), account_id: account, name: `TV ${n}`, content_version: 1, assigned_playlist_id: null, status: "active" });
  }
  store.playlists.push({ id: OTHER_PLAYLIST, account_id: account, name: "Breakfast", revision: 1, updated_at: new Date().toISOString() });
  store.displays.find((d) => d.id === screen(5))!.assigned_playlist_id = OTHER_PLAYLIST;
});
afterEach(() => {
  setTestDb(null);
  if (previousFlag === undefined) delete process.env.LAYOUT_STUDIO;
  else process.env.LAYOUT_STUDIO = previousFlag;
});

async function classicBoardOn(ids: string[]) {
  const res = await menusPost(req("/api/menus", { method: "POST", body: JSON.stringify({ name: "Lunch", template: "fresh", content: sampleMenu(), displayIds: ids }) }));
  expect(res.status).toBe(201);
  const body = await res.json() as { id: string; playlistId: string; published: boolean };
  expect(body.published).toBe(true);
  return body;
}

describe("classic boards: PATCH /api/menus/:id with displayIds adds screens", () => {
  it("editing and ticking one more TV keeps the TVs already showing the board", async () => {
    const board = await classicBoardOn([screen(1), screen(2)]);
    expect(onPlaylist(board.playlistId)).toEqual([screen(1), screen(2)]);
    // The classic editor sends only the newly ticked screen with the edited content.
    const res = await patch(board.id, { content: { ...sampleMenu(), title: "Lunch (new prices)" }, displayIds: [screen(3)] });
    expect(res.status).toBe(200);
    expect((await res.json() as { published: boolean }).published).toBe(true);
    expect(onPlaylist(board.playlistId)).toEqual([screen(1), screen(2), screen(3)]);
    expect(store.displays.find((d) => d.id === screen(5))!.assigned_playlist_id).toBe(OTHER_PLAYLIST);
  });

  it("assigning without content (the app's Show on screens) also keeps existing screens", async () => {
    const board = await classicBoardOn([screen(1)]);
    expect((await patch(board.id, { displayIds: [screen(2)] })).status).toBe(200);
    expect((await patch(board.id, { displayIds: [screen(3), screen(4)] })).status).toBe(200);
    expect(onPlaylist(board.playlistId)).toEqual([screen(1), screen(2), screen(3), screen(4)]);
  });

  it("re-sending a screen that already shows the board changes nothing else", async () => {
    const board = await classicBoardOn([screen(1), screen(2)]);
    expect((await patch(board.id, { displayIds: [screen(1)] })).status).toBe(200);
    expect(onPlaylist(board.playlistId)).toEqual([screen(1), screen(2)]);
  });

  it("replace: true is the explicit way to show the board on exactly these screens", async () => {
    const board = await classicBoardOn([screen(1), screen(2)]);
    expect((await patch(board.id, { displayIds: [screen(3)], replace: true })).status).toBe(200);
    expect(onPlaylist(board.playlistId)).toEqual([screen(3)]);
    expect(store.displays.find((d) => d.id === screen(5))!.assigned_playlist_id).toBe(OTHER_PLAYLIST);
  });

  it("refuses more than 50 screens before saving anything", async () => {
    const board = await classicBoardOn([screen(1)]);
    for (let n = 6; n <= 56; n++) store.displays.push({ id: screen(n), account_id: account, name: `TV ${n}`, content_version: 1, assigned_playlist_id: board.playlistId, status: "active" });
    const before = JSON.stringify(store.menus.find((m) => m.id === board.id)!.content);
    const res = await patch(board.id, { content: { ...sampleMenu(), title: "Changed" }, displayIds: [screen(2)] });
    expect(res.status).toBe(400);
    expect(JSON.stringify(store.menus.find((m) => m.id === board.id)!.content)).toBe(before);
    expect(onPlaylist(board.playlistId)).toContain(screen(1));
  });
});

describe("web-designer boards: rename/assign through PATCH keeps existing screens", () => {
  it("a layout board on TV 1 assigned to TV 2 through PATCH stays on TV 1", async () => {
    const saved = await studioPost(req("/api/layout-studio", { method: "POST", body: JSON.stringify(accountSaveBody({ mode: "publish", menuId: null, name: "Dinner", document: sampleLayout("two-column") })) }));
    expect(saved.status).toBe(200);
    const { menuId } = await saved.json() as { menuId: string };
    expect((await assignBoard(req("/api/layout-studio/assign", { method: "POST", body: JSON.stringify({ menuId, displayId: screen(1) }) }))).status).toBe(200);
    const playlistId = String(store.menus.find((m) => m.id === menuId)!.playlist_id);
    expect(onPlaylist(playlistId)).toEqual([screen(1)]);
    const res = await patch(menuId, { name: "Dinner menu", displayIds: [screen(2)] });
    expect(res.status).toBe(200);
    expect(onPlaylist(playlistId)).toEqual([screen(1), screen(2)]);
  });
});

describe("web: Show on screens for classic boards", () => {
  it("uses the publish route that keeps existing screens", async () => {
    const src = readFileSync("components/menu-boards.tsx", "utf8");
    expect(src).not.toMatch(/api\/playlists\/\$\{pickClassic\.playlistId\}\/publish/);
    expect(src).toContain('api("/api/displays/publish", { method: "POST", body: JSON.stringify({ playlistId: pickClassic.playlistId, displayIds, commit: true, replace: false }) })');
    // And that route really keeps them.
    const board = await classicBoardOn([screen(1), screen(2)]);
    const res = await displaysPublish(req("/api/displays/publish", { method: "POST", body: JSON.stringify({ playlistId: board.playlistId, displayIds: [screen(3)], commit: true, replace: false }) }));
    expect(res.status).toBe(200);
    expect(onPlaylist(board.playlistId)).toEqual([screen(1), screen(2), screen(3)]);
  });
});
