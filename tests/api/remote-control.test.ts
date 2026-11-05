import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { setTestDb } from "@/lib/server/supabase";
import { createFakeDb, type Store } from "./fake-db";
import { jpeg } from "../helpers/bytes";
import { POST as createPair } from "@/app/api/player/pair/route";
import { POST as pairStatus } from "@/app/api/player/pair/status/route";
import { POST as claimPair } from "@/app/api/displays/pair/route";
import { GET as playerState, POST as reportPlayer } from "@/app/api/player/state/route";
import { POST as createPlaylist } from "@/app/api/playlists/route";
import { PATCH as savePlaylist } from "@/app/api/playlists/[id]/route";
import { POST as publishPlaylist } from "@/app/api/playlists/[id]/publish/route";
import { POST as uploadMedia } from "@/app/api/media/route";
import { GET as listRemote } from "@/app/api/remote/screens/route";
import { POST as sendCommand } from "@/app/api/remote/screens/[id]/command/route";
import { POST as setMode } from "@/app/api/remote/screens/[id]/playback-mode/route";

let store: Store;

beforeEach(() => {
  const fake = createFakeDb();
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

type RouteHandler = (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonBody = any;

async function call(handler: RouteHandler, url: string, init?: RequestInit, id?: string) {
  const res = await handler(new Request(url, init), { params: Promise.resolve({ id: id ?? "missing" }) });
  const body = await res.json().catch(() => null);
  return { status: res.status, body: body as JsonBody };
}

function toBlob(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy]);
}

async function upload(token: string, name: string) {
  const form = new FormData();
  form.set("file", toBlob(jpeg(8, 8)), "image.bin");
  form.set("name", name);
  return call(uploadMedia, "http://localhost/api/media", auth(token, { method: "POST", body: form }));
}

async function pairScreen(token: string, name: string) {
  const created = await call(createPair, "http://localhost/api/player/pair", { method: "POST", body: "{}" });
  const { sessionId, code, secret } = created.body as { sessionId: string; code: string; secret: string };
  const claimed = await call(claimPair, "http://localhost/api/displays/pair", auth(token, {
    method: "POST",
    body: JSON.stringify({ code, name }),
  }));
  const paired = await call(pairStatus, "http://localhost/api/player/pair/status", {
    method: "POST",
    body: JSON.stringify({ sessionId, secret }),
  });
  return { displayId: claimed.body?.id as string, tvToken: paired.body?.token as string };
}

describe("remote control", () => {
  it("lists screens, sends next/prev, switches mode, and delivers commands to the player", async () => {
    const { displayId, tvToken } = await pairScreen("token-a", "Lobby");
    const a = await upload("token-a", "a.png");
    const b = await upload("token-a", "b.png");
    const ids = [a.body?.id, b.body?.id] as string[];

    const made = await call(createPlaylist, "http://localhost/api/playlists", auth("token-a", {
      method: "POST",
      body: JSON.stringify({ name: "Deck" }),
    }));
    const playlistId = made.body?.id as string;
    await call(savePlaylist, `http://localhost/api/playlists/${playlistId}`, auth("token-a", {
      method: "PATCH",
      body: JSON.stringify({
        name: "Deck",
        defaultDurationMs: 5000,
        transition: "none",
        playbackMode: "manual",
        items: ids.map((mediaId) => ({ mediaId, durationMs: 2000 })),
      }),
    }), playlistId);
    await call(publishPlaylist, `http://localhost/api/playlists/${playlistId}/publish`, auth("token-a", {
      method: "POST",
      body: JSON.stringify({ displayIds: [displayId] }),
    }), playlistId);

    const listed = await call(listRemote, "http://localhost/api/remote/screens", auth("token-a"));
    expect(listed.status).toBe(200);
    expect(listed.body).toHaveLength(1);
    expect(listed.body[0]).toMatchObject({
      id: displayId,
      controllable: true,
      mode: "manual",
      playlist: { id: playlistId, playbackMode: "manual", itemCount: 2 },
    });
    expect(listed.body[0].stateVersion).toBeTruthy();
    expect(listed.body[0]).toHaveProperty("online");
    expect(listed.body[0]).toHaveProperty("lastSeenAt");

    const next = await call(sendCommand, `http://localhost/api/remote/screens/${displayId}/command`, auth("token-a", {
      method: "POST",
      body: JSON.stringify({ command: "next" }),
    }), displayId);
    expect(next.status).toBe(200);
    expect(next.body.seq).toBe(1);
    expect(next.body.screen).toMatchObject({ id: displayId, controllable: true });
    expect(next.body.screen.stateVersion).toBeTruthy();
    expect(next.body.screen).toHaveProperty("online");
    expect(next.body.screen).toHaveProperty("lastSeenAt");

    const state = await call(playerState, "http://localhost/api/player/state?v=0", {
      headers: { "X-Display-Token": tvToken },
    });
    expect(state.body.playlist.playbackMode).toBe("manual");
    expect(state.body.pollMs).toBe(1500);
    expect(state.body.commands).toEqual([{ seq: 1, command: "next" }]);

    const reported = await call(reportPlayer, "http://localhost/api/player/state", {
      method: "POST",
      headers: { "X-Display-Token": tvToken, "Content-Type": "application/json" },
      body: JSON.stringify({
        playback: {
          playlistId,
          playbackMode: "manual",
          index: 1,
          count: 2,
          version: state.body.version,
          lastAppliedSeq: 1,
        },
      }),
    });
    expect(reported.status).toBe(200);

    const afterAck = await call(playerState, "http://localhost/api/player/state?v=" + state.body.version, {
      headers: { "X-Display-Token": tvToken },
    });
    expect(afterAck.body.unchanged).toBe(true);
    expect(afterAck.body.commands).toEqual([]);

    const screens = await call(listRemote, "http://localhost/api/remote/screens", auth("token-a"));
    expect(screens.body[0].playback).toMatchObject({ index: 1, count: 2, slide: 2, lastAppliedSeq: 1 });

    const auto = await call(setMode, `http://localhost/api/remote/screens/${displayId}/playback-mode`, auth("token-a", {
      method: "POST",
      body: JSON.stringify({ playbackMode: "auto" }),
    }), displayId);
    expect(auto.status).toBe(200);
    expect(auto.body.playbackMode).toBe("auto");
    expect(auto.body.screen.mode).toBe("auto");
    expect(auto.body.screen.playlist.playbackMode).toBe("auto");

    const reloaded = await call(playerState, "http://localhost/api/player/state?v=0", {
      headers: { "X-Display-Token": tvToken },
    });
    expect(reloaded.body.playlist.playbackMode).toBe("auto");
  });

  it("blocks cross-organization command and mode changes", async () => {
    const { displayId } = await pairScreen("token-a", "Lobby");
    const a = await upload("token-a", "a.png");
    const made = await call(createPlaylist, "http://localhost/api/playlists", auth("token-a", {
      method: "POST",
      body: JSON.stringify({ name: "Deck" }),
    }));
    const playlistId = made.body?.id as string;
    await call(savePlaylist, `http://localhost/api/playlists/${playlistId}`, auth("token-a", {
      method: "PATCH",
      body: JSON.stringify({
        name: "Deck",
        defaultDurationMs: 5000,
        transition: "none",
        playbackMode: "manual",
        items: [{ mediaId: a.body?.id, durationMs: 2000 }],
      }),
    }), playlistId);
    await call(publishPlaylist, `http://localhost/api/playlists/${playlistId}/publish`, auth("token-a", {
      method: "POST",
      body: JSON.stringify({ displayIds: [displayId] }),
    }), playlistId);

    const foreignList = await call(listRemote, "http://localhost/api/remote/screens", auth("token-b"));
    expect(foreignList.body).toEqual([]);

    const foreignCmd = await call(sendCommand, `http://localhost/api/remote/screens/${displayId}/command`, auth("token-b", {
      method: "POST",
      body: JSON.stringify({ command: "next" }),
    }), displayId);
    expect(foreignCmd.status).toBe(403);
    expect(store.display_commands).toHaveLength(0);

    const foreignMode = await call(setMode, `http://localhost/api/remote/screens/${displayId}/playback-mode`, auth("token-b", {
      method: "POST",
      body: JSON.stringify({ playbackMode: "auto" }),
    }), displayId);
    expect(foreignMode.status).toBe(403);
    expect(store.playlists[0].published_playback_mode).toBe("manual");
  });
});
