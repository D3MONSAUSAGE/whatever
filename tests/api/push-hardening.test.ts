import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { setTestDb } from "@/lib/server/supabase";
import type { PushMessage, PushResult, PushSender } from "@/lib/server/push";
import { createFakeDb, type Store } from "./fake-db";

// Push hardening: sign-out token cleanup, POST /api/push/test, and the pinned Android DELETE contracts.

const fakeSender = vi.hoisted(() => ({
  current: null as PushSender | null,
}));
vi.mock("@/lib/server/push", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/server/push")>();
  return { ...real, pushSender: () => fakeSender.current };
});

const { DELETE: deleteByBody } = await import("@/app/api/devices/route");
const { DELETE: deleteByPath } = await import("@/app/api/devices/[token]/route");
const { POST: signOut } = await import("@/app/api/session/sign-out/route");
const { POST: pushTest } = await import("@/app/api/push/test/route");

// Hashes of origin/main 40afbad: Android calls these on sign-out, so any edit must fail here first.
const PINNED: Record<string, string> = {
  "app/api/devices/[token]/route.ts": "60ddca348032315769d93e7d764dc005198156425fdd12e9d6836b5d27beac60",
  "app/api/devices/route.ts": "446513b6c3749a736c7b05d54b464a85465ae4f295f5c6d685163b38d664c47d",
  unregisterDevice: "68384fcfa20575a44ea5bf444f7478a675411bb39bc4e958851bb6f8308be988",
};

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const tok = (s: string) => `fcm-${s}:APA91b${"x".repeat(30)}`;
let store: Store;
let accountA: string;

beforeEach(async () => {
  const fake = createFakeDb();
  store = fake.store;
  setTestDb(fake.client);
  fake.addUser("token-a", A, "cafe@example.com");
  fake.addUser("token-b", B, "other@example.com");
  fakeSender.current = null;
  // Create both accounts through a real authenticated call.
  await signOut(req("token-b", { scope: "local" }));
  await signOut(req("token-a", { scope: "local" }));
  accountA = store.accounts.find((a) => a.owner_user_id === A)!.id as string;
  const accountB = store.accounts.find((a) => a.owner_user_id === B)!.id as string;
  store.push_devices.push(
    { id: "d1", token: tok("a1"), user_id: A, account_id: accountA, platform: "android" },
    { id: "d2", token: tok("a2"), user_id: A, account_id: accountA, platform: "android" },
    // Same account, different login: never touched by A's sign-out or A's test push.
    { id: "d3", token: tok("teammate"), user_id: "33333333-3333-4333-8333-333333333333", account_id: accountA, platform: "android" },
    { id: "d4", token: tok("b1"), user_id: B, account_id: accountB, platform: "android" },
  );
});
afterAll(() => setTestDb(null));

function req(bearer: string | null, body?: unknown, method = "POST", raw?: string) {
  const headers: Record<string, string> = {};
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  return new Request("http://localhost/x", { method, headers, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) });
}
const ids = () => store.push_devices.map((d) => d.id).sort();

