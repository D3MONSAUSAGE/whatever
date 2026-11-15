import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { setTestDb } from "@/lib/server/supabase";
import { POST as createPair } from "@/app/api/player/pair/route";
import { POST as pairStatus } from "@/app/api/player/pair/status/route";
import { GET as playerState } from "@/app/api/player/state/route";
import { POST as claimPair } from "@/app/api/displays/pair/route";
import { POST as reconnect } from "@/app/api/displays/[id]/reconnect/route";
import { POST as unpair } from "@/app/api/player/unpair/route";
import { createFakeDb, type Store } from "./fake-db";

// B2-06 (reconnect a TV to an existing screen) and E5 (unpair from the TV).

let store: Store;
beforeEach(() => {
  const fake = createFakeDb();
  store = fake.store;
  setTestDb(fake.client);
  fake.addUser("token-a", "11111111-1111-4111-8111-111111111111", "cafe@example.com");
  fake.addUser("token-b", "22222222-2222-4222-8222-222222222222", "other@example.com");
});
afterAll(() => setTestDb(null));

type Handler = (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
async function call(handler: Handler, url: string, init: RequestInit = {}, id = "missing") {
  const res = await handler(new Request(url, init), { params: Promise.resolve({ id }) });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, body: (await res.json().catch(() => null)) as any };
}
const admin = (token: string, body: unknown): RequestInit => ({ method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
const tv = (token: string): RequestInit => ({ headers: { "X-Display-Token": token } });

async function newCode() {
  const created = await call(createPair, "http://localhost/api/player/pair", { method: "POST", body: "{}" });
  return created.body as { sessionId: string; code: string; secret: string };
}
async function collect(session: { sessionId: string; secret: string }) {
  const res = await call(pairStatus, "http://localhost/api/player/pair/status", { method: "POST", body: JSON.stringify({ sessionId: session.sessionId, secret: session.secret }) });
  return res.body as { status: string; token?: string };
}
async function pairedScreen() {
  const first = await newCode();
  const claimed = await call(claimPair, "http://localhost/api/displays/pair", admin("token-a", { code: first.code, name: "QA Bar TV 2" }));
  const id = claimed.body.id as string;
  const token = (await collect(first)).token!;
  const display = store.displays.find((d) => d.id === id)!;
  display.assigned_playlist_id = "pl-1";
  display.content_version = 11;
  store.screen_group_members.push({ group_id: "g-1", display_id: id });
  store.schedules.push({ id: "s-1", display_id: id });
  return { id, token, display };
}

describe("B2-06: reconnect a TV to an existing screen", () => {
  it("moves the screen to the new TV, cuts off the old one and keeps id, content, groups and schedules", async () => {
    const { id, token: oldToken, display } = await pairedScreen();
    expect((await call(playerState, "http://localhost/api/player/state", tv(oldToken))).status).toBe(200);

    const fresh = await newCode();
    expect((await call(reconnect, "http://localhost/x", admin("token-b", { code: fresh.code }), id)).status).toBe(404); // other account
    expect((await call(reconnect, "http://localhost/x", admin("token-a", { code: "000000" }), id)).status).toBe(404); // wrong code
    expect((await call(reconnect, "http://localhost/x", admin("token-a", { code: "12" }), id)).status).toBe(400);
    expect((await call(reconnect, "http://localhost/x", { method: "POST", body: JSON.stringify({ code: fresh.code }) }, id)).status).toBe(401);
    expect(display.token_hash).not.toBeNull(); // nothing changed by the refused attempts

    const ok = await call(reconnect, "http://localhost/x", admin("token-a", { code: `${fresh.code.slice(0, 3)} ${fresh.code.slice(3)}` }), id);
    expect(ok).toMatchObject({ status: 200, body: { id } });
    expect((await call(playerState, "http://localhost/api/player/state", tv(oldToken))).status).toBe(401); // old TV cut off

    const handoff = await collect(fresh);
    expect(handoff.status).toBe("paired");
    expect((await call(playerState, "http://localhost/api/player/state", tv(handoff.token!))).status).toBe(200);
    expect(store.displays).toHaveLength(1);
    expect(display).toMatchObject({ id, name: "QA Bar TV 2", assigned_playlist_id: "pl-1", content_version: 11, status: "active" });
    expect(store.screen_group_members.filter((m) => m.display_id === id)).toHaveLength(1);
    expect(store.schedules.filter((s) => s.display_id === id)).toHaveLength(1);

    // Single use: the same code can't reconnect again.
    expect((await call(reconnect, "http://localhost/x", admin("token-a", { code: fresh.code }), id)).status).toBe(404);
  });

  it("refuses an expired code and a removed screen", async () => {
    const { id } = await pairedScreen();
    const old = await newCode();
    store.pairing_sessions.find((s) => s.id === old.sessionId)!.expires_at = new Date(Date.now() - 1000).toISOString();
    expect((await call(reconnect, "http://localhost/x", admin("token-a", { code: old.code }), id)).status).toBe(404);
    store.displays.find((d) => d.id === id)!.status = "revoked";
    const fresh = await newCode();
    expect((await call(reconnect, "http://localhost/x", admin("token-a", { code: fresh.code }), id)).status).toBe(404);
    expect(store.pairing_sessions.find((s) => s.id === fresh.sessionId)!.status).toBe("pending");
  });
});

describe("E5: unpair from the TV", () => {
  it("clears only this TV's token; the screen stays with its content and can be reconnected", async () => {
    const { id, token, display } = await pairedScreen();
    expect((await call(unpair, "http://localhost/api/player/unpair", { method: "POST" })).status).toBe(401);
    expect((await call(unpair, "http://localhost/api/player/unpair", { method: "POST", headers: { "X-Display-Token": "x".repeat(40) } })).status).toBe(401);
    expect((await call(unpair, "http://localhost/api/player/unpair", { method: "POST", headers: { "X-Display-Token": token } })).status).toBe(200);
    expect(display.token_hash).toBeNull();
    expect(display).toMatchObject({ id, status: "active", assigned_playlist_id: "pl-1", content_version: 11 });
    expect((await call(playerState, "http://localhost/api/player/state", tv(token))).status).toBe(401);
    expect((await call(unpair, "http://localhost/api/player/unpair", { method: "POST", headers: { "X-Display-Token": token } })).status).toBe(401);

    const fresh = await newCode();
    expect((await call(reconnect, "http://localhost/x", admin("token-a", { code: fresh.code }), id)).status).toBe(200);
    expect((await collect(fresh)).status).toBe("paired");
  });
});

describe("0027 migration", () => {
  const sql = readFileSync("supabase/migrations/0027_reconnect_display.sql", "utf8");
  it("is additive: one function, service_role only, no destructive statements", () => {
    expect(sql).toMatch(/create or replace function public\.reconnect_display\(p_code_hash text, p_account_id uuid, p_display_id uuid\)/);
    expect(sql).toMatch(/account_id = p_account_id and status = 'active'/);
    expect(sql).toMatch(/status = 'pending' and expires_at > now\(\)/);
    expect(sql).toMatch(/revoke execute on function public\.reconnect_display\(text, uuid, uuid\) from public, anon, authenticated;/);
    expect(sql).toMatch(/grant execute on function public\.reconnect_display\(text, uuid, uuid\) to service_role;/);
    expect(sql).not.toMatch(/security definer/i);
    expect(sql).not.toMatch(/\b(drop|delete|truncate|alter table|create policy|drop policy)\b/i);
  });
});
