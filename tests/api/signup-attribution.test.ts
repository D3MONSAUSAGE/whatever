import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { setTestDb } from "@/lib/server/supabase";
import { POST as stamp } from "@/app/api/me/attribution/route";
import { GET as me } from "@/app/api/me/route";
import { createFakeDb, type Store } from "./fake-db";

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

async function call(handler: (req: Request) => Promise<Response>, url: string, init?: RequestInit) {
  const res = await handler(new Request(url, init));
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

const payload = {
  utm_source: "meta",
  utm_medium: "paid",
  utm_campaign: "pekko-test-01",
  utm_content: "ad-a-taping",
  referrer: "https://l.facebook.com/",
  extra: "drop",
};

describe("POST /api/me/attribution", () => {
  it("rejects unauthenticated calls", async () => {
    expect((await call(stamp, "http://localhost/api/me/attribution", { method: "POST", body: "{}" })).status).toBe(401);
  });

  it("stamps sanitized first-touch values on a new account and does not overwrite", async () => {
    await call(me, "http://localhost/api/me", auth("token-a"));
    const first = await call(stamp, "http://localhost/api/me/attribution", auth("token-a", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }));
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ ok: true, status: "stamped" });
    const account = store.accounts[0];
    expect(account.signup_attribution).toEqual({
      utm_source: "meta",
      utm_medium: "paid",
      utm_campaign: "pekko-test-01",
      utm_content: "ad-a-taping",
      referrer: "https://l.facebook.com/",
    });
    expect(account.signup_attribution_at).toBeTruthy();

    const second = await call(stamp, "http://localhost/api/me/attribution", auth("token-a", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ utm_source: "google", utm_campaign: "later" }),
    }));
    expect(second.status).toBe(200);
    expect(second.body).toEqual({ ok: true, status: "kept" });
    expect((account.signup_attribution as { utm_source: string }).utm_source).toBe("meta");
  });

  it("does not stamp an older account", async () => {
    await call(me, "http://localhost/api/me", auth("token-b"));
    store.accounts[0].created_at = "2026-01-01T00:00:00.000Z";
    const res = await call(stamp, "http://localhost/api/me/attribution", auth("token-b", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, status: "kept" });
    expect(store.accounts[0].signup_attribution).toBeUndefined();
  });

  it("rejects an empty or invalid body", async () => {
    await call(me, "http://localhost/api/me", auth("token-a"));
    const res = await call(stamp, "http://localhost/api/me/attribution", auth("token-a", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ extra: "only" }),
    }));
    expect(res.status).toBe(400);
  });
});
