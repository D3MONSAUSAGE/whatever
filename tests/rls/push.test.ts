import { generateKeyPairSync, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";
import { removeCreatedTestUsers } from "../helpers/account-cleanup";
import { GET as devGet, POST as devPost, DELETE as devDeleteBody } from "@/app/api/devices/route";
import { DELETE as devDelete } from "@/app/api/devices/[token]/route";
import { PATCH as prefsPatch, GET as prefsGet } from "@/app/api/alerts/preferences/route";
import { deliverAlertPushes, fcmSender, pushFor, serviceAccountFromEnv, type PushMessage, type PushSender } from "@/lib/server/push";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const service = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const configured = /^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url) && anon.length > 20 && service.length > 20;

/** M16 push (0011_push_devices.sql): device API, isolation, dedupe, prefs, pruning, FCM v1 format. Mock sender only. */
describe.skipIf(!configured)("push devices and alert pushes", () => {
  const admin: SupabaseClient = createClient(url || "http://127.0.0.1:54321", service || "unset", { auth: { persistSession: false, autoRefreshToken: false } });
  const created: string[] = [];
  afterAll(() => removeCreatedTestUsers(admin, created));

  async function owner() {
    const email = `pantalla-rls-${randomUUID()}@mailinator.com`;
    const password = `${randomUUID()}Aa1!`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw new Error(error?.message);
    created.push(data.user.id);
    const { data: accountId } = await admin.rpc("ensure_account", { p_user_id: data.user.id, p_name: "Push Cafe" });
    const c = createClient(url, anon, { auth: { persistSession: false } });
    const s = await c.auth.signInWithPassword({ email, password });
    return { userId: data.user.id, accountId: accountId as string, token: s.data.session!.access_token, client: c };
  }
  const req = (path: string, token: string, init: RequestInit = {}) => {
    const h = new Headers(init.headers); h.set("Authorization", `Bearer ${token}`); h.set("content-type", "application/json");
    return new Request(`http://localhost${path}`, { ...init, headers: h });
  };
  const fcm = () => `${randomUUID()}:APA91b${randomUUID().replace(/-/g, "")}_x-y`;
  const mock = () => {
    const sent: PushMessage[] = [];
    const dead = new Set<string>();
    const sender: PushSender = { name: "mock", async send(m) { if (dead.has(m.token)) return { ok: false, invalidToken: true, error: "fcm 404" }; sent.push(m); return { ok: true }; } };
    return { sent, dead, sender };
  };
  async function alertFor(accountId: string, kind = "screen.offline") {
    const { data: d } = await admin.from("displays").insert({ account_id: accountId, name: "Bar TV", token_hash: `h-${randomUUID()}` }).select("id").single();
    const { data: a } = await admin.from("alerts").insert({ account_id: accountId, display_id: d!.id, display_name: "Bar TV", kind, offline_since: new Date().toISOString() }).select("id, push_status").single();
    return { displayId: d!.id as string, alertId: a!.id as string, status: a!.push_status as string };
  }
  const statusOf = async (id: string) => (await admin.from("alerts").select("push_status").eq("id", id).single()).data!.push_status;
  const clearOthers = async (keep: string[]) => { await admin.from("alerts").update({ push_status: "off" }).eq("push_status", "pending").not("account_id", "in", `(${keep.join(",")})`); };

  it("registers, re-registers idempotently, lists masked, and validates input", async () => {
    const a = await owner();
    const t = fcm();
    expect((await devPost(req("/api/devices", a.token, { method: "POST", body: JSON.stringify({ token: "short", platform: "android" }) }))).status).toBe(400);
    expect((await devPost(req("/api/devices", a.token, { method: "POST", body: JSON.stringify({ token: t, platform: "web" }) }))).status).toBe(400);
    expect((await devPost(new Request("http://localhost/api/devices", { method: "POST", body: "{}" }))).status).toBe(401);
    const r1 = await devPost(req("/api/devices", a.token, { method: "POST", body: JSON.stringify({ token: t, platform: "android", appVersion: "1.4.0" }) }));
    expect(r1.status).toBe(200);
    const r2 = await (await devPost(req("/api/devices", a.token, { method: "POST", body: JSON.stringify({ token: t, platform: "android", appVersion: "1.4.1", notifyRecovery: false }) }))).json();
    expect(r2.device).toMatchObject({ platform: "android", appVersion: "1.4.1", notifyOffline: true, notifyRecovery: false, tokenSuffix: t.slice(-6) });
    const list = await (await devGet(req("/api/devices", a.token))).json();
    expect(list.devices).toHaveLength(1);
    expect(JSON.stringify(list)).not.toContain(t);
    // anon/authenticated clients can't read the table directly.
    expect((await a.client.from("push_devices").select("id")).data ?? []).toHaveLength(0);
  });

  it("delivers to the alert's own account only, once, honoring preferences, and prunes dead tokens", async () => {
    const a = await owner();
    const b = await owner();
    const ta = fcm(), ta2 = fcm(), tb = fcm();
    await devPost(req("/api/devices", a.token, { method: "POST", body: JSON.stringify({ token: ta, platform: "android" }) }));
    await devPost(req("/api/devices", a.token, { method: "POST", body: JSON.stringify({ token: ta2, platform: "ios", notifyOffline: false }) }));
    await devPost(req("/api/devices", b.token, { method: "POST", body: JSON.stringify({ token: tb, platform: "android" }) }));
    const al = await alertFor(a.accountId);
    expect(al.status).toBe("pending");
    await clearOthers([a.accountId, b.accountId]);

    const m = mock();
    const dry = await deliverAlertPushes({ dryRun: true, sender: m.sender });
    expect(dry).toMatchObject({ sent: 1, devices: 1 });
    expect(m.sent).toHaveLength(0);
    expect(await statusOf(al.alertId)).toBe("pending");

    const r = await deliverAlertPushes({ dryRun: false, sender: m.sender });
    await deliverAlertPushes({ dryRun: false, sender: m.sender }); // second run: no duplicate
    expect(r).toMatchObject({ sent: 1, devices: 1 });
    expect(m.sent.map((x) => x.token)).toEqual([ta]); // not ta2 (offline off), never tb (other account)
    expect(m.sent[0].data).toEqual({ type: "screen_offline", alertId: al.alertId, screenId: al.displayId });
    expect(await statusOf(al.alertId)).toBe("sent");

    // Recovery goes to ta2 too; a dead token is deleted.
    const rec = await alertFor(a.accountId, "screen.recovered");
    m.dead.add(ta);
    const r2 = await deliverAlertPushes({ dryRun: false, sender: m.sender });
    expect(r2).toMatchObject({ sent: 1, pruned: 1 });
    expect(m.sent.at(-1)).toMatchObject({ token: ta2, data: { type: "screen_online", alertId: rec.alertId } });
    expect((await admin.from("push_devices").select("id").eq("token", ta)).data).toHaveLength(0);

    // Account switch off: pending pushes are skipped.
    expect((await prefsPatch(req("/api/alerts/preferences", a.token, { method: "PATCH", body: JSON.stringify({ pushEnabled: "yes" }) }))).status).toBe(400);
    const p = await (await prefsPatch(req("/api/alerts/preferences", a.token, { method: "PATCH", body: JSON.stringify({ pushEnabled: false }) }))).json();
    expect(p.push).toEqual({ enabled: false, available: false });
    const off = await alertFor(a.accountId);
    await deliverAlertPushes({ dryRun: false, sender: m.sender });
    expect(await statusOf(off.alertId)).toBe("skipped");
    expect((await (await prefsGet(req("/api/alerts/preferences", a.token))).json()).push.enabled).toBe(false);

    // Without a sender (no FCM credentials) everything pending is skipped, nothing sent.
    const nb = await alertFor(b.accountId);
    const n = m.sent.length;
    await deliverAlertPushes({ dryRun: false, sender: null });
    expect(await statusOf(nb.alertId)).toBe("skipped");
    expect(m.sent.length).toBe(n);
  });

  it("a token re-registered by another account moves; delete only removes the caller's own token", async () => {
    const a = await owner();
    const b = await owner();
    const t = fcm();
    await devPost(req("/api/devices", a.token, { method: "POST", body: JSON.stringify({ token: t, platform: "android" }) }));
    await devPost(req("/api/devices", b.token, { method: "POST", body: JSON.stringify({ token: t, platform: "android" }) }));
    const row = (await admin.from("push_devices").select("account_id").eq("token", t).single()).data!;
    expect(row.account_id).toBe(b.accountId);
    expect((await (await devGet(req("/api/devices", a.token))).json()).devices).toHaveLength(0);

    expect((await devDelete(req(`/api/devices/${encodeURIComponent(t)}`, a.token, { method: "DELETE" }), { params: Promise.resolve({ token: encodeURIComponent(t) }) })).status).toBe(204);
    expect((await admin.from("push_devices").select("id").eq("token", t)).data).toHaveLength(1); // a can't remove b's
    expect((await devDelete(req(`/api/devices/${encodeURIComponent(t)}`, b.token, { method: "DELETE" }), { params: Promise.resolve({ token: encodeURIComponent(t) }) })).status).toBe(204);
    expect((await admin.from("push_devices").select("id").eq("token", t)).data).toHaveLength(0);

    const t2 = fcm();
    await devPost(req("/api/devices", b.token, { method: "POST", body: JSON.stringify({ token: t2, platform: "ios" }) }));
    expect((await devDeleteBody(req("/api/devices", b.token, { method: "DELETE", body: JSON.stringify({ token: t2 }) }))).status).toBe(204);
    expect((await admin.from("push_devices").select("id").eq("token", t2)).data).toHaveLength(0);
  });

  it("purges tokens the app hasn't refreshed in 60 days (dry run changes nothing)", async () => {
    const a = await owner();
    const t = fcm();
    await devPost(req("/api/devices", a.token, { method: "POST", body: JSON.stringify({ token: t, platform: "android" }) }));
    await admin.from("push_devices").update({ last_seen_at: new Date(Date.now() - 61 * 86400_000).toISOString() }).eq("token", t);
    const dry = await admin.rpc("push_devices_purge", { p_days: 60, p_dry_run: true });
    expect((dry.data as { devices: number }).devices).toBeGreaterThanOrEqual(1);
    expect((await admin.from("push_devices").select("id").eq("token", t)).data).toHaveLength(1);
    await admin.rpc("push_devices_purge", { p_days: 60, p_dry_run: false });
    expect((await admin.from("push_devices").select("id").eq("token", t)).data).toHaveLength(0);
  });
});

