import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setTestDb } from "@/lib/server/supabase";
import { setScheduleClock } from "@/lib/server/schedule";
import {
  CREATE_GROUP_MAX_PER_USER,
  CREATE_GROUP_RATE_MESSAGE,
  CREATE_LOCATION_MAX_PER_USER,
  CREATE_LOCATION_RATE_MESSAGE,
  CREATE_SCHEDULE_MAX_PER_USER,
  CREATE_SCHEDULE_RATE_MESSAGE,
  CREATE_WINDOW_SECONDS,
  PUBLISH_MAX_PER_USER,
  PUBLISH_RATE_MESSAGE,
  PUBLISH_WINDOW_SECONDS,
  UPLOAD_MAX_PER_USER,
  UPLOAD_RATE_MESSAGE,
  UPLOAD_WINDOW_SECONDS,
} from "@/lib/server/limits";
import { GET as overview } from "@/app/api/overview/route";
import { GET as cleanupUploads } from "@/app/api/cron/orphan-uploads/route";
import { POST as createPair } from "@/app/api/player/pair/route";
import { POST as pairStatus } from "@/app/api/player/pair/status/route";
import { GET as playerState } from "@/app/api/player/state/route";
import { POST as claimPair } from "@/app/api/displays/pair/route";
import { GET as listDisplays, } from "@/app/api/displays/route";
import { PATCH as updateDisplay, DELETE as disconnectDisplay } from "@/app/api/displays/[id]/route";
import { POST as uploadMedia } from "@/app/api/media/route";
import { POST as startVideoUpload } from "@/app/api/media/upload/route";
import { POST as completeVideoUpload } from "@/app/api/media/upload/complete/route";
import { POST as createPlaylist } from "@/app/api/playlists/route";
import { PATCH as savePlaylist } from "@/app/api/playlists/[id]/route";
import { POST as publishPlaylist } from "@/app/api/playlists/[id]/publish/route";
import { POST as snapshotPlaylist } from "@/app/api/playlists/[id]/snapshot/route";
import { POST as createLocation } from "@/app/api/locations/route";
import { POST as createGroup } from "@/app/api/screen-groups/route";
import { POST as createSchedule, } from "@/app/api/schedules/route";
import { PATCH as updateSchedule } from "@/app/api/schedules/[id]/route";
import { GET as previewSchedule } from "@/app/api/schedules/preview/route";
import { createFakeDb, type Store } from "./fake-db";
import { jpeg } from "../helpers/bytes";
import { MAX_VIDEO_BYTES } from "@/lib/mp4";

const previousCron = process.env.CRON_SECRET;
let store: Store;

beforeEach(() => {
  delete process.env.CRON_SECRET;
  const fake = createFakeDb();
  store = fake.store;
  setTestDb(fake.client);
  setScheduleClock(null);
  fake.addUser("token-a", "11111111-1111-4111-8111-111111111111", "cafe@example.com");
  fake.addUser("token-b", "22222222-2222-4222-8222-222222222222", "other@example.com");
});

afterEach(() => {
  setScheduleClock(null);
  if (previousCron === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = previousCron;
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
  return { status: res.status, body: body as JsonBody, headers: res.headers };
}

function expectRetry(
  res: { status: number; body: JsonBody; headers: Headers },
  windowSeconds: number,
  message: string,
) {
  expect(res.status).toBe(429);
  expect(res.body).toEqual({ error: message });
  expect(res.headers.get("cache-control")).toBe("no-store");
  const retry = Number(res.headers.get("Retry-After"));
  expect(Number.isInteger(retry)).toBe(true);
  expect(retry).toBeGreaterThan(0);
  expect(retry).toBeLessThanOrEqual(windowSeconds);
}

function toBlob(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy]);
}

async function upload(token: string, name: string) {
  const form = new FormData();
  form.set("file", toBlob(jpeg(40, 30)), "image.bin");
  form.set("name", name);
  return call(uploadMedia, "http://localhost/api/media", auth(token, { method: "POST", body: form }));
}

async function pairScreen(name: string) {
  const created = await call(createPair, "http://localhost/api/player/pair", { method: "POST", body: "{}" });
  const { sessionId, code, secret } = created.body as { sessionId: string; code: string; secret: string };
  const claimed = await call(claimPair, "http://localhost/api/displays/pair", auth("token-a", {
    method: "POST",
    body: JSON.stringify({ code, name }),
  }));
  const paired = await call(pairStatus, "http://localhost/api/player/pair/status", {
    method: "POST",
    body: JSON.stringify({ sessionId, secret }),
  });
  return { displayId: claimed.body.id as string, token: paired.body.token as string };
}

