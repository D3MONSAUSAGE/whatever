import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as me } from "@/app/api/me/route";
import { GET, POST } from "@/app/api/layout-studio/route";
import { POST as assignBoard } from "@/app/api/layout-studio/assign/route";
import { accountSaveBody, applyLibraryFile, boardAfterReload, freshBoard, readAccountStudio } from "@/lib/layout-account";
import { boxesOverlap, frameFor, mediaVideoBox, sampleLayout } from "@/lib/layout-studio";
import { attachLayoutCompositions } from "@/lib/server/layout-player";
import { setTestDb } from "@/lib/server/supabase";
import { createFakeDb, type Store } from "./fake-db";

const previousFlag = process.env.LAYOUT_STUDIO;
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

let store: Store;

beforeEach(() => {
  const fake = createFakeDb();
  store = fake.store;
  setTestDb(fake.client);
  process.env.LAYOUT_STUDIO = "1";
  fake.addUser("token-a", "11111111-1111-4111-8111-111111111111", "cafe@example.com");
  fake.addUser("token-b", "22222222-2222-4222-8222-222222222222", "other@example.com");
});

afterEach(() => {
  setTestDb(null);
  if (previousFlag === undefined) delete process.env.LAYOUT_STUDIO;
  else process.env.LAYOUT_STUDIO = previousFlag;
});

function bearer(token: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  return new Request("http://localhost/api/layout-studio", { ...init, headers });
}

async function accountId(token: string) {
  const res = await me(bearer(token));
  expect(res.status).toBe(200);
  const row = store.accounts.find((item) => item.owner_user_id === (token === "token-a"
    ? "11111111-1111-4111-8111-111111111111"
    : "22222222-2222-4222-8222-222222222222"));
  if (!row) throw new Error("missing account");
  return String(row.id);
}

