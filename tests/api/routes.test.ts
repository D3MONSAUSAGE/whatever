import { readFileSync } from "node:fs";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { setTestDb } from "@/lib/server/supabase";
import { sha256 } from "@/lib/server/crypto";
import { PAIR_CLAIM_MAX_PER_USER, PAIR_CREATE_MAX_PER_IP, MAX_UPLOAD_BYTES } from "@/lib/server/limits";
import { POST as createPair } from "@/app/api/player/pair/route";
import { POST as pairStatus } from "@/app/api/player/pair/status/route";
import { GET as playerState, POST as reportPlayer } from "@/app/api/player/state/route";
import { POST as claimPair } from "@/app/api/displays/pair/route";
import { GET as listDisplays, } from "@/app/api/displays/route";
import { PATCH as updateDisplay, DELETE as disconnectDisplay } from "@/app/api/displays/[id]/route";
import { GET as listMedia, POST as uploadMedia } from "@/app/api/media/route";
import { POST as startVideoUpload } from "@/app/api/media/upload/route";
import { POST as completeVideoUpload } from "@/app/api/media/upload/complete/route";
import { DELETE as deleteMedia } from "@/app/api/media/[id]/route";
import { GET as listPlaylists, POST as createPlaylist } from "@/app/api/playlists/route";
import { GET as getPlaylist, PATCH as savePlaylist, DELETE as deletePlaylistRoute } from "@/app/api/playlists/[id]/route";
import { POST as publishPlaylist } from "@/app/api/playlists/[id]/publish/route";
import { GET as me } from "@/app/api/me/route";
import { createFakeDb, type Store } from "./fake-db";
import { MAX_VIDEO_BYTES } from "@/lib/mp4";
import { jpeg } from "../helpers/bytes";

function fixture(name: string) {
  return new Uint8Array(readFileSync(new URL(`../fixtures/${name}`, import.meta.url)));
}

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
// Route JSON is asserted field by field; a wide type keeps those checks readable.
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

async function upload(token: string, name: string, bytes: Uint8Array) {
  const form = new FormData();
  form.set("file", toBlob(bytes), "image.bin");
  form.set("name", name);
  return call(uploadMedia, "http://localhost/api/media", auth(token, { method: "POST", body: form }));
}

