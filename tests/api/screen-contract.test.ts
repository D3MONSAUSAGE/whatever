import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { GET as listDisplays } from "@/app/api/displays/route";
import { GET as oneDisplay } from "@/app/api/displays/[id]/route";
import { GET as timeline } from "@/app/api/displays/[id]/timeline/route";
import { POST as publishScreens } from "@/app/api/displays/publish/route";
import { POST as claimPair } from "@/app/api/displays/pair/route";
import { POST as createPair } from "@/app/api/player/pair/route";
import { GET as overview } from "@/app/api/overview/route";
import { GET as config } from "@/app/api/config/route";
import { GET as boards } from "@/app/api/layout-studio/boards/route";
import { POST as assignBoard } from "@/app/api/layout-studio/assign/route";
import { POST as createGroup } from "@/app/api/screen-groups/route";
import { sampleLayout } from "@/lib/layout-studio";
import { setTestDb } from "@/lib/server/supabase";
import { createFakeDb, type Store } from "./fake-db";

let store: Store;

beforeEach(() => {
  const fake = createFakeDb();
  store = fake.store;
  setTestDb(fake.client);
  fake.addUser("token-a", "11111111-1111-4111-8111-111111111111", "cafe@example.com");
  fake.addUser("token-b", "22222222-2222-4222-8222-222222222222", "other@example.com");
  process.env.LAYOUT_STUDIO = "1";
});

afterAll(() => {
  setTestDb(null);
  delete process.env.LAYOUT_STUDIO;
});

function auth(token: string, init: RequestInit = {}): RequestInit {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return { ...init, headers };
}

async function call(handler: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>, url: string, init?: RequestInit, id = "missing") {
  const res = await handler(new Request(url, init), { params: Promise.resolve({ id }) });
  const body = await res.json().catch(() => null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, body: body as any };
}

function kind(value: unknown) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

async function pairedDisplay() {
  const created = await call(createPair, "http://localhost/api/player/pair", { method: "POST", body: "{}" });
  const { code } = created.body as { code: string };
  const claimed = await call(claimPair, "http://localhost/api/displays/pair", auth("token-a", {
    method: "POST",
    body: JSON.stringify({ code, name: "Front counter" }),
  }));
  return String(claimed.body.id);
}

