import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { setTestDb } from "@/lib/server/supabase";
import { setScheduleClock } from "@/lib/server/schedule";
import { GET as me } from "@/app/api/me/route";
import { POST as createPair } from "@/app/api/player/pair/route";
import { POST as pairStatus } from "@/app/api/player/pair/status/route";
import { GET as playerState } from "@/app/api/player/state/route";
import { POST as claimPair } from "@/app/api/displays/pair/route";
import { GET as listDisplays } from "@/app/api/displays/route";
import { PATCH as updateDisplay } from "@/app/api/displays/[id]/route";
import { POST as uploadMedia } from "@/app/api/media/route";
import { POST as createPlaylist } from "@/app/api/playlists/route";
import { PATCH as savePlaylist } from "@/app/api/playlists/[id]/route";
import { POST as snapshotPlaylist } from "@/app/api/playlists/[id]/snapshot/route";
import { GET as listLocations, POST as createLocation } from "@/app/api/locations/route";
import { PATCH as updateLocation, DELETE as deleteLocation } from "@/app/api/locations/[id]/route";
import { POST as createGroup } from "@/app/api/screen-groups/route";
import { GET as listSchedules, POST as createSchedule } from "@/app/api/schedules/route";
import { GET as previewSchedule } from "@/app/api/schedules/preview/route";
import { createFakeDb, type Store } from "./fake-db";
import { jpeg } from "../helpers/bytes";
import { DELETE as deleteDisplay } from "@/app/api/displays/[id]/route";
import { DELETE as deleteMedia } from "@/app/api/media/[id]/route";
import { GET as getPlaylist, DELETE as deletePlaylist } from "@/app/api/playlists/[id]/route";
import { POST as publishPlaylist } from "@/app/api/playlists/[id]/publish/route";
import { PATCH as updateSchedule, DELETE as deleteSchedule } from "@/app/api/schedules/[id]/route";
import { PATCH as updateGroup, DELETE as deleteGroup } from "@/app/api/screen-groups/[id]/route";

// Milestone A security audit: every id-taking route, and every id inside a body,
// must treat another account's ids as "not found" and leave that account's rows untouched.

let store: Store;
beforeEach(() => {
  const fake = createFakeDb();
  store = fake.store;
  setTestDb(fake.client);
  setScheduleClock(null);
  fake.addUser("token-a", "11111111-1111-4111-8111-111111111111", "cafe@example.com");
  fake.addUser("token-b", "22222222-2222-4222-8222-222222222222", "other@example.com");
});
afterEach(() => setScheduleClock(null));
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
const body = (token: string, method: string, data?: unknown) =>
  auth(token, { method, body: data === undefined ? undefined : JSON.stringify(data) });

async function upload(token: string, name: string) {
  const form = new FormData();
  form.set("file", new Blob([new Uint8Array(jpeg(80, 60))]), "image.bin");
  form.set("name", name);
  return call(uploadMedia, "http://localhost/api/media", auth(token, { method: "POST", body: form }));
}
async function pairScreen(token: string, name: string) {
  const created = await call(createPair, "http://localhost/api/player/pair", { method: "POST", body: "{}" });
  const { sessionId, code, secret } = created.body;
  const claimed = await call(claimPair, "http://localhost/api/displays/pair", body(token, "POST", { code, name }));
  const paired = await call(pairStatus, "http://localhost/api/player/pair/status", { method: "POST", body: JSON.stringify({ sessionId, secret }) });
  return { displayId: claimed.body.id as string, token: paired.body.token as string };
}
async function playlist(token: string, name: string, mediaId: string) {
  const made = await call(createPlaylist, "http://localhost/api/playlists", body(token, "POST", { name }));
  const id = made.body.id as string;
  await call(savePlaylist, `http://localhost/api/playlists/${id}`, body(token, "PATCH", { name, transition: "none", defaultDurationMs: 1000, items: [{ mediaId, durationMs: 1000 }] }), id);
  expect((await call(snapshotPlaylist, `http://localhost/api/playlists/${id}/snapshot`, body(token, "POST"), id)).status).toBe(200);
  return id;
}