describe("FCM HTTP v1 sender (mock fetch)", () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
  const sa = { project_id: "pekko-test", client_email: "push@pekko-test.iam.gserviceaccount.com", private_key: privateKey };

  it("reads the service account from raw or base64 env, else push is off", () => {
    expect(serviceAccountFromEnv(undefined)).toBeNull();
    expect(serviceAccountFromEnv("nope")).toBeNull();
    expect(serviceAccountFromEnv(JSON.stringify(sa))?.project_id).toBe("pekko-test");
    expect(serviceAccountFromEnv(Buffer.from(JSON.stringify(sa)).toString("base64"))?.client_email).toBe(sa.client_email);
  });

  it("gets an OAuth token once, posts the v1 message, and flags UNREGISTERED tokens", async () => {
    const calls: { url: string; body: string }[] = [];
    let unregistered = false;
    const fake = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const u = String(input);
      calls.push({ url: u, body: String(init?.body ?? "") });
      if (u.includes("oauth2")) return new Response(JSON.stringify({ access_token: "ya29.test", expires_in: 3600 }));
      if (unregistered) return new Response(JSON.stringify({ error: { status: "NOT_FOUND", details: [{ errorCode: "UNREGISTERED" }] } }), { status: 404 });
      return new Response(JSON.stringify({ name: "projects/pekko-test/messages/1" }));
    }) as typeof fetch;
    const s = fcmSender(sa, fake);
    const msg = { token: "tok:123", ...pushFor({ id: "a1", kind: "screen.offline", display_id: "d1", display_name: "Bar TV" }) };
    expect(await s.send(msg)).toEqual({ ok: true });
    unregistered = true;
    expect(await s.send(msg)).toMatchObject({ ok: false, invalidToken: true });
    expect(calls.filter((c) => c.url.includes("oauth2"))).toHaveLength(1);
    const sendCall = calls.find((c) => c.url.includes("fcm.googleapis.com/v1/projects/pekko-test/messages:send"))!;
    const body = JSON.parse(sendCall.body);
    expect(body.message).toMatchObject({
      token: "tok:123",
      notification: { title: '"Bar TV" is offline' },
      data: { type: "screen_offline", alertId: "a1", screenId: "d1" },
    });
    const assertion = new URLSearchParams(calls[0].body).get("assertion")!;
    const claims = JSON.parse(Buffer.from(assertion.split(".")[1], "base64url").toString());
    expect(claims).toMatchObject({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging" });
  });
});