describe("screen API contract", () => {
  it("keeps the legacy display row and adds only the sync fields", async () => {
    const id = await pairedDisplay();
    const list = await call(listDisplays, "http://localhost/api/displays", auth("token-a"));
    const row = (list.body as unknown as Record<string, unknown>[])[0];
    expect(Object.keys(row).sort()).toEqual([
      "acknowledgedAt", "activeSchedules", "boardPreviewUrl", "connected", "contentVersion",
      "currentSchedule", "entitled", "id", "lastSeenAt", "location", "media", "name", "nextChange",
      "online", "playerError", "playingAt", "playlist", "reportedState",
    ]);
    expect(kind(row.id)).toBe("string");
    expect(row.id).toBe(id);
    expect(kind(row.name)).toBe("string");
    expect(kind(row.connected)).toBe("boolean");
    expect(kind(row.online)).toBe("boolean");
    expect(["string", "null"]).toContain(kind(row.lastSeenAt));
    expect(["string", "null"]).toContain(kind(row.playerError));
    expect(row.media).toBeNull();
    expect(row.playlist).toBeNull();
    expect(row.location === null || kind(row.location) === "object").toBe(true);
    expect(row.currentSchedule).toBeNull();
    expect(kind(row.activeSchedules)).toBe("array");
    expect(kind(row.entitled)).toBe("boolean");
    expect(row.reportedState).toBe("unknown");
    expect(kind(row.contentVersion)).toBe("number");
    expect(row.acknowledgedAt).toBeNull();
    expect(row.playingAt).toBeNull();
    expect(row.nextChange).toBeNull();
    expect(row.boardPreviewUrl).toBeNull();

    const one = await call(oneDisplay, `http://localhost/api/displays/${id}`, auth("token-a"), id);
    expect(one.status).toBe(200);
    expect(one.body).toEqual(row);
    const line = await call(timeline, `http://localhost/api/displays/${id}/timeline`, auth("token-a"), id);
    expect(line.body.nextChange).toBeNull();
    const foreign = await call(oneDisplay, `http://localhost/api/displays/${id}`, auth("token-b"), id);
    expect(foreign.status).toBe(404);
  });

  it("keeps the overview counts and the public urls", async () => {
    const home = await call(overview, "http://localhost/api/overview", auth("token-a"));
    expect(Object.keys(home.body).sort()).toEqual(["activeSchedules", "media", "offline", "online", "playlists", "screens"]);
    for (const key of Object.keys(home.body)) expect(kind(home.body[key])).toBe("number");
    const urls = await call(config, "http://localhost/api/config");
    expect(urls.body).toEqual({
      appUrl: "https://pekkotv.com",
      pairUrl: "https://pekkotv.com/pair",
      tvUrl: "https://pekkotv.com/tv",
    });
    expect(JSON.stringify(urls.body)).not.toContain("vercel.app");
  });

  it("lists boards and assigns one without clearing another screen", async () => {
    const first = await pairedDisplay();
    const second = await pairedDisplay();
    const mediaId = crypto.randomUUID();
    const account = store.displays[0].account_id;
    store.media.push({
      id: mediaId, account_id: account, file_name: "Board (menu).png",
      storage_path: `${account}/${mediaId}.png`, mime_type: "image/png", kind: "image",
    });
    const playlistId = crypto.randomUUID();
    store.playlists.push({ id: playlistId, account_id: account, name: "Board", revision: 1, published_at: new Date().toISOString() });
    store.playlist_items.push({
      id: crypto.randomUUID(), playlist_id: playlistId, account_id: account, media_id: mediaId,
      kind: "published", position: 0, duration_ms: 30000,
    });
    const menuId = crypto.randomUUID();
    store.menus.push({
      id: menuId, account_id: account, name: "Lunch board", playlist_id: playlistId, media_id: mediaId,
      content: sampleLayout("split-50"),
    });
    store.displays[1].assigned_playlist_id = playlistId;

    const listed = await call(boards, "http://localhost/api/layout-studio/boards", auth("token-a"));
    expect(listed.status).toBe(200);
    const board = (listed.body.boards as { id: string; name: string; template: string; thumbnailUrl: string | null }[])[0];
    expect(board).toMatchObject({ id: menuId, name: "Lunch board", template: "split-50" });
    expect("thumbnailUrl" in board).toBe(true);

    const other = await call(boards, "http://localhost/api/layout-studio/boards", auth("token-b"));
    expect(other.body.boards).toEqual([]);
    const assigned = await call(assignBoard, "http://localhost/api/layout-studio/assign", auth("token-a", {
      method: "POST",
      body: JSON.stringify({ menuId, displayId: first }),
    }));
    expect(assigned.status).toBe(200);
    expect(store.displays.find((item) => item.id === first)?.assigned_playlist_id).toBe(playlistId);
    expect(store.displays.find((item) => item.id === second)?.assigned_playlist_id).toBe(playlistId);
    const stolen = await call(assignBoard, "http://localhost/api/layout-studio/assign", auth("token-b", {
      method: "POST",
      body: JSON.stringify({ menuId, displayId: first }),
    }));
    expect(stolen.status).toBe(404);
  });

  it("previews a group publish and commits through the playlist publish", async () => {
    const id = await pairedDisplay();
    const account = store.displays[0].account_id;
    const playlistId = crypto.randomUUID();
    store.playlists.push({
      id: playlistId, account_id: account, name: "Day", revision: 0,
      default_duration_ms: 10000, transition: "none", playback_mode: "auto",
    });
    store.playlist_items.push({
      id: crypto.randomUUID(), playlist_id: playlistId, account_id: account,
      media_id: crypto.randomUUID(), kind: "draft", position: 0, duration_ms: 10000,
    });
    const other = crypto.randomUUID();
    store.displays.push({
      id: other, account_id: account, name: "Patio", status: "active",
      content_version: 1, assigned_playlist_id: playlistId, token_hash: "kept",
    });
    const group = await call(createGroup, "http://localhost/api/screen-groups", auth("token-a", {
      method: "POST",
      body: JSON.stringify({ name: "Floor", displayIds: [id] }),
    }));
    expect(group.status).toBe(201);
    const preview = await call(publishScreens, "http://localhost/api/displays/publish", auth("token-a", {
      method: "POST",
      body: JSON.stringify({ playlistId, groupId: group.body.id, commit: false }),
    }));
    expect(preview.status).toBe(200);
    expect(preview.body.commit).toBe(false);
    expect(preview.body.willBeCleared.map((item: { id: string }) => item.id)).toEqual([other]);
    expect(store.displays[0].assigned_playlist_id).toBeNull();
    const committed = await call(publishScreens, "http://localhost/api/displays/publish", auth("token-a", {
      method: "POST",
      body: JSON.stringify({ playlistId, displayIds: [id], commit: true }),
    }));
    expect(committed.status).toBe(200);
    expect(store.displays[0].assigned_playlist_id).toBe(playlistId);
    expect(store.displays.find((item) => item.id === other)?.assigned_playlist_id).toBe(playlistId);
    const replaced = await call(publishScreens, "http://localhost/api/displays/publish", auth("token-a", {
      method: "POST",
      body: JSON.stringify({ playlistId, displayIds: [id], commit: true, replace: true }),
    }));
    expect(replaced.status).toBe(200);
    expect(store.displays.find((item) => item.id === other)?.assigned_playlist_id).toBeNull();
    const foreign = await call(publishScreens, "http://localhost/api/displays/publish", auth("token-b", {
      method: "POST",
      body: JSON.stringify({ playlistId, displayIds: [id], commit: false }),
    }));
    expect(foreign.status).toBe(404);
  });
});
