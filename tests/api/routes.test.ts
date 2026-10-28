import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { setTestDb } from "@/lib/server/supabase";
import { sha256 } from "@/lib/server/crypto";
import { PAIR_CLAIM_MAX_PER_USER, PAIR_CREATE_MAX_PER_IP, MAX_UPLOAD_BYTES } from "@/lib/server/limits";
import { POST as createPair } from "@/app/api/player/pair/route";
import { POST as pairStatus } from "@/app/api/player/pair/status/route";
import { GET as playerState } from "@/app/api/player/state/route";
import { POST as claimPair } from "@/app/api/displays/pair/route";
import { GET as listDisplays, } from "@/app/api/displays/route";
import { PATCH as updateDisplay, DELETE as disconnectDisplay } from "@/app/api/displays/[id]/route";
import { GET as listMedia, POST as uploadMedia } from "@/app/api/media/route";
import { DELETE as deleteMedia } from "@/app/api/media/[id]/route";
import { GET as me } from "@/app/api/me/route";
import { createFakeDb, type Store } from "./fake-db";
import { jpeg } from "../helpers/bytes";

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
});