async function savedPlaylist(name: string, mediaId: string) {
  const made = await call(createPlaylist, "http://localhost/api/playlists", auth("token-a", {
    method: "POST",
    body: JSON.stringify({ name }),
  }));
  const id = made.body.id as string;
  const saved = await call(savePlaylist, `http://localhost/api/playlists/${id}`, auth("token-a", {
    method: "PATCH",
    body: JSON.stringify({ name, transition: "none", defaultDurationMs: 1000, items: [{ mediaId, durationMs: 1000 }] }),
  }), id);
  expect(saved.status).toBe(200);
  return id;
}

function scheduleBody(playlistId: string, displayId: string, name = "Lunch") {
  return {
    name,
    playlistId,
    displayId,
    weekdays: [1, 2, 3, 4, 5, 6, 7],
    startTime: "11:00",
    endTime: "14:00",
  };
}

function stageOrphans() {
  const accountId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const mediaId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const keptVideo = `${accountId}/${mediaId}.mp4`;
  const keptThumb = `${accountId}/${mediaId}-thumb.jpg`;
  const orphanVideo = `${accountId}/${crypto.randomUUID()}.mp4`;
  const orphanThumb = `${accountId}/${crypto.randomUUID()}-thumb.jpg`;
  const young = `${accountId}/${crypto.randomUUID()}.mp4`;
  const undated = `${accountId}/${crypto.randomUUID()}.jpg`;
  const nonsense = `${accountId}/${crypto.randomUUID()}.png`;
  const old = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
  const recent = new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString();
  for (const path of [keptVideo, keptThumb, orphanVideo, orphanThumb, young, undated, nonsense]) {
    store.objects.set(path, new Uint8Array([1, 2, 3]));
  }
  store.objectTimes.set(keptVideo, old);
  store.objectTimes.set(keptThumb, old);
  store.objectTimes.set(orphanVideo, old);
  store.objectTimes.set(orphanThumb, old);
  store.objectTimes.set(young, recent);
  store.objectTimes.set(undated, null);
  store.objectTimes.set(nonsense, "not-a-date");
  store.media.push({
    id: mediaId,
    account_id: accountId,
    file_name: "kept.mp4",
    storage_path: keptVideo,
    thumbnail_path: keptThumb,
    mime_type: "video/mp4",
    size_bytes: 3,
    kind: "video",
    created_at: old,
  });
  return { keptVideo, keptThumb, orphanVideo, orphanThumb, young, undated, nonsense };
}

