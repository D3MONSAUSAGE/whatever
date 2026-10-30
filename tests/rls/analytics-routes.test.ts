import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";
import { removeCreatedTestUsers } from "../helpers/account-cleanup";
import { GET as onboardingGet, POST as onboardingPost } from "@/app/api/onboarding/route";
import { PATCH as mePatch } from "@/app/api/me/route";
import { GET as summaryGet } from "@/app/api/analytics/summary/route";
import { GET as uptimeGet } from "@/app/api/analytics/uptime/route";
import { GET as activityGet } from "@/app/api/analytics/activity/route";
import { GET as screenGet } from "@/app/api/analytics/screens/[id]/route";
import { POST as playerPost } from "@/app/api/player/state/route";
import { sha256 } from "@/lib/server/crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const service = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const configured = /^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url) && anon.length > 20 && service.length > 20 && process.env.PANTALLA_ANALYTICS_MIGRATION !== "absent";

/** M8 routes against the local database, end to end through the real handlers. */
describe.skipIf(!configured)("onboarding and analytics routes", () => {
  const admin: SupabaseClient = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const created: string[] = [];
  afterAll(() => removeCreatedTestUsers(admin, created));

  async function user() {
    const email = `pantalla-rls-${randomUUID()}@mailinator.com`;
    const password = `${randomUUID()}Aa1!`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw new Error(error?.message);
    created.push(data.user.id);
    const c = createClient(url, anon, { auth: { persistSession: false } });
    const s = await c.auth.signInWithPassword({ email, password });
    return s.data.session!.access_token;
  }
  const req = (path: string, token: string, init: RequestInit = {}) => {
    const h = new Headers(init.headers); h.set("Authorization", `Bearer ${token}`); h.set("content-type", "application/json");
    return new Request(`http://localhost${path}`, { ...init, headers: h });
  };
  const ctx = (id = "x") => ({ params: Promise.resolve({ id }) });

  it("tracks setup, saves the business name, and reports analytics per account", async () => {
    const name = `Tacos ${randomUUID().slice(0, 8)}`;
    const a = await user();
    const b = await user();
    const r = await onboardingGet(req("/api/onboarding", a));
    let body = await r.json();
    expect(body).toMatchObject({ completed: 1, total: 8, nextStep: "business", show: true, finished: false });

    expect((await mePatch(req("/api/me", a, { method: "PATCH", body: JSON.stringify({ accountName: "" }) }))).status).toBe(400);
    expect((await mePatch(req("/api/me", a, { method: "PATCH", body: JSON.stringify({ accountName: name }) }))).status).toBe(200);
    body = await (await onboardingGet(req("/api/onboarding", a))).json();
    expect(body.steps.find((s: { id: string }) => s.id === "business").done).toBe(true);

    await onboardingPost(req("/api/onboarding", a, { method: "POST", body: JSON.stringify({ dismissed: true }) }));
    body = await (await onboardingGet(req("/api/onboarding", a))).json();
    expect(body).toMatchObject({ dismissed: true, show: false });

    // A paired screen on account A.
    const { data: acct } = await admin.from("accounts").select("id").eq("name", name).single();
    const raw = `tok-${randomUUID()}`;
    const { data: d } = await admin.from("displays").insert({ account_id: acct!.id, name: "Front", token_hash: sha256(raw), last_seen_at: new Date().toISOString() }).select("id").single();

    const sum = await (await summaryGet(req("/api/analytics/summary", a))).json();
    expect(sum.screens).toMatchObject({ total: 1, online: 1 });
    expect(sum.bandwidth).toBeNull();
    const up = await (await uptimeGet(req("/api/analytics/uptime?days=7", a))).json();
    expect(up.screens).toHaveLength(1);
    expect(up.screens[0].daily).toHaveLength(7);
    expect((await uptimeGet(req("/api/analytics/uptime?days=9", a))).status).toBe(400);

    // Proof of play from the TV.
    const play = await playerPost(new Request("http://localhost/api/player/state", {
      method: "POST", headers: { "x-display-token": raw, "content-type": "application/json" }, body: JSON.stringify({ playing: { version: 0 } }),
    }));
    expect(play.status).toBe(200);
    const detail = await (await screenGet(req(`/api/analytics/screens/${d!.id}`, a), ctx(d!.id))).json();
    expect(detail.playback.status).toBe("nothing");
    expect(detail.playback.confirmed?.version).toBe(0);

    // Tenant isolation.
    expect((await screenGet(req(`/api/analytics/screens/${d!.id}`, b), ctx(d!.id))).status).toBe(404);
    const other = await (await summaryGet(req("/api/analytics/summary", b))).json();
    expect(other.screens.total).toBe(0);
    const act = await (await activityGet(req("/api/analytics/activity?limit=5", a))).json();
    expect(act.events.map((e: { kind: string }) => e.kind)).toContain("screen.paired");
    expect((await (await activityGet(req("/api/analytics/activity", b))).json()).events).toHaveLength(0);
  });
});