describe("API", () => {
  it("rejects unauthenticated dashboard calls", async () => {
    expect((await call(listMedia, "http://localhost/api/media")).status).toBe(401);
    expect((await call(listDisplays, "http://localhost/api/displays")).status).toBe(401);
    expect((await call(me, "http://localhost/api/me")).status).toBe(401);
    expect((await call(claimPair, "http://localhost/api/displays/pair", { method: "POST", body: "{}" })).status).toBe(401);
    expect((await call(playerState, "http://localhost/api/player/state")).status).toBe(401);
  });

  it("creates an account from the signed-in email", async () => {
    const res = await call(me, "http://localhost/api/me", auth("token-a"));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ email: "cafe@example.com", accountName: "cafe" });
    expect(store.locations).toHaveLength(1);
  });

  it("checks upload bytes, not the claimed type", async () => {
    const bad = await upload("token-a", "menu.html", new TextEncoder().encode("<html></html>"));
    expect(bad.status).toBe(415);

    const bomb = await upload("token-a", "huge.jpg", jpeg(8000, 100));
    expect(bomb.status).toBe(415);
    expect(bomb.body?.error).toMatch(/too large/);

    const empty = new FormData();
    empty.set("file", new Blob([]), "x.jpg");
    expect((await call(uploadMedia, "http://localhost/api/media", auth("token-a", { method: "POST", body: empty }))).status).toBe(400);

    const big = new Uint8Array(MAX_UPLOAD_BYTES + 1);
    big.set(jpeg(2, 2));
    const over = await upload("token-a", "big.jpg", big);
    expect(over.status).toBe(413);

    const ok = await upload("token-a", "lunch\nmenu.png", jpeg(1920, 1080));
    expect(ok.status).toBe(201);
    const listed = await call(listMedia, "http://localhost/api/media", auth("token-a"));
    expect(listed.body).toMatchObject([{ fileName: "lunchmenu.png" }]);
    const item = (listed.body as unknown as { url: string }[])[0];
    expect(item.url).toContain("signed.test");
    expect(store.objects.size).toBe(1);
    expect([...store.objects.keys()][0]).toMatch(/\.jpg$/);
  });

  it("pairs, publishes, replaces, and disconnects a TV", async () => {
    const created = await call(createPair, "http://localhost/api/player/pair", { method: "POST", body: "{}" });
    expect(created.status).toBe(200);
    const { sessionId, code, secret } = created.body as { sessionId: string; code: string; secret: string };
    expect(code).toMatch(/^\d{6}$/);
    const session = store.pairing_sessions[0];
    expect(session.code_hash).not.toBe(code);
    expect(JSON.stringify(session)).not.toContain(secret);
    expect(session.session_secret_hash).toBe(sha256(secret));

    const missing = await call(claimPair, "http://localhost/api/displays/pair", auth("token-a", {
      method: "POST",
      body: JSON.stringify({ code: "000000", name: "Front counter" }),
    }));
    expect(missing.status).toBe(404);

    const claimed = await call(claimPair, "http://localhost/api/displays/pair", auth("token-a", {
      method: "POST",
      body: JSON.stringify({ code: `${code.slice(0, 3)} ${code.slice(3)}`, name: "  Front counter  " }),
    }));
    expect(claimed.status).toBe(200);
    const displayId = claimed.body?.id as string;
    expect(store.displays[0].location_id).toBeTruthy();
    expect(store.displays[0].token_hash).toBeNull();

    const again = await call(claimPair, "http://localhost/api/displays/pair", auth("token-a", {
      method: "POST",
      body: JSON.stringify({ code, name: "Front counter" }),
    }));
    expect(again.status).toBe(404);

    const wrongSecret = await call(pairStatus, "http://localhost/api/player/pair/status", {
      method: "POST",
      body: JSON.stringify({ sessionId, secret: `${"z".repeat(40)}` }),
    });
    expect(wrongSecret.body).toMatchObject({ status: "expired" });

    const paired = await call(pairStatus, "http://localhost/api/player/pair/status", {
      method: "POST",
      body: JSON.stringify({ sessionId, secret }),
    });
    expect(paired.body?.status).toBe("paired");
    const token = paired.body?.token as string;
    expect(store.displays[0].token_hash).toBe(sha256(token));
    expect(JSON.stringify(store.displays[0])).not.toContain(token);

    const second = await call(pairStatus, "http://localhost/api/player/pair/status", {
      method: "POST",
      body: JSON.stringify({ sessionId, secret }),
    });
    expect(second.body).toMatchObject({ status: "expired" });
    expect(store.displays[0].token_hash).toBe(sha256(token));

    const waiting = await call(listDisplays, "http://localhost/api/displays", auth("token-a"));
    expect(waiting.body).toMatchObject([{ id: displayId, name: "Front counter", connected: true, media: null }]);
    expect(JSON.stringify(waiting.body)).not.toContain("token_hash");
    expect(JSON.stringify(waiting.body)).not.toContain(token);

    const empty = await call(playerState, "http://localhost/api/player/state", { headers: { "X-Display-Token": token } });
    expect(empty.body).toMatchObject({ version: 0, mediaId: null, url: null });

    const first = await upload("token-a", "lunch.png", jpeg(800, 600));
    const secondImage = await upload("token-a", "dinner.png", jpeg(800, 600));
    const mediaId = first.body?.id as string;
    const otherMediaId = secondImage.body?.id as string;

    const published = await call(updateDisplay, `http://localhost/api/displays/${displayId}`, auth("token-a", {
      method: "PATCH",
      body: JSON.stringify({ mediaId }),
    }), displayId);
    expect(published.status).toBe(200);

    const shown = await call(playerState, "http://localhost/api/player/state?v=", { headers: { "X-Display-Token": token } });
    expect(shown.body?.version).toBe(1);
    expect(String(shown.body?.url)).toContain("signed.test");
    const unchanged = await call(playerState, "http://localhost/api/player/state?v=1", { headers: { "X-Display-Token": token } });
    expect(unchanged.body).toEqual({ version: 1, unchanged: true });
    const refreshIgnored = await call(playerState, "http://localhost/api/player/state?v=1&refresh=1", { headers: { "X-Display-Token": token } });
    expect(refreshIgnored.body).toEqual({ version: 1, unchanged: true });
    expect(shown.body.playlist).toBeUndefined();

    const replaced = await call(updateDisplay, `http://localhost/api/displays/${displayId}`, auth("token-a", {
      method: "PATCH",
      body: JSON.stringify({ mediaId: otherMediaId }),
    }), displayId);
    expect(replaced.status).toBe(200);
    const next = await call(playerState, "http://localhost/api/player/state?v=1", { headers: { "X-Display-Token": token } });
    expect(next.body?.version).toBe(2);
    expect(next.body?.url).not.toBe(shown.body?.url);

    const renamed = await call(updateDisplay, `http://localhost/api/displays/${displayId}`, auth("token-a", {
      method: "PATCH",
      body: JSON.stringify({ name: "Patio" }),
    }), displayId);
    expect(renamed.status).toBe(200);

    const cleared = await call(updateDisplay, `http://localhost/api/displays/${displayId}`, auth("token-a", {
      method: "PATCH",
      body: JSON.stringify({ mediaId: null }),
    }), displayId);
    expect(cleared.status).toBe(200);
    const blank = await call(playerState, "http://localhost/api/player/state?v=2", { headers: { "X-Display-Token": token } });
    expect(blank.body).toMatchObject({ version: 3, mediaId: null, url: null });

    await call(updateDisplay, `http://localhost/api/displays/${displayId}`, auth("token-a", {
      method: "PATCH",
      body: JSON.stringify({ mediaId }),
    }), displayId);
    const removed = await call(deleteMedia, `http://localhost/api/media/${mediaId}`, auth("token-a", { method: "DELETE" }), mediaId);
    expect(removed.status).toBe(200);
    expect(store.objects.size).toBe(1);
    const afterDelete = await call(playerState, "http://localhost/api/player/state?v=4", { headers: { "X-Display-Token": token } });
    expect(afterDelete.body?.url).toBeNull();

    const gone = await call(disconnectDisplay, `http://localhost/api/displays/${displayId}`, auth("token-a", { method: "DELETE" }), displayId);
    expect(gone.status).toBe(200);
    const revoked = await call(playerState, "http://localhost/api/player/state", { headers: { "X-Display-Token": token } });
    expect(revoked.status).toBe(401);
    const list = await call(listDisplays, "http://localhost/api/displays", auth("token-a"));
    expect(list.body).toEqual([]);
  });

  it("does not let another account read or change content", async () => {
    const created = await call(createPair, "http://localhost/api/player/pair", { method: "POST", body: "{}" });
    const { code, secret, sessionId } = created.body as { code: string; secret: string; sessionId: string };
    const claimed = await call(claimPair, "http://localhost/api/displays/pair", auth("token-a", {
      method: "POST",
      body: JSON.stringify({ code, name: "Counter" }),
    }));
    const displayId = claimed.body?.id as string;
    await call(pairStatus, "http://localhost/api/player/pair/status", {
      method: "POST",
      body: JSON.stringify({ sessionId, secret }),
    });
    const uploaded = await upload("token-a", "secret-menu.png", jpeg(10, 10));
    const mediaId = uploaded.body?.id as string;
    const uploadedB = await upload("token-b", "other.png", jpeg(10, 10));

    const mediaB = await call(listMedia, "http://localhost/api/media", auth("token-b"));
    expect(mediaB.body).toHaveLength(1);
    expect(JSON.stringify(mediaB.body)).not.toContain("secret-menu.png");
    expect(JSON.stringify(mediaB.body)).not.toContain(mediaId);

    const displaysB = await call(listDisplays, "http://localhost/api/displays", auth("token-b"));
    expect(displaysB.body).toEqual([]);

    const steal = await call(deleteMedia, `http://localhost/api/media/${mediaId}`, auth("token-b", { method: "DELETE" }), mediaId);
    expect(steal.status).toBe(404);
    expect(store.media.some((item) => item.id === mediaId)).toBe(true);

    const assign = await call(updateDisplay, `http://localhost/api/displays/${displayId}`, auth("token-b", {
      method: "PATCH",
      body: JSON.stringify({ mediaId }),
    }), displayId);
    expect(assign.status).toBe(404);

    const cross = await call(updateDisplay, `http://localhost/api/displays/${displayId}`, auth("token-a", {
      method: "PATCH",
      body: JSON.stringify({ mediaId: uploadedB.body?.id }),
    }), displayId);
    expect(cross.status).toBe(404);

    const disconnect = await call(disconnectDisplay, `http://localhost/api/displays/${displayId}`, auth("token-b", { method: "DELETE" }), displayId);
    expect(disconnect.status).toBe(404);
    expect(store.displays[0].status).toBe("active");
  });

  it("expires pairing codes and rate-limits guesses", async () => {
    expect((await call(claimPair, "http://localhost/api/displays/pair", auth("token-a", {
      method: "POST",
      body: JSON.stringify({ code: "12", name: "TV" }),
    }))).status).toBe(400);

    const created = await call(createPair, "http://localhost/api/player/pair", { method: "POST", body: "{}" });
    store.pairing_sessions[0].expires_at = new Date(Date.now() - 1000).toISOString();
    const expired = await call(claimPair, "http://localhost/api/displays/pair", auth("token-a", {
      method: "POST",
      body: JSON.stringify({ code: created.body?.code, name: "TV" }),
    }));
    expect(expired.status).toBe(404);
    store.rate_limits = [];

    for (let i = 0; i < PAIR_CLAIM_MAX_PER_USER; i++) {
      const res = await call(claimPair, "http://localhost/api/displays/pair", auth("token-a", {
        method: "POST",
        body: JSON.stringify({ code: String(i).padStart(6, "0"), name: "TV" }),
      }));
      expect(res.status).toBe(404);
    }
    const blocked = await call(claimPair, "http://localhost/api/displays/pair", auth("token-a", {
      method: "POST",
      body: JSON.stringify({ code: "999999", name: "TV" }),
    }));
    expect(blocked.status).toBe(429);
  });

  it("rate-limits pairing-code creation per IP", async () => {
    for (let i = 0; i < PAIR_CREATE_MAX_PER_IP; i++) {
      const res = await call(createPair, "http://localhost/api/player/pair", {
        method: "POST",
        headers: { "x-real-ip": "203.0.113.10" },
        body: "{}",
      });
      expect(res.status).toBe(200);
    }
    const blocked = await call(createPair, "http://localhost/api/player/pair", {
      method: "POST",
      headers: { "x-real-ip": "203.0.113.10" },
      body: "{}",
    });
    expect(blocked.status).toBe(429);
    const otherIp = await call(createPair, "http://localhost/api/player/pair", {
      method: "POST",
      headers: { "x-real-ip": "203.0.113.11" },
      body: "{}",
    });
    expect(otherIp.status).toBe(200);
  });

  it("does not hand out a token if the display was disconnected first", async () => {
    const created = await call(createPair, "http://localhost/api/player/pair", { method: "POST", body: "{}" });
    const { sessionId, code, secret } = created.body as { sessionId: string; code: string; secret: string };
    const claimed = await call(claimPair, "http://localhost/api/displays/pair", auth("token-a", {
      method: "POST",
      body: JSON.stringify({ code, name: "Bar" }),
    }));
    const displayId = claimed.body?.id as string;
    await call(disconnectDisplay, `http://localhost/api/displays/${displayId}`, auth("token-a", { method: "DELETE" }), displayId);
    const status = await call(pairStatus, "http://localhost/api/player/pair/status", {
      method: "POST",
      body: JSON.stringify({ sessionId, secret }),
    });
    expect(status.body).toMatchObject({ status: "expired" });
    expect(status.body?.token).toBeUndefined();
  });

  it("publishes a playlist, keeps a single image on the old path, and blocks deletes", async () => {
    const created = await call(createPair, "http://localhost/api/player/pair", { method: "POST", body: "{}" });
    const { sessionId, code, secret } = created.body as { sessionId: string; code: string; secret: string };
    const claimed = await call(claimPair, "http://localhost/api/displays/pair", auth("token-a", {
      method: "POST",
      body: JSON.stringify({ code, name: "Counter" }),
    }));
    const displayId = claimed.body?.id as string;
    const paired = await call(pairStatus, "http://localhost/api/player/pair/status", {
      method: "POST",
      body: JSON.stringify({ sessionId, secret }),
    });
    const token = paired.body?.token as string;
    const first = await upload("token-a", "a.png", jpeg(8, 8));
    const second = await upload("token-a", "b.png", jpeg(8, 8));
    const third = await upload("token-a", "c.png", jpeg(8, 8));
    const other = await upload("token-b", "other.png", jpeg(8, 8));
    const ids = [first.body?.id, second.body?.id, third.body?.id] as string[];

    const made = await call(createPlaylist, "http://localhost/api/playlists", auth("token-a", {
      method: "POST",
      body: JSON.stringify({ name: "  Lunch loop  " }),
    }));
    expect(made.status).toBe(201);
    const playlistId = made.body?.id as string;

    const saved = await call(savePlaylist, `http://localhost/api/playlists/${playlistId}`, auth("token-a", {
      method: "PATCH",
      body: JSON.stringify({
        name: "Lunch loop",
        defaultDurationMs: 10000,
        transition: "none",
        items: [
          { mediaId: ids[0], durationMs: 2000 },
          { mediaId: ids[1], durationMs: 3000 },
          { mediaId: ids[2], durationMs: null },
        ],
      }),
    }), playlistId);
    expect(saved.status).toBe(200);

    const before = await call(playerState, "http://localhost/api/player/state", { headers: { "X-Display-Token": token } });
    expect(before.body).toMatchObject({ version: 0, mediaId: null, url: null });
    expect(before.body.playlist).toBeUndefined();

    const published = await call(publishPlaylist, `http://localhost/api/playlists/${playlistId}/publish`, auth("token-a", {
      method: "POST",
      body: JSON.stringify({ displayIds: [displayId] }),
    }), playlistId);
    expect(published.status).toBe(200);

    const playing = await call(playerState, "http://localhost/api/player/state?v=0", { headers: { "X-Display-Token": token } });
    expect(playing.body.version).toBe(1);
    expect(playing.body.playlist.items.map((item: { mediaId: string; durationMs: number }) => [item.mediaId, item.durationMs])).toEqual([
      [ids[0], 2000],
      [ids[1], 3000],
      [ids[2], 10000],
    ]);
    expect(playing.body.playlist.transition).toBe("none");
    expect(String(playing.body.url)).toContain("signed.test");
    expect(playing.body.mediaId).toBe(ids[0]);
    expect(playing.body.playlist.items.every((item: { kind: string }) => item.kind === "image")).toBe(true);
    const same = await call(playerState, "http://localhost/api/player/state?v=1", { headers: { "X-Display-Token": token } });
    expect(same.body).toEqual({ version: 1, unchanged: true });

    const drafted = await call(savePlaylist, `http://localhost/api/playlists/${playlistId}`, auth("token-a", {
      method: "PATCH",
      body: JSON.stringify({
        name: "Lunch loop",
        defaultDurationMs: 8000,
        transition: "fade",
        items: [
          { mediaId: ids[2], durationMs: 4000 },
          { mediaId: ids[0], durationMs: 2000 },
        ],
      }),
    }), playlistId);
    expect(drafted.status).toBe(200);
    const still = await call(playerState, "http://localhost/api/player/state?v=1", { headers: { "X-Display-Token": token } });
    expect(still.body).toEqual({ version: 1, unchanged: true });

    const republished = await call(publishPlaylist, `http://localhost/api/playlists/${playlistId}/publish`, auth("token-a", {
      method: "POST",
      body: JSON.stringify({ displayIds: [displayId] }),
    }), playlistId);
    expect(republished.status).toBe(200);
    const next = await call(playerState, "http://localhost/api/player/state?v=1", { headers: { "X-Display-Token": token } });
    expect(next.body.version).toBe(2);
    expect(next.body.playlist.transition).toBe("fade");
    expect(next.body.playlist.items.map((item: { mediaId: string }) => item.mediaId)).toEqual([ids[2], ids[0]]);

    const displays = await call(listDisplays, "http://localhost/api/displays", auth("token-a"));
    expect(displays.body[0].media).toBeNull();
    expect(displays.body[0].playlist).toMatchObject({ id: playlistId, name: "Lunch loop" });

    const blocked = await call(deleteMedia, `http://localhost/api/media/${ids[2]}`, auth("token-a", { method: "DELETE" }), ids[2]);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toMatch(/playlist/i);
    expect(blocked.body.error).toMatch(/Lunch loop/);
    expect(store.media.some((item) => item.id === ids[2])).toBe(true);

    const image = await call(updateDisplay, `http://localhost/api/displays/${displayId}`, auth("token-a", {
      method: "PATCH",
      body: JSON.stringify({ mediaId: ids[1] }),
    }), displayId);
    expect(image.status).toBe(200);
    const single = await call(playerState, "http://localhost/api/player/state?v=2", { headers: { "X-Display-Token": token } });
    expect(single.body.version).toBe(3);
    expect(single.body.mediaId).toBe(ids[1]);
    expect(single.body.playlist).toBeUndefined();
    expect(store.displays[0].assigned_playlist_id).toBeNull();

    const foreignList = await call(listPlaylists, "http://localhost/api/playlists", auth("token-b"));
    expect(foreignList.body).toEqual([]);
    const foreignGet = await call(getPlaylist, `http://localhost/api/playlists/${playlistId}`, auth("token-b"), playlistId);
    expect(foreignGet.status).toBe(404);
    const foreignSave = await call(savePlaylist, `http://localhost/api/playlists/${playlistId}`, auth("token-b", {
      method: "PATCH",
      body: JSON.stringify({
        name: "Stolen",
        defaultDurationMs: 1000,
        transition: "none",
        items: [{ mediaId: other.body?.id, durationMs: null }],
      }),
    }), playlistId);
    expect(foreignSave.status).toBe(400);
    expect(store.playlists[0].name).toBe("Lunch loop");
    const foreignDelete = await call(deletePlaylistRoute, `http://localhost/api/playlists/${playlistId}`, auth("token-b", { method: "DELETE" }), playlistId);
    expect(foreignDelete.status).toBe(404);
  });

  it("stores an H.264 video, rejects other codecs, and keeps accounts apart", async () => {
    const good = await uploadVideo("token-a", "loop.mp4", fixture("h264-aac.mp4"));
    expect(good.status).toBe(201);
    const mediaId = good.body?.id as string;
    const listed = await call(listMedia, "http://localhost/api/media", auth("token-a"));
    const row = (listed.body as { id: string; kind: string; durationMs: number; width: number; height: number; thumbnailUrl: string; sizeBytes: number; url: string }[])
      .find((item) => item.id === mediaId);
    expect(row).toMatchObject({ kind: "video", width: 160, height: 120 });
    expect(row?.durationMs).toBeGreaterThan(500);
    expect(row?.thumbnailUrl).toContain("-thumb.jpg");
    expect(row?.url).toContain(".mp4");
    expect(row?.sizeBytes).toBe(fixture("h264-aac.mp4").length);
    expect([...store.objects.keys()].filter((path) => path.includes(mediaId))).toHaveLength(2);

    const silent = await uploadVideo("token-a", "quiet.mp4", fixture("h264-silent.mp4"));
    expect(silent.status).toBe(201);

    const hevc = await uploadVideo("token-a", "hevc.mp4", fixture("hevc.mp4"));
    expect(hevc.status).toBe(415);
    expect(hevc.body?.error).toMatch(/H\.264/);
    const renamed = await uploadVideo("token-a", "clip.mp4", fixture("vp9-renamed.mp4"));
    expect(renamed.status).toBe(415);
    expect(renamed.body?.error).toMatch(/H\.264/);

    const tooBig = await call(startVideoUpload, "http://localhost/api/media/upload", auth("token-a", {
      method: "POST",
      body: JSON.stringify({ fileName: "huge.mp4", sizeBytes: MAX_VIDEO_BYTES + 1 }),
    }));
    expect(tooBig.status).toBe(413);
    expect(tooBig.body?.error).toMatch(/50 MB/);

    const tooLong = await call(startVideoUpload, "http://localhost/api/media/upload", auth("token-a", {
      method: "POST",
      body: JSON.stringify({ fileName: "long.mp4", sizeBytes: 1000 }),
    }));
    store.objects.set(tooLong.body.path, fixture("h264-aac.mp4"));
    const rejectedProbe = await call(completeVideoUpload, "http://localhost/api/media/upload/complete", auth("token-a", {
      method: "POST",
      body: JSON.stringify({
        mediaId: tooLong.body.mediaId,
        fileName: "long.mp4",
        durationMs: 181_000,
        width: 160,
        height: 120,
        thumbnailBase64: Buffer.from(jpeg(8, 8)).toString("base64"),
      }),
    }));
    expect(rejectedProbe.status).toBe(415);
    expect(rejectedProbe.body?.error).toMatch(/3 minutes/);

    const created = await call(createPair, "http://localhost/api/player/pair", { method: "POST", body: "{}" });
    const { sessionId, code, secret } = created.body as { sessionId: string; code: string; secret: string };
    const claimed = await call(claimPair, "http://localhost/api/displays/pair", auth("token-a", {
      method: "POST",
      body: JSON.stringify({ code, name: "Counter" }),
    }));
    const displayId = claimed.body?.id as string;
    const paired = await call(pairStatus, "http://localhost/api/player/pair/status", {
      method: "POST",
      body: JSON.stringify({ sessionId, secret }),
    });
    const token = paired.body?.token as string;
    const image = await upload("token-a", "still.png", jpeg(8, 8));
    const imageId = image.body?.id as string;

    const direct = await call(updateDisplay, `http://localhost/api/displays/${displayId}`, auth("token-a", {
      method: "PATCH",
      body: JSON.stringify({ mediaId }),
    }), displayId);
    expect(direct.status).toBe(400);
    expect(direct.body?.error).toMatch(/playlist/);

    const made = await call(createPlaylist, "http://localhost/api/playlists", auth("token-a", {
      method: "POST",
      body: JSON.stringify({ name: "Mixed" }),
    }));
    const playlistId = made.body?.id as string;
    const saved = await call(savePlaylist, `http://localhost/api/playlists/${playlistId}`, auth("token-a", {
      method: "PATCH",
      body: JSON.stringify({
        name: "Mixed",
        defaultDurationMs: 5000,
        transition: "none",
        items: [
          { mediaId: imageId, durationMs: 2000 },
          { mediaId, durationMs: null },
          { mediaId: silent.body?.id, durationMs: null },
        ],
      }),
    }), playlistId);
    expect(saved.status).toBe(200);
    const published = await call(publishPlaylist, `http://localhost/api/playlists/${playlistId}/publish`, auth("token-a", {
      method: "POST",
      body: JSON.stringify({ displayIds: [displayId] }),
    }), playlistId);
    expect(published.status).toBe(200);
    const playing = await call(playerState, "http://localhost/api/player/state?v=0", { headers: { "X-Display-Token": token } });
    expect(playing.body.playlist.items.map((item: { mediaId: string; kind: string; durationMs: number }) => [item.mediaId, item.kind, item.durationMs])).toEqual([
      [imageId, "image", 2000],
      [mediaId, "video", 5000],
      [silent.body?.id, "video", 5000],
    ]);

    const blocked = await call(deleteMedia, `http://localhost/api/media/${mediaId}`, auth("token-a", { method: "DELETE" }), mediaId);
    expect(blocked.status).toBe(409);
    expect(store.media.some((item) => item.id === mediaId)).toBe(true);

    const dropped = await call(savePlaylist, `http://localhost/api/playlists/${playlistId}`, auth("token-a", {
      method: "PATCH",
      body: JSON.stringify({
        name: "Mixed",
        defaultDurationMs: 5000,
        transition: "none",
        items: [{ mediaId: imageId, durationMs: 2000 }],
      }),
    }), playlistId);
    expect(dropped.status).toBe(200);
    const stillBlocked = await call(deleteMedia, `http://localhost/api/media/${mediaId}`, auth("token-a", { method: "DELETE" }), mediaId);
    expect(stillBlocked.status).toBe(409);

    await call(publishPlaylist, `http://localhost/api/playlists/${playlistId}/publish`, auth("token-a", {
      method: "POST",
      body: JSON.stringify({ displayIds: [displayId] }),
    }), playlistId);
    const removed = await call(deleteMedia, `http://localhost/api/media/${mediaId}`, auth("token-a", { method: "DELETE" }), mediaId);
    expect(removed.status).toBe(200);
    expect(store.media.some((item) => item.id === mediaId)).toBe(false);
    expect([...store.objects.keys()].some((path) => path.includes(mediaId))).toBe(false);

    const hidden = await call(listMedia, "http://localhost/api/media", auth("token-b"));
    expect(JSON.stringify(hidden.body)).not.toContain(String(silent.body?.id));
    expect(JSON.stringify(hidden.body)).not.toContain("thumb");
    const steal = await call(deleteMedia, `http://localhost/api/media/${silent.body?.id}`, auth("token-b", { method: "DELETE" }), silent.body?.id);
    expect(steal.status).toBe(404);

    const reported = await call(reportPlayer, "http://localhost/api/player/state", {
      method: "POST",
      headers: { "X-Display-Token": token, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "This video can't play on this TV." }),
    });
    expect(reported.status).toBe(200);
    const displays = await call(listDisplays, "http://localhost/api/displays", auth("token-a"));
    expect(displays.body[0].playerError).toMatch(/can't play/);
    const cleared = await call(reportPlayer, "http://localhost/api/player/state", {
      method: "POST",
      headers: { "X-Display-Token": token, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "" }),
    });
    expect(cleared.status).toBe(200);
    const after = await call(listDisplays, "http://localhost/api/displays", auth("token-a"));
    expect(after.body[0].playerError).toBeNull();

    const held = await call(updateDisplay, `http://localhost/api/displays/${displayId}`, auth("token-a", {
      method: "PATCH",
      body: JSON.stringify({ mediaId: imageId }),
    }), displayId);
    expect(held.status).toBe(200);
    const single = await call(playerState, "http://localhost/api/player/state?v=2", { headers: { "X-Display-Token": token } });
    expect(single.body.mediaId).toBe(imageId);
    expect(single.body.playlist).toBeUndefined();
  });
});

async function uploadVideo(token: string, name: string, bytes: Uint8Array) {
  const started = await call(startVideoUpload, "http://localhost/api/media/upload", auth(token, {
    method: "POST",
    body: JSON.stringify({ fileName: name, sizeBytes: bytes.length }),
  }));
  if (started.status !== 201) return started;
  store.objects.set(started.body.path as string, bytes);
  return call(completeVideoUpload, "http://localhost/api/media/upload/complete", auth(token, {
    method: "POST",
    body: JSON.stringify({
      mediaId: started.body.mediaId,
      fileName: name,
      durationMs: 1000,
      width: 160,
      height: 120,
      thumbnailBase64: Buffer.from(jpeg(8, 8)).toString("base64"),
    }),
  }));
}