describe("clear a screen location", () => {
  it("accepts locationId null, falls back to UTC, and leaves the other branches alone", async () => {
    const { displayId, token } = await pairScreen("Front counter");
    const image = await upload("token-a", "everyday.png");
    const other = await upload("token-a", "other.png");
    await call(updateDisplay, `http://localhost/api/displays/${displayId}`, auth("token-a", {
      method: "PATCH",
      body: JSON.stringify({ mediaId: image.body.id }),
    }), displayId);
    const version = store.displays[0].content_version;

    const created = await call(createLocation, "http://localhost/api/locations", auth("token-a", {
      method: "POST",
      body: JSON.stringify({ name: "Kitchen", timezone: "America/Los_Angeles" }),
    }));
    const locationId = created.body.id as string;
    const moved = await call(updateDisplay, `http://localhost/api/displays/${displayId}`, auth("token-a", {
      method: "PATCH",
      body: JSON.stringify({ locationId }),
    }), displayId);
    expect(moved.status).toBe(200);
    expect(moved.body).toEqual({ ok: true });

    const playlistId = await savedPlaylist("Lunch", image.body.id as string);
    const snap = await call(snapshotPlaylist, `http://localhost/api/playlists/${playlistId}/snapshot`, auth("token-a", { method: "POST" }), playlistId);
    expect(snap.status).toBe(200);
    const scheduled = await call(createSchedule, "http://localhost/api/schedules", auth("token-a", {
      method: "POST",
      body: JSON.stringify(scheduleBody(playlistId, displayId)),
    }));
    expect(scheduled.status).toBe(201);

    setScheduleClock(() => new Date("2026-10-28T18:30:00.000Z"));
    const inLa = await call(playerState, "http://localhost/api/player/state", { headers: { "X-Display-Token": token } });
    expect(inLa.body.playlist.id).toBe(playlistId);

    const cleared = await call(updateDisplay, `http://localhost/api/displays/${displayId}`, auth("token-a", {
      method: "PATCH",
      body: JSON.stringify({ locationId: null }),
    }), displayId);
    expect(cleared.status).toBe(200);
    expect(cleared.body).toEqual({ ok: true });
    expect(store.displays[0].location_id).toBeNull();
    expect(store.displays[0].content_version).toBe(version);
    expect(store.displays[0].name).toBe("Front counter");
    const listed = await call(listDisplays, "http://localhost/api/displays", auth("token-a"));
    expect(listed.body[0].location).toBeNull();
    expect(listed.body[0].name).toBe("Front counter");

    const preview = await call(previewSchedule, `http://localhost/api/schedules/preview?displayId=${displayId}&days=1`, auth("token-a"));
    expect(preview.status).toBe(200);
    expect(preview.body.timezone).toBe("UTC");

    const outsideUtc = await call(playerState, "http://localhost/api/player/state", { headers: { "X-Display-Token": token } });
    expect(outsideUtc.body.playlist).toBeUndefined();
    expect(outsideUtc.body.mediaId).toBe(image.body.id);

    setScheduleClock(() => new Date("2026-10-28T12:30:00.000Z"));
    const insideUtc = await call(playerState, "http://localhost/api/player/state", { headers: { "X-Display-Token": token } });
    expect(insideUtc.body.playlist.id).toBe(playlistId);

    const movedBack = await call(updateDisplay, `http://localhost/api/displays/${displayId}`, auth("token-a", {
      method: "PATCH",
      body: JSON.stringify({ locationId }),
    }), displayId);
    expect(movedBack.status).toBe(200);
    const mediaWins = await call(updateDisplay, `http://localhost/api/displays/${displayId}`, auth("token-a", {
      method: "PATCH",
      body: JSON.stringify({ mediaId: other.body.id, locationId: null }),
    }), displayId);
    expect(mediaWins.status).toBe(200);
    expect(store.displays[0].assigned_media_id).toBe(other.body.id);
    expect(store.displays[0].location_id).toBe(locationId);

    const foreign = await call(updateDisplay, `http://localhost/api/displays/${displayId}`, auth("token-b", {
      method: "PATCH",
      body: JSON.stringify({ locationId: null }),
    }), displayId);
    expect(foreign.status).toBe(404);
    expect(store.displays[0].location_id).toBe(locationId);

    const bad = await call(updateDisplay, `http://localhost/api/displays/${displayId}`, auth("token-a", {
      method: "PATCH",
      body: JSON.stringify({ locationId: "not-a-uuid" }),
    }), displayId);
    expect(bad.status).toBe(404);
    expect(bad.body.error).toMatch(/Location/);

    const empty = await call(updateDisplay, `http://localhost/api/displays/${displayId}`, auth("token-a", {
      method: "PATCH",
      body: JSON.stringify({}),
    }), displayId);
    expect(empty.status).toBe(400);

    const missingId = crypto.randomUUID();
    const missing = await call(updateDisplay, `http://localhost/api/displays/${missingId}`, auth("token-a", {
      method: "PATCH",
      body: JSON.stringify({ locationId: null }),
    }), missingId);
    expect(missing.status).toBe(404);

    const renamed = await call(updateDisplay, `http://localhost/api/displays/${displayId}`, auth("token-a", {
      method: "PATCH",
      body: JSON.stringify({ locationId: null, name: "Lobby" }),
    }), displayId);
    expect(renamed.status).toBe(200);
    expect(store.displays[0].location_id).toBeNull();
    expect(store.displays[0].name).toBe("Lobby");
  });
});