describe("Android sign-out contracts are byte-for-byte unchanged", () => {
  it("route sources match the pinned hashes", () => {
    const sha = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");
    expect(sha("app/api/devices/[token]/route.ts")).toBe(PINNED["app/api/devices/[token]/route.ts"]);
    expect(sha("app/api/devices/route.ts")).toBe(PINNED["app/api/devices/route.ts"]);
    const src = readFileSync("lib/server/devices.ts", "utf8");
    const fn = src.slice(src.indexOf("export async function unregisterDevice"), src.indexOf("\n}\n", src.indexOf("export async function unregisterDevice")) + 2);
    expect(createHash("sha256").update(fn).digest("hex")).toBe(PINNED.unregisterDevice);
  });

  it("DELETE /api/devices/:token: 204, empty body, own row only, URL-decoded", async () => {
    const res = await deleteByPath(req("token-a", undefined, "DELETE"), { params: Promise.resolve({ token: encodeURIComponent(tok("a1")) }) });
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(ids()).toEqual(["d2", "d3", "d4"]);
    // Someone else's token: still 204 (no probing), row untouched.
    const other = await deleteByPath(req("token-a", undefined, "DELETE"), { params: Promise.resolve({ token: encodeURIComponent(tok("b1")) }) });
    expect(other.status).toBe(204);
    expect(ids()).toEqual(["d2", "d3", "d4"]);
    const bad = await deleteByPath(req("token-a", undefined, "DELETE"), { params: Promise.resolve({ token: "short" }) });
    expect(bad.status).toBe(400);
    const anon = await deleteByPath(req(null, undefined, "DELETE"), { params: Promise.resolve({ token: encodeURIComponent(tok("a2")) }) });
    expect(anon.status).toBe(401);
  });

  it("DELETE /api/devices {token}: 204, empty body, own row only", async () => {
    const res = await deleteByBody(req("token-a", { token: tok("a2") }, "DELETE"));
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    expect(ids()).toEqual(["d1", "d3", "d4"]);
    expect((await deleteByBody(req("token-a", { token: 42 }, "DELETE"))).status).toBe(400);
    expect((await deleteByBody(req(null, { token: tok("a1") }, "DELETE"))).status).toBe(401);
  });
});

describe("POST /api/session/sign-out (additive server-side cleanup)", () => {
  it("global removes every row of this login and nothing else", async () => {
    const res = await signOut(req("token-a", { scope: "global" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ removed: 2 });
    expect(ids()).toEqual(["d3", "d4"]);
  });
  it("local with a token removes only that token; local without one removes nothing", async () => {
    expect(await (await signOut(req("token-a", { scope: "local", token: tok("a1") }))).json()).toEqual({ removed: 1 });
    expect(ids()).toEqual(["d2", "d3", "d4"]);
    expect(await (await signOut(req("token-a", { scope: "local" }))).json()).toEqual({ removed: 0 });
    expect(await (await signOut(req("token-a", {}))).json()).toEqual({ removed: 0 });
    // Another login's token is never removed.
    expect(await (await signOut(req("token-a", { scope: "local", token: tok("b1") }))).json()).toEqual({ removed: 0 });
    expect(ids()).toEqual(["d2", "d3", "d4"]);
  });
  it("rejects bad input and requires a session", async () => {
    expect((await signOut(req("token-a", { scope: "everyone" }))).status).toBe(400);
    expect((await signOut(req("token-a", { scope: "local", token: "nope" }))).status).toBe(400);
    expect((await signOut(req(null, { scope: "global" }))).status).toBe(401);
    expect(ids()).toEqual(["d1", "d2", "d3", "d4"]);
  });
});

describe("POST /api/push/test", () => {
  function recordingSender(results: Record<string, PushResult> = {}) {
    const sent: PushMessage[] = [];
    fakeSender.current = { name: "fake", async send(m) { sent.push(m); return results[m.token] ?? { ok: true }; } };
    return sent;
  }

  it("401 without a session, before anything else", async () => {
    recordingSender();
    expect((await pushTest(req(null, {}))).status).toBe(401);
  });

  it("sends {type:'test'} to the caller's own devices only and replies {devices, sent, failed}", async () => {
    const sent = recordingSender();
    const res = await pushTest(req("token-a", {}));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ devices: 2, sent: 2, failed: 0 });
    expect(sent.map((m) => m.token).sort()).toEqual([tok("a1"), tok("a2")]);
    for (const m of sent) {
      expect(m.data).toEqual({ type: "test" }); // no alertId, no route key
      expect(m.title).toBe("Pekko test notification");
    }
  });

  it("uses the account locale for the visible text", async () => {
    store.accounts.find((a) => a.id === accountA)!.locale = "es";
    const sent = recordingSender();
    await pushTest(req("token-a", {}));
    expect(sent[0].title).toBe("Notificación de prueba de Pekko");
    expect(sent[0].body).toBe("Las notificaciones de Pekko funcionan en este dispositivo.");
    expect(sent[0].data).toEqual({ type: "test" });
  });

  it("prunes tokens FCM reports as gone, like normal delivery, and records other errors", async () => {
    recordingSender({ [tok("a1")]: { ok: false, invalidToken: true, error: "fcm 404" }, [tok("a2")]: { ok: false, error: "fcm 500" } });
    const res = await pushTest(req("token-a", {}));
    expect(await res.json()).toEqual({ devices: 2, sent: 0, failed: 2 });
    expect(ids()).toEqual(["d2", "d3", "d4"]);
    expect(store.push_devices.find((d) => d.id === "d2")!.last_error).toBe("fcm 500");
  });

  it("never touches alerts (the fake DB has no alerts table and would throw)", async () => {
    recordingSender();
    expect((await pushTest(req("token-a", {}))).status).toBe(200);
    expect(readFileSync("lib/server/push-test.ts", "utf8")).not.toMatch(/from\("alerts"\)/);
  });

  it("only accepts an empty body", async () => {
    recordingSender();
    expect((await pushTest(req("token-a", { userId: B }))).status).toBe(400);
    expect((await pushTest(req("token-a", { accountId: "x" }))).status).toBe(400);
    expect((await pushTest(req("token-a", undefined, "POST", ""))).status).toBe(200);
  });

  it("5 per hour per user, then 429 with Retry-After; other users unaffected", async () => {
    const sent = recordingSender();
    for (let i = 0; i < 5; i++) expect((await pushTest(req("token-a", {}))).status).toBe(200);
    const limited = await pushTest(req("token-a", {}));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBeTruthy();
    expect(sent.length).toBe(10);
    expect((await pushTest(req("token-b", {}))).status).toBe(200);
  });

  it("503 when push isn't configured (Preview has no FCM)", async () => {
    fakeSender.current = null;
    expect((await pushTest(req("token-a", {}))).status).toBe(503);
  });

  it("0 devices is still a 200", async () => {
    recordingSender();
    store.push_devices = [];
    expect(await (await pushTest(req("token-a", {}))).json()).toEqual({ devices: 0, sent: 0, failed: 0 });
  });
});