describe("cross-account isolation (API)", () => {
  it("never lets account B read, change, delete or reference account A's things", async () => {
    await call(me, "http://localhost/api/me", auth("token-a"));
    await call(me, "http://localhost/api/me", auth("token-b"));
    const a = await pairScreen("token-a", "A counter");
    const b = await pairScreen("token-b", "B counter");
    const aMedia = (await upload("token-a", "a.png")).body.id as string;
    const bMedia = (await upload("token-b", "b.png")).body.id as string;
    const aPlaylist = await playlist("token-a", "A menu", aMedia);
    const bPlaylist = await playlist("token-b", "B menu", bMedia);
    const aLocation = (await call(createLocation, "http://localhost/api/locations", body("token-a", "POST", { name: "A kitchen" }))).body.id as string;
    const aGroup = (await call(createGroup, "http://localhost/api/screen-groups", body("token-a", "POST", { name: "A group", displayIds: [a.displayId] }))).body.id as string;
    const aSchedule = (await call(createSchedule, "http://localhost/api/schedules", body("token-a", "POST", {
      name: "A lunch", playlistId: aPlaylist, displayId: a.displayId, weekdays: [1, 2, 3], startTime: "11:00", endTime: "14:00",
    }))).body.id as string;
    for (const id of [aMedia, aPlaylist, aLocation, aGroup, aSchedule]) expect(id).toBeTruthy();
    const before = JSON.stringify(store);

    const denied = (status: number) => expect([400, 403, 404]).toContain(status);

    // Direct access by id.
    denied((await call(updateDisplay, "http://x/api/displays", body("token-b", "PATCH", { name: "hacked" }), a.displayId)).status);
    denied((await call(deleteDisplay, "http://x/api/displays", body("token-b", "DELETE"), a.displayId)).status);
    denied((await call(deleteMedia, "http://x/api/media", body("token-b", "DELETE"), aMedia)).status);
    denied((await call(getPlaylist, "http://x/api/playlists", auth("token-b"), aPlaylist)).status);
    denied((await call(savePlaylist, "http://x/api/playlists", body("token-b", "PATCH", { name: "hacked", items: [] }), aPlaylist)).status);
    denied((await call(deletePlaylist, "http://x/api/playlists", body("token-b", "DELETE"), aPlaylist)).status);
    denied((await call(snapshotPlaylist, "http://x/api/playlists", body("token-b", "POST"), aPlaylist)).status);
    denied((await call(publishPlaylist, "http://x/api/playlists", body("token-b", "POST", { displayIds: [b.displayId] }), aPlaylist)).status);
    denied((await call(updateLocation, "http://x/api/locations", body("token-b", "PATCH", { name: "hacked" }), aLocation)).status);
    denied((await call(deleteLocation, "http://x/api/locations", body("token-b", "DELETE"), aLocation)).status);
    denied((await call(updateGroup, "http://x/api/screen-groups", body("token-b", "PATCH", { name: "hacked" }), aGroup)).status);
    denied((await call(deleteGroup, "http://x/api/screen-groups", body("token-b", "DELETE"), aGroup)).status);
    denied((await call(updateSchedule, "http://x/api/schedules", body("token-b", "PATCH", { name: "hacked" }), aSchedule)).status);
    denied((await call(deleteSchedule, "http://x/api/schedules", body("token-b", "DELETE"), aSchedule)).status);
    denied((await call(previewSchedule, `http://x/api/schedules/preview?displayId=${a.displayId}&days=1`, auth("token-b"))).status);

    // A's ids smuggled inside B's own requests.
    denied((await call(updateDisplay, "http://x", body("token-b", "PATCH", { mediaId: aMedia }), b.displayId)).status);
    denied((await call(updateDisplay, "http://x", body("token-b", "PATCH", { playlistId: aPlaylist }), b.displayId)).status);
    denied((await call(updateDisplay, "http://x", body("token-b", "PATCH", { locationId: aLocation }), b.displayId)).status);
    denied((await call(savePlaylist, "http://x", body("token-b", "PATCH", { name: "B menu", transition: "none", defaultDurationMs: 1000, items: [{ mediaId: aMedia, durationMs: 1000 }] }), bPlaylist)).status);
    denied((await call(publishPlaylist, "http://x", body("token-b", "POST", { displayIds: [a.displayId] }), bPlaylist)).status);
    denied((await call(createGroup, "http://x", body("token-b", "POST", { name: "steal", displayIds: [a.displayId] }))).status);
    denied((await call(createSchedule, "http://x", body("token-b", "POST", { name: "steal", playlistId: bPlaylist, displayId: a.displayId, weekdays: [1], startTime: "00:00", endTime: "24:00" }))).status);
    denied((await call(createSchedule, "http://x", body("token-b", "POST", { name: "steal", playlistId: aPlaylist, displayId: b.displayId, weekdays: [1], startTime: "00:00", endTime: "24:00" }))).status);
    denied((await call(createSchedule, "http://x", body("token-b", "POST", { name: "steal", playlistId: bPlaylist, groupId: aGroup, weekdays: [1], startTime: "00:00", endTime: "24:00" }))).status);

    // Lists only ever show your own rows.
    const lists = await Promise.all([
      call(listDisplays, "http://x", auth("token-b")),
      call(listLocations, "http://x", auth("token-b")),
      call(listSchedules, "http://x", auth("token-b")),
    ]);
    const text = JSON.stringify(lists.map((l) => l.body));
    for (const id of [a.displayId, aMedia, aPlaylist, aLocation, aGroup, aSchedule]) expect(text).not.toContain(id);

    // A's rows are untouched by everything above.
    const strip = (s: string) => JSON.parse(s, (k, v) => (k === "rate_limits" || k === "window_start" || k === "count" ? undefined : v));
    expect(strip(JSON.stringify(store))).toEqual(strip(before));
    // A's player still sees A's content only, and A's rows are byte-identical.
    const shown = await call(playerState, "http://x/api/player/state?v=", { headers: { "X-Display-Token": a.token } });
    expect(shown.status).toBe(200);
    expect(JSON.stringify(shown.body)).not.toContain(bMedia);
  });
});