describe("write rate limits", () => {
  it("limits image uploads per user and still accepts another user's upload", async () => {
    for (let i = 0; i < UPLOAD_MAX_PER_USER; i++) {
      const res = await upload("token-a", `img-${i}.png`);
      expect(res.status).toBe(201);
      expect(typeof res.body.id).toBe("string");
    }
    expect(store.objects.size).toBe(UPLOAD_MAX_PER_USER);
    const blocked = await upload("token-a", "one-more.png");
    expectRetry(blocked, UPLOAD_WINDOW_SECONDS, UPLOAD_RATE_MESSAGE);
    expect(store.objects.size).toBe(UPLOAD_MAX_PER_USER);

    const form = new FormData();
    form.set("file", new Blob([new TextEncoder().encode("<html></html>")]), "x.bin");
    form.set("name", "x.html");
    const rejected = await call(uploadMedia, "http://localhost/api/media", auth("token-a", { method: "POST", body: form }));
    expect(rejected.status).toBe(415);

    const other = await upload("token-b", "theirs.png");
    expect(other.status).toBe(201);
    const init = await call(startVideoUpload, "http://localhost/api/media/upload", auth("token-a", {
      method: "POST",
      body: JSON.stringify({ sizeBytes: 1000 }),
    }));
    expect(init.status).toBe(201);
  });

  it("limits video upload init separately from a rejected size", async () => {
    for (let i = 0; i < UPLOAD_MAX_PER_USER; i++) {
      const res = await call(startVideoUpload, "http://localhost/api/media/upload", auth("token-a", {
        method: "POST",
        body: JSON.stringify({ sizeBytes: 1000 }),
      }));
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ token: expect.any(String), signedUrl: expect.any(String) });
    }
    const blocked = await call(startVideoUpload, "http://localhost/api/media/upload", auth("token-a", {
      method: "POST",
      body: JSON.stringify({ sizeBytes: 1000 }),
    }));
    expectRetry(blocked, UPLOAD_WINDOW_SECONDS, UPLOAD_RATE_MESSAGE);
    const tooBig = await call(startVideoUpload, "http://localhost/api/media/upload", auth("token-a", {
      method: "POST",
      body: JSON.stringify({ sizeBytes: MAX_VIDEO_BYTES + 1 }),
    }));
    expect(tooBig.status).toBe(413);
  });

  it("limits video upload complete without deleting a saved row", async () => {
    const started = await call(startVideoUpload, "http://localhost/api/media/upload", auth("token-a", {
      method: "POST",
      body: JSON.stringify({ sizeBytes: 1000 }),
    }));
    expect(started.status).toBe(201);
    const mediaId = started.body.mediaId as string;
    const bytes = new Uint8Array(readFileSync(new URL("../fixtures/h264-aac.mp4", import.meta.url)));
    store.objects.set(started.body.path as string, bytes);
    const done = await call(completeVideoUpload, "http://localhost/api/media/upload/complete", auth("token-a", {
      method: "POST",
      body: JSON.stringify({
        mediaId,
        fileName: "loop.mp4",
        durationMs: 1000,
        width: 160,
        height: 120,
        thumbnailBase64: Buffer.from(jpeg(8, 8)).toString("base64"),
      }),
    }));
    expect(done.status).toBe(201);

    for (let i = 0; i < UPLOAD_MAX_PER_USER - 1; i++) {
      const miss = await call(completeVideoUpload, "http://localhost/api/media/upload/complete", auth("token-a", {
        method: "POST",
        body: JSON.stringify({
          mediaId: crypto.randomUUID(),
          durationMs: 1000,
          width: 160,
          height: 120,
          thumbnailBase64: Buffer.from(jpeg(8, 8)).toString("base64"),
        }),
      }));
      expect(miss.status).toBe(400);
    }
    const blocked = await call(completeVideoUpload, "http://localhost/api/media/upload/complete", auth("token-a", {
      method: "POST",
      body: JSON.stringify({
        mediaId: crypto.randomUUID(),
        durationMs: 1000,
        width: 160,
        height: 120,
        thumbnailBase64: Buffer.from(jpeg(8, 8)).toString("base64"),
      }),
    }));
    expectRetry(blocked, UPLOAD_WINDOW_SECONDS, UPLOAD_RATE_MESSAGE);
    expect(store.media.some((row) => row.id === mediaId)).toBe(true);
    expect(store.objects.has(started.body.path as string)).toBe(true);

    const malformed = await call(completeVideoUpload, "http://localhost/api/media/upload/complete", auth("token-a", {
      method: "POST",
      body: JSON.stringify({ mediaId: "nope", durationMs: 1000, width: 160, height: 120 }),
    }));
    expect(malformed.status).toBe(400);
    const image = await upload("token-a", "still.png");
    expect(image.status).toBe(201);
  });

  it("limits publish and leaves snapshot on its own counter", async () => {
    const { displayId } = await pairScreen("Front counter");
    const image = await upload("token-a", "lunch.png");
    const playlistId = await savedPlaylist("Loop", image.body.id as string);
    for (let i = 0; i < PUBLISH_MAX_PER_USER; i++) {
      const res = await call(publishPlaylist, `http://localhost/api/playlists/${playlistId}/publish`, auth("token-a", {
        method: "POST",
        body: JSON.stringify({ displayIds: [displayId] }),
      }), playlistId);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    }
    const blocked = await call(publishPlaylist, `http://localhost/api/playlists/${playlistId}/publish`, auth("token-a", {
      method: "POST",
      body: JSON.stringify({ displayIds: [displayId] }),
    }), playlistId);
    expectRetry(blocked, PUBLISH_WINDOW_SECONDS, PUBLISH_RATE_MESSAGE);
    const invalid = await call(publishPlaylist, `http://localhost/api/playlists/${playlistId}/publish`, auth("token-a", {
      method: "POST",
      body: JSON.stringify({ displayIds: [] }),
    }), playlistId);
    expect(invalid.status).toBe(400);
    const snap = await call(snapshotPlaylist, `http://localhost/api/playlists/${playlistId}/snapshot`, auth("token-a", { method: "POST" }), playlistId);
    expect(snap.status).toBe(200);
    expect(snap.body).toEqual({ ok: true });
  });

  it("limits snapshot on its own counter", async () => {
    const image = await upload("token-a", "lunch.png");
    const playlistId = await savedPlaylist("Loop", image.body.id as string);
    for (let i = 0; i < PUBLISH_MAX_PER_USER; i++) {
      const res = await call(snapshotPlaylist, `http://localhost/api/playlists/${playlistId}/snapshot`, auth("token-a", { method: "POST" }), playlistId);
      expect(res.status).toBe(200);
    }
    const blocked = await call(snapshotPlaylist, `http://localhost/api/playlists/${playlistId}/snapshot`, auth("token-a", { method: "POST" }), playlistId);
    expectRetry(blocked, PUBLISH_WINDOW_SECONDS, PUBLISH_RATE_MESSAGE);
  });

  it("limits location creates above the account cap", async () => {
    let created = 0;
    let capped = 0;
    for (let i = 0; i < CREATE_LOCATION_MAX_PER_USER; i++) {
      const res = await call(createLocation, "http://localhost/api/locations", auth("token-a", {
        method: "POST",
        body: JSON.stringify({ name: `Room ${i}` }),
      }));
      if (res.status === 201) created += 1;
      else if (res.status === 400) capped += 1;
      else expect(res.status).toBe(201);
    }
    expect(created).toBeGreaterThan(0);
    expect(capped).toBeGreaterThan(0);
    expect(created + capped).toBe(CREATE_LOCATION_MAX_PER_USER);
    const blocked = await call(createLocation, "http://localhost/api/locations", auth("token-a", {
      method: "POST",
      body: JSON.stringify({ name: "One more" }),
    }));
    expectRetry(blocked, CREATE_WINDOW_SECONDS, CREATE_LOCATION_RATE_MESSAGE);
    const blank = await call(createLocation, "http://localhost/api/locations", auth("token-a", {
      method: "POST",
      body: JSON.stringify({ name: "  " }),
    }));
    expect(blank.status).toBe(400);
    expect(blank.body.error).toMatch(/name/);
  });

  it("limits screen-group creates above the account cap", async () => {
    let created = 0;
    let capped = 0;
    for (let i = 0; i < CREATE_GROUP_MAX_PER_USER; i++) {
      const res = await call(createGroup, "http://localhost/api/screen-groups", auth("token-a", {
        method: "POST",
        body: JSON.stringify({ name: `Group ${i}` }),
      }));
      if (res.status === 201) created += 1;
      else if (res.status === 400) capped += 1;
      else expect(res.status).toBe(201);
    }
    expect(created).toBeGreaterThan(0);
    expect(capped).toBeGreaterThan(0);
    expect(created + capped).toBe(CREATE_GROUP_MAX_PER_USER);
    const blocked = await call(createGroup, "http://localhost/api/screen-groups", auth("token-a", {
      method: "POST",
      body: JSON.stringify({ name: "One more group" }),
    }));
    expectRetry(blocked, CREATE_WINDOW_SECONDS, CREATE_GROUP_RATE_MESSAGE);
  });

  it("limits schedule creates above the account cap", async () => {
    const { displayId } = await pairScreen("Front counter");
    const image = await upload("token-a", "lunch.png");
    const playlistId = await savedPlaylist("Loop", image.body.id as string);
    const snap = await call(snapshotPlaylist, `http://localhost/api/playlists/${playlistId}/snapshot`, auth("token-a", { method: "POST" }), playlistId);
    expect(snap.status).toBe(200);
    let created = 0;
    let capped = 0;
    for (let i = 0; i < CREATE_SCHEDULE_MAX_PER_USER; i++) {
      const res = await call(createSchedule, "http://localhost/api/schedules", auth("token-a", {
        method: "POST",
        body: JSON.stringify(scheduleBody(playlistId, displayId, `Slot ${i}`)),
      }));
      if (res.status === 201) created += 1;
      else if (res.status === 400) capped += 1;
      else expect(res.status).toBe(201);
    }
    expect(created).toBeGreaterThan(0);
    expect(capped).toBeGreaterThan(0);
    expect(created + capped).toBe(CREATE_SCHEDULE_MAX_PER_USER);
    const blocked = await call(createSchedule, "http://localhost/api/schedules", auth("token-a", {
      method: "POST",
      body: JSON.stringify(scheduleBody(playlistId, displayId, "One more")),
    }));
    expectRetry(blocked, CREATE_WINDOW_SECONDS, CREATE_SCHEDULE_RATE_MESSAGE);
    const invalid = await call(createSchedule, "http://localhost/api/schedules", auth("token-a", {
      method: "POST",
      body: JSON.stringify({ name: "" }),
    }));
    expect(invalid.status).toBe(400);
  });
});