describe("FCM wire format for the test push", () => {
  it("Android channel screen_alerts, data {type:'test'} only", async () => {
    const { fcmSender, serviceAccountFromEnv } = await vi.importActual<typeof import("@/lib/server/push")>("@/lib/server/push");
    void serviceAccountFromEnv;
    const { generateKeyPairSync } = await import("node:crypto");
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const bodies: unknown[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      if (String(url).includes("oauth2")) return new Response(JSON.stringify({ access_token: "t", expires_in: 3600 }));
      bodies.push(JSON.parse(String(init.body)));
      return new Response("{}");
    }) as unknown as typeof fetch;
    const s = fcmSender({ project_id: "p", client_email: "e@p.iam.gserviceaccount.com", private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString() }, fetchImpl);
    const { testPushFor } = await import("@/lib/server/push-test");
    expect(await s.send({ ...testPushFor("en"), token: tok("a1") })).toEqual({ ok: true });
    const m = (bodies[0] as { message: { data: unknown; android: { notification: { channel_id: string; tag: string } } } }).message;
    expect(m.data).toEqual({ type: "test" });
    expect(m.android.notification.channel_id).toBe("screen_alerts");
    expect(m.android.notification.tag).toBe("test");
  });
});


describe("Spanish error text for the new routes", () => {
  it("429 and 400 answers come back in Spanish with Accept-Language: es", async () => {
    fakeSender.current = { name: "fake", async send() { return { ok: true }; } };
    const es = (body: unknown) => new Request("http://localhost/x", { method: "POST", headers: { Authorization: "Bearer token-a", "Accept-Language": "es" }, body: JSON.stringify(body) });
    expect((await (await pushTest(es({ x: 1 }))).json()).error).toBe("Envíe un cuerpo JSON vacío {}.");
    expect((await (await signOut(es({ scope: "all" }))).json()).error).toBe("scope debe ser 'global' o 'local'.");
    for (let i = 0; i < 5; i++) await pushTest(es({}));
    expect((await (await pushTest(es({}))).json()).error).toBe("Demasiadas notificaciones de prueba. Intente de nuevo más tarde.");
  });
});
