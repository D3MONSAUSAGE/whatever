import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { setTestDb } from "@/lib/server/supabase";
import { setScheduleClock } from "@/lib/server/schedule";
import { GET as me } from "@/app/api/me/route";
import { POST as createPair } from "@/app/api/player/pair/route";
import { POST as pairStatus } from "@/app/api/player/pair/status/route";
import { GET as playerState } from "@/app/api/player/state/route";
import { POST as claimPair } from "@/app/api/displays/pair/route";
import { GET as listDisplays, } from "@/app/api/displays/route";
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

async function upload(token: string, name: string) {
  const form = new FormData();
  const copy = new Uint8Array(jpeg(80, 60));
  form.set("file", new Blob([copy]), "image.bin");
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

async function publishedPlaylist(name: string, mediaId: string) {
  const made = await call(createPlaylist, "http://localhost/api/playlists", auth("token-a", {
    method: "POST",
    body: JSON.stringify({ name }),
  }));
  const id = made.body.id as string;
  await call(savePlaylist, `http://localhost/api/playlists/${id}`, auth("token-a", {
    method: "PATCH",
    body: JSON.stringify({ name, transition: "none", defaultDurationMs: 1000, items: [{ mediaId, durationMs: 1000 }] }),
  }), id);
  const snap = await call(snapshotPlaylist, `http://localhost/api/playlists/${id}/snapshot`, auth("token-a", { method: "POST" }), id);
  expect(snap.status).toBe(200);
  return id;
}

describe("scheduling API", () => {
  it("keeps the player payload identical when no schedule exists", async () => {
    await call(me, "http://localhost/api/me", auth("token-a"));
    const { displayId, token } = await pairScreen("Front counter");
    const image = await upload("token-a", "lunch.png");
    await call(updateDisplay, `http://localhost/api/displays/${displayId}`, auth("token-a", {
      method: "PATCH",
      body: JSON.stringify({ mediaId: image.body.id }),
    }), displayId);
    const shown = await call(playerState, "http://localhost/api/player/state?v=", { headers: { "X-Display-Token": token } });
    expect(shown.body.version).toBe(1);
    expect(shown.body.playlist).toBeUndefined();
    expect(shown.body.nextTransitionAt).toBeUndefined();
    const unchanged = await call(playerState, "http://localhost/api/player/state?v=1", { headers: { "X-Display-Token": token } });
    expect(unchanged.body).toEqual({ version: 1, unchanged: true, pollMs: 30000 });
  });

  it("manages locations, moves a screen, and refuses to delete one that still has a screen", async () => {
    await call(me, "http://localhost/api/me", auth("token-a"));
    const { displayId } = await pairScreen("Front counter");
    const listed = await call(listLocations, "http://localhost/api/locations", auth("token-a"));
    expect(listed.body[0]).toMatchObject({ name: "Main location", timezone: "UTC", displayCount: 1 });

    const badZone = await call(createLocation, "http://localhost/api/locations", auth("token-a", {
      method: "POST",
      body: JSON.stringify({ name: "Nope", timezone: "Not/AZone" }),
    }));
    expect(badZone.status).toBe(400);

    const created = await call(createLocation, "http://localhost/api/locations", auth("token-a", {
      method: "POST",
      body: JSON.stringify({ name: "Kitchen", timezone: "America/Los_Angeles" }),
    }));
    expect(created.status).toBe(201);
    const locationId = created.body.id as string;
    const renamed = await call(updateLocation, `http://localhost/api/locations/${locationId}`, auth("token-a", {
      method: "PATCH",
      body: JSON.stringify({ name: "Kitchen line", timezone: "America/Los_Angeles" }),
    }), locationId);
    expect(renamed.status).toBe(200);

    const moved = await call(updateDisplay, `http://localhost/api/displays/${displayId}`, auth("token-a", {
      method: "PATCH",
      body: JSON.stringify({ locationId }),
    }), displayId);
    expect(moved.status).toBe(200);
    expect(store.displays[0].location_id).toBe(locationId);
    const displays = await call(listDisplays, "http://localhost/api/displays", auth("token-a"));
    expect(displays.body[0].location).toMatchObject({ id: locationId, name: "Kitchen line", timezone: "America/Los_Angeles" });
    expect(displays.body[0].name).toBe("Front counter");

    const blocked = await call(deleteLocation, `http://localhost/api/locations/${locationId}`, auth("token-a", { method: "DELETE" }), locationId);
    expect(blocked.status).toBe(409);
    expect(store.locations.some((location) => location.id === locationId)).toBe(true);

    const empty = await call(createLocation, "http://localhost/api/locations", auth("token-a", {
      method: "POST",
      body: JSON.stringify({ name: "Pop-up" }),
    }));
    const removed = await call(deleteLocation, `http://localhost/api/locations/${empty.body.id}`, auth("token-a", { method: "DELETE" }), empty.body.id);
    expect(removed.status).toBe(200);

    const foreign = await call(listLocations, "http://localhost/api/locations", auth("token-b"));
    expect(JSON.stringify(foreign.body)).not.toContain("Kitchen");
    const foreignDelete = await call(deleteLocation, `http://localhost/api/locations/${locationId}`, auth("token-b", { method: "DELETE" }), locationId);
    expect(foreignDelete.status).toBe(404);
  });

  it("plays a scheduled playlist during the window and the saved image outside it", async () => {
    await call(me, "http://localhost/api/me", auth("token-a"));
    const { displayId, token } = await pairScreen("Front counter");
    const everyday = await upload("token-a", "everyday.png");
    const special = await upload("token-a", "special.png");
    await call(updateDisplay, `http://localhost/api/displays/${displayId}`, auth("token-a", {
      method: "PATCH",
      body: JSON.stringify({ mediaId: everyday.body.id }),
    }), displayId);
    const playlistId = await publishedPlaylist("Lunch specials", special.body.id as string);
    const locationId = store.displays[0].location_id as string;
    await call(updateLocation, `http://localhost/api/locations/${locationId}`, auth("token-a", {
      method: "PATCH",
      body: JSON.stringify({ timezone: "America/Los_Angeles" }),
    }), locationId);

    const draftOnly = await call(createPlaylist, "http://localhost/api/playlists", auth("token-a", {
      method: "POST",
      body: JSON.stringify({ name: "Draft only" }),
    }));
    const refused = await call(createSchedule, "http://localhost/api/schedules", auth("token-a", {
      method: "POST",
      body: JSON.stringify({
        name: "Too early",
        playlistId: draftOnly.body.id,
        displayId,
        weekdays: [3],
        startTime: "11:00",
        endTime: "14:00",
      }),
    }));
    expect(refused.status).toBe(400);

    const made = await call(createSchedule, "http://localhost/api/schedules", auth("token-a", {
      method: "POST",
      body: JSON.stringify({
        name: "Weekday lunch",
        playlistId,
        displayId,
        weekdays: [3],
        startTime: "11:00",
        endTime: "14:00",
      }),
    }));
    expect(made.status).toBe(201);
    const contentVersion = store.displays[0].content_version;

    setScheduleClock(() => new Date("2026-10-28T18:30:00.000Z"));
    const playing = await call(playerState, "http://localhost/api/player/state?v=", { headers: { "X-Display-Token": token } });
    expect(playing.body.playlist.id).toBe(playlistId);
    expect(playing.body.playlist.items[0].mediaId).toBe(special.body.id);
    expect(playing.body.version).not.toBe(contentVersion);
    expect(playing.body.nextTransitionAt).toBe("2026-10-28T21:00:00.000Z");
    const listedNow = await call(listDisplays, "http://localhost/api/displays", auth("token-a"));
    expect(listedNow.body[0].currentSchedule).toEqual({
      id: made.body.id, name: "Weekday lunch", playlistId, playlistName: "Lunch specials",
      target: "display", priority: 0, managedBy: null, promoId: null, until: "2026-10-28T21:00:00.000Z",
    });
    expect(listedNow.body[0].activeSchedules).toHaveLength(1);
    expect(listedNow.body[0].media.id).toBe(everyday.body.id);
    const again = await call(playerState, `http://localhost/api/player/state?v=${playing.body.version}`, { headers: { "X-Display-Token": token } });
    expect(again.body.unchanged).toBe(true);
    expect(again.body.version).toBe(playing.body.version);

    setScheduleClock(() => new Date("2026-10-28T21:30:00.000Z"));
    const back = await call(playerState, `http://localhost/api/player/state?v=${playing.body.version}`, { headers: { "X-Display-Token": token } });
    expect(back.body.version).toBe(contentVersion);
    expect(back.body.playlist).toBeUndefined();
    expect(back.body.mediaId).toBe(everyday.body.id);
    const listedLater = await call(listDisplays, "http://localhost/api/displays", auth("token-a"));
    expect(listedLater.body[0].currentSchedule).toBeNull();
    expect(listedLater.body[0].activeSchedules).toEqual([]);
    expect(store.displays[0].assigned_media_id).toBe(everyday.body.id);
    expect(store.displays[0].content_version).toBe(contentVersion);
  });

  it("lets a screen rule beat a higher-priority group rule, including across midnight", async () => {
    await call(me, "http://localhost/api/me", auth("token-a"));
    const { displayId, token } = await pairScreen("Front counter");
    const everyday = await upload("token-a", "everyday.png");
    const groupImage = await upload("token-a", "group.png");
    const screenImage = await upload("token-a", "screen.png");
    await call(updateDisplay, `http://localhost/api/displays/${displayId}`, auth("token-a", {
      method: "PATCH",
      body: JSON.stringify({ mediaId: everyday.body.id }),
    }), displayId);
    const locationId = store.displays[0].location_id as string;
    await call(updateLocation, `http://localhost/api/locations/${locationId}`, auth("token-a", {
      method: "PATCH",
      body: JSON.stringify({ timezone: "America/Los_Angeles" }),
    }), locationId);
    const groupPlaylist = await publishedPlaylist("Group loop", groupImage.body.id as string);
    const screenPlaylist = await publishedPlaylist("Screen loop", screenImage.body.id as string);
    const group = await call(createGroup, "http://localhost/api/screen-groups", auth("token-a", {
      method: "POST",
      body: JSON.stringify({ name: "Front of house", displayIds: [displayId] }),
    }));
    expect(group.status).toBe(201);
    await call(createSchedule, "http://localhost/api/schedules", auth("token-a", {
      method: "POST",
      body: JSON.stringify({
        name: "Group lunch",
        playlistId: groupPlaylist,
        groupId: group.body.id,
        weekdays: [1, 2, 3, 4, 5],
        startTime: "11:00",
        endTime: "14:00",
        priority: 50,
      }),
    }));
    await call(createSchedule, "http://localhost/api/schedules", auth("token-a", {
      method: "POST",
      body: JSON.stringify({
        name: "Screen lunch",
        playlistId: screenPlaylist,
        displayId,
        weekdays: [3],
        startTime: "11:00",
        endTime: "14:00",
        priority: 0,
      }),
    }));

    setScheduleClock(() => new Date("2026-10-28T18:30:00.000Z"));
    const playing = await call(playerState, "http://localhost/api/player/state", { headers: { "X-Display-Token": token } });
    expect(playing.body.playlist.id).toBe(screenPlaylist);

    const preview = await call(previewSchedule, `http://localhost/api/schedules/preview?displayId=${displayId}&days=1`, auth("token-a"));
    expect(preview.status).toBe(200);
    expect(preview.body.timezone).toBe("America/Los_Angeles");
    const during = preview.body.segments.find((segment: { start: string; end: string }) => segment.start <= "2026-10-28T18:30:00.000Z" && "2026-10-28T18:30:00.000Z" < segment.end);
    expect(during).toMatchObject({ source: "schedule", playlistId: screenPlaylist, target: "display" });

    const other = await call(listSchedules, "http://localhost/api/schedules", auth("token-b"));
    expect(other.body).toEqual([]);

    const lateImage = await upload("token-a", "late.png");
    const latePlaylist = await publishedPlaylist("Late loop", lateImage.body.id as string);
    await call(createSchedule, "http://localhost/api/schedules", auth("token-a", {
      method: "POST",
      body: JSON.stringify({
        name: "Friday late",
        playlistId: latePlaylist,
        displayId,
        weekdays: [5],
        startTime: "22:00",
        endTime: "02:00",
      }),
    }));
    setScheduleClock(() => new Date("2026-10-31T08:30:00.000Z"));
    const overnight = await call(playerState, "http://localhost/api/player/state", { headers: { "X-Display-Token": token } });
    expect(overnight.body.playlist.id).toBe(latePlaylist);
    setScheduleClock(() => new Date("2026-10-31T09:30:00.000Z"));
    const after = await call(playerState, "http://localhost/api/player/state", { headers: { "X-Display-Token": token } });
    expect(after.body.playlist).toBeUndefined();
  });
});