describe("orphaned uploads", () => {
  it("returns 503 and deletes nothing when CRON_SECRET is unset", async () => {
    const staged = stageOrphans();
    const lines: string[] = [];
    const spy = vi.spyOn(console, "info").mockImplementation((message) => { lines.push(String(message)); });
    try {
      const res = await call(cleanupUploads, "http://localhost/api/cron/orphan-uploads", {
        headers: { Authorization: "Bearer something" },
      });
      expect(res.status).toBe(503);
      expect(res.body).toEqual({ error: "Cleanup isn't configured." });
      expect(store.objects.has(staged.orphanVideo)).toBe(true);
      expect(lines.some((line) => line.includes("orphan-uploads"))).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  it("returns 401 for a bad secret and deletes nothing", async () => {
    process.env.CRON_SECRET = "test-secret";
    const staged = stageOrphans();
    const res = await call(cleanupUploads, "http://localhost/api/cron/orphan-uploads?dryRun=1", {
      headers: { Authorization: "Bearer wrong-secret" },
    });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Unauthorized." });
    expect(store.objects.has(staged.orphanVideo)).toBe(true);
    expect(store.objects.has(staged.keptVideo)).toBe(true);
  });

  it("dry-run logs orphans and never removes an object that has a media row", async () => {
    process.env.CRON_SECRET = "test-secret";
    const staged = stageOrphans();
    const lines: string[] = [];
    const spy = vi.spyOn(console, "info").mockImplementation((message) => { lines.push(String(message)); });
    try {
      const headers = { Authorization: "Bearer test-secret" };
      const res = await call(cleanupUploads, "http://localhost/api/cron/orphan-uploads?dryRun=1", { headers });
      expect(res.status).toBe(200);
      expect(res.body.dryRun).toBe(true);
      expect(res.body.deleted).toEqual([]);
      expect(res.body.wouldDelete).toEqual([staged.orphanThumb, staged.orphanVideo].sort());
      expect(res.body.scanned).toBe(7);
      expect(res.body.truncated).toBe(false);
      for (const path of [staged.keptVideo, staged.keptThumb, staged.young, staged.undated, staged.nonsense, staged.orphanVideo]) {
        expect(store.objects.has(path)).toBe(true);
      }
      expect(lines.some((line) => line === `orphan-uploads dry-run: would delete ${staged.orphanVideo}`)).toBe(true);
      expect(lines.some((line) => line === `orphan-uploads dry-run: would delete ${staged.orphanThumb}`)).toBe(true);
      expect(lines.some((line) => line.includes(staged.keptVideo))).toBe(false);
      expect(lines.some((line) => line.includes(staged.keptThumb))).toBe(false);

      const again = await call(cleanupUploads, "http://localhost/api/cron/orphan-uploads?dryRun=true", { headers });
      expect(again.status).toBe(200);
      expect(again.body.deleted).toEqual([]);
      expect(store.objects.has(staged.orphanVideo)).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  it("deletes old orphans and thumbs, and a second run deletes nothing", async () => {
    process.env.CRON_SECRET = "test-secret";
    const staged = stageOrphans();
    const lines: string[] = [];
    const spy = vi.spyOn(console, "info").mockImplementation((message) => { lines.push(String(message)); });
    try {
      const headers = { Authorization: "Bearer test-secret" };
      const res = await call(cleanupUploads, "http://localhost/api/cron/orphan-uploads", { headers });
      expect(res.status).toBe(200);
      expect(res.body.dryRun).toBe(false);
      expect(res.body.deleted).toEqual([staged.orphanThumb, staged.orphanVideo].sort());
      expect(res.body.wouldDelete).toEqual(res.body.deleted);
      expect(store.objects.has(staged.orphanVideo)).toBe(false);
      expect(store.objects.has(staged.orphanThumb)).toBe(false);
      expect(store.objects.has(staged.keptVideo)).toBe(true);
      expect(store.objects.has(staged.keptThumb)).toBe(true);
      expect(store.objects.has(staged.young)).toBe(true);
      expect(store.objects.has(staged.undated)).toBe(true);
      expect(store.objects.has(staged.nonsense)).toBe(true);
      expect(lines.some((line) => line === `orphan-uploads: deleted ${staged.orphanVideo}`)).toBe(true);
      expect(store.media).toHaveLength(1);

      const second = await call(cleanupUploads, "http://localhost/api/cron/orphan-uploads", { headers });
      expect(second.status).toBe(200);
      expect(second.body.deleted).toEqual([]);
      expect(second.body.wouldDelete).toEqual([]);
      expect(store.objects.has(staged.keptVideo)).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("GET /api/overview", () => {
  it("counts this account only", async () => {
    const unauthenticated = await call(overview, "http://localhost/api/overview");
    expect(unauthenticated.status).toBe(401);

    const front = await pairScreen("Front counter");
    const back = await pairScreen("Back counter");
    const spare = await pairScreen("Spare");
    await call(disconnectDisplay, `http://localhost/api/displays/${spare.displayId}`, auth("token-a", { method: "DELETE" }), spare.displayId);
    store.displays[0].last_seen_at = new Date(Date.now() - 5_000).toISOString();
    const revoked = store.displays.find((row) => row.id === spare.displayId);
    if (revoked) revoked.last_seen_at = new Date().toISOString();
    expect(back.displayId).toBeTruthy();

    const image = await upload("token-a", "lunch.png");
    const playlistId = await savedPlaylist("Loop", image.body.id as string);
    await call(snapshotPlaylist, `http://localhost/api/playlists/${playlistId}/snapshot`, auth("token-a", { method: "POST" }), playlistId);
    await call(createPlaylist, "http://localhost/api/playlists", auth("token-a", {
      method: "POST",
      body: JSON.stringify({ name: "Empty draft" }),
    }));
    const first = await call(createSchedule, "http://localhost/api/schedules", auth("token-a", {
      method: "POST",
      body: JSON.stringify(scheduleBody(playlistId, front.displayId, "Weekday")),
    }));
    const second = await call(createSchedule, "http://localhost/api/schedules", auth("token-a", {
      method: "POST",
      body: JSON.stringify(scheduleBody(playlistId, front.displayId, "Paused")),
    }));
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    const paused = await call(updateSchedule, `http://localhost/api/schedules/${second.body.id}`, auth("token-a", {
      method: "PATCH",
      body: JSON.stringify({ enabled: false }),
    }), second.body.id);
    expect(paused.status).toBe(200);

    const mine = await call(overview, "http://localhost/api/overview", auth("token-a"));
    expect(mine.status).toBe(200);
    expect(mine.body).toEqual({ screens: 2, online: 1, offline: 1, media: 1, playlists: 2, activeSchedules: 1 });
    expect(Object.keys(mine.body).sort()).toEqual(["activeSchedules", "media", "offline", "online", "playlists", "screens"]);

    const theirs = await call(overview, "http://localhost/api/overview", auth("token-b"));
    expect(theirs.status).toBe(200);
    expect(theirs.body).toEqual({ screens: 0, online: 0, offline: 0, media: 0, playlists: 0, activeSchedules: 0 });
  });
});