describe("layout studio account route", () => {
  it("reloads a draft, publishes the playlist, and keeps another account out", async () => {
    const account = await accountId("token-a");
    const other = await accountId("token-b");
    const oldMedia = "10000000-0000-4000-8000-000000000001";
    const photo = "10000000-0000-4000-8000-000000000002";
    const video = "10000000-0000-4000-8000-000000000003";
    const foreign = "10000000-0000-4000-8000-000000000004";
    const menu = "10000000-0000-4000-8000-000000000040";
    const legacy = "10000000-0000-4000-8000-000000000041";
    const playlist = "10000000-0000-4000-8000-000000000010";
    const schedule = "10000000-0000-4000-8000-000000000011";
    store.media.push(
      { id: oldMedia, account_id: account, file_name: "old.png", storage_path: `${account}/old.png`, mime_type: "image/png", size_bytes: 8, kind: "image" },
      { id: photo, account_id: account, file_name: "patio.png", storage_path: `${account}/patio.png`, mime_type: "image/png", size_bytes: png.length, kind: "image" },
      { id: video, account_id: account, file_name: "promo.mp4", storage_path: `${account}/promo.mp4`, mime_type: "video/mp4", size_bytes: 4, kind: "video" },
      { id: foreign, account_id: other, file_name: "theirs.png", storage_path: `${other}/theirs.png`, mime_type: "image/png", size_bytes: 8, kind: "image" },
    );
    store.objects.set(`${account}/patio.png`, new Uint8Array(png));
    store.objects.set(`${account}/promo.mp4`, new Uint8Array([0, 1, 2, 3]));
    store.playlists.push(
      { id: playlist, account_id: account, name: "Menu", revision: 1, updated_at: new Date().toISOString() },
      { id: schedule, account_id: account, name: "Lunch schedule", revision: 1, updated_at: new Date().toISOString() },
    );
    store.playlist_items.push(
      { id: "10000000-0000-4000-8000-000000000020", playlist_id: playlist, account_id: account, media_id: oldMedia, kind: "published" },
      { id: "10000000-0000-4000-8000-000000000021", playlist_id: schedule, account_id: account, media_id: oldMedia, kind: "published" },
    );
    store.displays.push(
      { id: "10000000-0000-4000-8000-000000000030", account_id: account, name: "Counter", content_version: 4, assigned_playlist_id: playlist, status: "active" },
      { id: "10000000-0000-4000-8000-000000000031", account_id: account, name: "Patio", content_version: 4, assigned_playlist_id: schedule, status: "active" },
    );
    store.menus.push(
      { id: menu, account_id: account, name: "Casa Mesa", template: "fresh", content: { title: "Casa Mesa" }, media_id: oldMedia, playlist_id: playlist },
      { id: legacy, account_id: account, name: "Classic lunch", template: "classic", content: { title: "Classic lunch", sections: [{ name: "Soup", items: [{ name: "Tomato", price: "$6", description: "Cup" }] }] }, media_id: null, playlist_id: null },
      { id: "10000000-0000-4000-8000-000000000042", account_id: other, name: "Theirs", template: "fresh", content: { title: "Theirs" }, media_id: null, playlist_id: null },
    );

    const sections = [1, 2, 3, 4].map((section) => ({
      name: `Section ${section}`,
      items: Array.from({ length: 6 }, (_, index) => ({
        name: `Item ${section}-${index + 1}`,
        price: "$4",
        description: `Line ${section}-${index + 1}`,
      })),
    }));
    const draft = applyLibraryFile({
      ...sampleLayout("menu-promo-67"),
      title: "Casa Mesa Cantina",
      font: "noto-serif" as const,
      textColor: "#112233",
      backgroundColor: "#f4efe4",
      split: 0.61,
      sections,
      videoMediaId: video,
    }, { id: photo, name: "patio.png", kind: "image", mime: "image/png", url: null }, "photo");

    const stolen = await POST(bearer("token-a", {
      method: "POST",
      body: JSON.stringify(accountSaveBody({ mode: "publish", menuId: menu, name: draft.title, document: { ...draft, imageMediaId: foreign } })),
    }));
    expect(stolen.status).toBe(400);
    expect(store.displays.every((item) => item.content_version === 4)).toBe(true);
    expect(store.media.some((item) => String(item.file_name).includes("Casa"))).toBe(false);

    const foreignMenu = await POST(bearer("token-a", {
      method: "POST",
      body: JSON.stringify(accountSaveBody({ mode: "draft", menuId: "10000000-0000-4000-8000-000000000042", name: draft.title, document: draft })),
    }));
    expect(foreignMenu.status).toBe(404);

    const saved = await POST(bearer("token-a", {
      method: "POST",
      body: JSON.stringify(accountSaveBody({ mode: "draft", menuId: menu, name: draft.title, document: draft })),
    }));
    expect(saved.status).toBe(200);
    expect(store.displays.every((item) => item.content_version === 4)).toBe(true);
    expect(store.playlist_items.every((item) => item.media_id === oldMedia)).toBe(true);

    const loaded = readAccountStudio(await (await GET(bearer("token-a"))).json());
    expect(loaded).not.toBeNull();
    const board = boardAfterReload(loaded!, menu);
    expect(board?.document.title).toBe("Casa Mesa Cantina");
    expect(board?.document.font).toBe("noto-serif");
    expect(board?.document.textColor).toBe("#112233");
    expect(board?.document.backgroundColor).toBe("#f4efe4");
    expect(board?.document.imageMediaId).toBe(photo);
    expect(board?.document.videoMediaId).toBe(video);
    expect(board?.document.sections.flatMap((section) => section.items)).toHaveLength(24);
    expect(loaded!.legacy.map((item) => item.name)).toContain("Classic lunch");
    expect(loaded!.library.some((item) => item.id === photo && item.kind === "image")).toBe(true);
    expect(loaded!.library.some((item) => item.id === foreign)).toBe(false);

    const published = await POST(bearer("token-a", {
      method: "POST",
      body: JSON.stringify(accountSaveBody({ mode: "publish", menuId: menu, name: board!.document.title, document: board!.document })),
    }));
    expect(published.status).toBe(200);
    const body = await published.json() as { swapped?: boolean };
    expect(body.swapped).toBe(true);
    expect(store.displays.map((item) => item.content_version)).toEqual([5, 5]);
    const shown = store.playlist_items.map((item) => String(item.media_id));
    expect(new Set(shown).size).toBe(1);
    expect(shown[0]).not.toBe(oldMedia);
    expect(store.menus.find((item) => item.id === legacy)?.content).toMatchObject({ title: "Classic lunch" });

    const items: Parameters<typeof attachLayoutCompositions>[0] = [
      { mediaId: shown[0], url: "https://signed.test/board.png", kind: "image" },
    ];
    await attachLayoutCompositions(items);
    const box = items[0].composition?.video?.box;
    const frame = frameFor("menu-promo-67", 0.61);
    const publishedMenu = store.menus.find((item) => item.id === menu);
    expect(box).toEqual(mediaVideoBox(publishedMenu!.content as ReturnType<typeof sampleLayout>));
    expect(box?.h).toBeLessThan(frame.video!.h);
    expect(box && frame.video && boxesOverlap(frame.menu, frame.video)).toBe(false);
    expect(items[0].composition).not.toHaveProperty("groupIndex");

    delete process.env.LAYOUT_STUDIO;
    const closed = await POST(bearer("token-a", {
      method: "POST",
      body: JSON.stringify(accountSaveBody({ mode: "draft", menuId: menu, name: "Changed", document: { ...draft, title: "Changed" } })),
    }));
    expect(closed.status).toBe(404);
    expect((await GET(bearer("token-a"))).status).toBe(404);
    expect(store.menus.find((item) => item.id === menu)?.content).toMatchObject({ title: "Casa Mesa Cantina" });
  });

  it("creates a playlist when a saved draft has no playlist yet", async () => {
    const account = await accountId("token-a");
    const draftMedia = "10000000-0000-4000-8000-0000000000a1";
    const photo = "10000000-0000-4000-8000-0000000000a2";
    const menu = "10000000-0000-4000-8000-0000000000a4";
    const screen = "10000000-0000-4000-8000-0000000000a5";
    store.media.push(
      { id: draftMedia, account_id: account, file_name: "draft.png", storage_path: `${account}/draft.png`, mime_type: "image/png", size_bytes: png.length, kind: "image" },
      { id: photo, account_id: account, file_name: "lunch.png", storage_path: `${account}/lunch.png`, mime_type: "image/png", size_bytes: png.length, kind: "image" },
    );
    store.objects.set(`${account}/lunch.png`, new Uint8Array(png));
    store.menus.push({
      id: menu, account_id: account, name: "Polish QA Board", template: "fresh",
      content: sampleLayout("menu-promo-67"), media_id: draftMedia, playlist_id: null,
    });
    store.displays.push({
      id: screen, account_id: account, name: "New TV", content_version: 2, assigned_playlist_id: null, status: "active",
    });
    const doc = applyLibraryFile(sampleLayout("menu-promo-67"), { id: photo, name: "lunch.png", kind: "image", mime: "image/png", url: null }, "photo");
    const published = await POST(bearer("token-a", {
      method: "POST",
      body: JSON.stringify(accountSaveBody({ mode: "publish", menuId: menu, name: "Polish QA Board", document: doc })),
    }));
    expect(published.status).toBe(200);
    const saved = store.menus.find((item) => item.id === menu);
    expect(saved?.playlist_id).toBeTruthy();
    expect(store.playlist_items.some((item) => item.playlist_id === saved?.playlist_id && item.media_id !== draftMedia)).toBe(true);
    expect(store.displays.find((item) => item.id === screen)?.content_version).toBe(2);
    const assigned = await assignBoard(bearer("token-a", {
      method: "POST",
      body: JSON.stringify({ menuId: menu, displayId: screen }),
    }));
    expect(assigned.status).toBe(200);
    const body = await assigned.json() as { ok?: boolean; playlistId?: string };
    expect(body.ok).toBe(true);
    expect(body.playlistId).toBe(String(saved?.playlist_id));
    const display = store.displays.find((item) => item.id === screen);
    expect(display?.assigned_playlist_id).toBe(saved?.playlist_id);
    expect(display?.content_version).toBe(3);
  });

  it("keeps an unsaved draft off the first saved board and starts a new board empty", () => {
    const document = sampleLayout("menu-promo-67");
    const studio = {
      boards: [{ id: "board-harbor", name: "Harbor Bean Café", document, mediaId: null, playlistId: "playlist-1" }],
      legacy: [],
      library: [],
    };
    expect(boardAfterReload(studio, null)?.id).toBe("board-harbor");
    expect(boardAfterReload(studio, null, { keepUnsaved: true })).toBeNull();
    const created = freshBoard(1, "  ");
    expect(created.name).toBe("Untitled board 2");
    expect(created.document.imageMediaId).toBeNull();
    expect(created.document.videoMediaId).toBeNull();
    expect(freshBoard(0, "Polish QA Board").name).toBe("Polish QA Board");
  });

  it("asks for a session when the flag is on and hides the route when it is off", async () => {
    expect((await POST(new Request("http://localhost/api/layout-studio", { method: "POST", body: "{}" }))).status).toBe(401);
    expect((await GET(new Request("http://localhost/api/layout-studio"))).status).toBe(401);
    delete process.env.LAYOUT_STUDIO;
    expect((await POST(bearer("token-a", { method: "POST", body: "{}" }))).status).toBe(404);
    expect((await GET(new Request("http://localhost/api/layout-studio"))).status).toBe(404);
  });
});
