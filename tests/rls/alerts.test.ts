import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";
import { removeCreatedTestUsers } from "../helpers/account-cleanup";
import { GET as feedGet } from "@/app/api/alerts/route";
import { POST as readPost } from "@/app/api/alerts/read/route";
import { GET as prefsGet, PATCH as prefsPatch } from "@/app/api/alerts/preferences/route";
import { deliverAlertEmails } from "@/lib/server/alerts";
import type { EmailMessage } from "@/lib/server/email";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const service = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const configured = /^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url) && anon.length > 20 && service.length > 20 && process.env.PANTALLA_ALERTS_MIGRATION !== "absent";

/** M9 (0006_alerts.sql) against the local database: detection, no duplicates, recovery, routes, email, isolation. */
describe.skipIf(!configured)("offline alerts", () => {
  const admin: SupabaseClient = createClient(url || "http://127.0.0.1:54321", service || "unset", { auth: { persistSession: false, autoRefreshToken: false } });
  const created: string[] = [];
  afterAll(() => removeCreatedTestUsers(admin, created));

  async function owner() {
    const email = `pantalla-rls-${randomUUID()}@mailinator.com`;
    const password = `${randomUUID()}Aa1!`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw new Error(error?.message);
    created.push(data.user.id);
    const { data: accountId } = await admin.rpc("ensure_account", { p_user_id: data.user.id, p_name: "Alert Cafe" });
    const c = createClient(url, anon, { auth: { persistSession: false } });
    const s = await c.auth.signInWithPassword({ email, password });
    return { email, accountId: accountId as string, token: s.data.session!.access_token, client: c };
  }
  const req = (path: string, token: string, init: RequestInit = {}) => {
    const h = new Headers(init.headers); h.set("Authorization", `Bearer ${token}`); h.set("content-type", "application/json");
    return new Request(`http://localhost${path}`, { ...init, headers: h });
  };
  const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
  const check = async () => (await admin.rpc("check_offline_alerts")).data as { offline: number; recovered: number };
  const alertsOf = async (accountId: string) =>
    ((await admin.from("alerts").select("kind, display_name, email_status, offline_seconds").eq("account_id", accountId).order("at")).data ?? []);

  it("alerts once when a screen goes offline past the threshold, and once when it recovers", async () => {
    const a = await owner();
    const b = await owner();
    const { data: d } = await admin.from("displays").insert({ account_id: a.accountId, name: "Bar TV", token_hash: `h-${randomUUID()}`, last_seen_at: ago(5) }).select("id").single();
    await admin.from("displays").insert({ account_id: a.accountId, name: "Never", token_hash: `h-${randomUUID()}` });
    await admin.from("displays").insert({ account_id: a.accountId, name: "Long dead", token_hash: `h-${randomUUID()}`, last_seen_at: ago(3 * 24 * 60) });

    await check();
    expect(await alertsOf(a.accountId)).toHaveLength(0); // 5 min < default 10

    await admin.from("displays").update({ last_seen_at: ago(12) }).eq("id", d!.id);
    await check();
    await check(); // second run must not duplicate
    let rows = await alertsOf(a.accountId);
    expect(rows).toEqual([expect.objectContaining({ kind: "screen.offline", display_name: "Bar TV", email_status: "pending" })]);

    await admin.from("displays").update({ last_seen_at: new Date().toISOString() }).eq("id", d!.id);
    await check();
    await check();
    rows = await alertsOf(a.accountId);
    expect(rows.map((r) => r.kind)).toEqual(["screen.offline", "screen.recovered"]);
    expect(rows[1].offline_seconds).toBeGreaterThan(9 * 60);

    // Preferences: validation, threshold, off switch.
    expect((await prefsPatch(req("/api/alerts/preferences", a.token, { method: "PATCH", body: JSON.stringify({ thresholdMinutes: 1 }) }))).status).toBe(400);
    expect((await prefsPatch(req("/api/alerts/preferences", a.token, { method: "PATCH", body: JSON.stringify({}) }))).status).toBe(400);
    const p = await (await prefsPatch(req("/api/alerts/preferences", a.token, { method: "PATCH", body: JSON.stringify({ thresholdMinutes: 30, emailEnabled: false }) }))).json();
    expect(p).toMatchObject({ enabled: true, thresholdMinutes: 30, email: { enabled: false, available: false, address: a.email } });
    await admin.from("displays").update({ last_seen_at: ago(15) }).eq("id", d!.id);
    await check();
    expect(await alertsOf(a.accountId)).toHaveLength(2); // 15 < 30
    await admin.from("displays").update({ last_seen_at: ago(31) }).eq("id", d!.id);
    await check();
    rows = await alertsOf(a.accountId);
    expect(rows).toHaveLength(3);
    expect(rows[2].email_status).toBe("off");
    await prefsPatch(req("/api/alerts/preferences", a.token, { method: "PATCH", body: JSON.stringify({ enabled: false }) }));
    await admin.from("displays").update({ last_seen_at: new Date().toISOString() }).eq("id", d!.id);
    await check();
    expect(await alertsOf(a.accountId)).toHaveLength(3); // off: cleared without a recovery alert
    expect((await admin.from("displays").select("offline_alerted_at").eq("id", d!.id).single()).data!.offline_alerted_at).toBeNull();
    expect((await (await prefsGet(req("/api/alerts/preferences", a.token))).json()).enabled).toBe(false);

    // Feed, unread, mark read, isolation.
    const feed = await (await feedGet(req("/api/alerts?limit=2", a.token))).json();
    expect(feed.unread).toBe(3);
    expect(feed.alerts).toHaveLength(2);
    expect(feed.alerts[0]).toMatchObject({ kind: "screen.offline", screenName: "Bar TV", read: false });
    expect(feed.nextBefore).not.toBeNull();
    expect((await (await feedGet(req("/api/alerts", b.token))).json()).alerts).toHaveLength(0);
    expect((await readPost(req("/api/alerts/read", b.token, { method: "POST", body: JSON.stringify({ all: true }) })).then((r) => r.json())).marked).toBe(0);
    expect((await readPost(req("/api/alerts/read", a.token, { method: "POST", body: JSON.stringify({ ids: ["nope"] }) }))).status).toBe(400);
    const marked = await (await readPost(req("/api/alerts/read", a.token, { method: "POST", body: JSON.stringify({ ids: [feed.alerts[0].id] }) }))).json();
    expect(marked.marked).toBe(1);
    expect((await (await feedGet(req("/api/alerts?unread=1", a.token))).json()).unread).toBe(2);

    // Users can't read the table or run the checker directly.
    const direct = await a.client.from("alerts").select("*");
    expect(direct.error !== null || (direct.data ?? []).length === 0).toBe(true);
    expect((await a.client.rpc("check_offline_alerts")).error).not.toBeNull();
    expect((await a.client.rpc("alerts_purge", { p_days: 7, p_dry_run: false })).error).not.toBeNull();
  });

  it("emails each pending alert once with a provider, and skips them without one", async () => {
    const a = await owner();
    const { data: d } = await admin.from("displays").insert({ account_id: a.accountId, name: "Patio", token_hash: `h-${randomUUID()}`, last_seen_at: ago(20) }).select("id").single();
    await check();
    const sent: EmailMessage[] = [];
    const provider = { name: "test", send: async (m: EmailMessage) => { sent.push(m); return { ok: true }; } };
    const dry = await deliverAlertEmails({ dryRun: true, provider });
    expect(sent).toHaveLength(0);
    expect(dry.sent).toBeGreaterThanOrEqual(1);
    await deliverAlertEmails({ dryRun: false, provider });
    await deliverAlertEmails({ dryRun: false, provider });
    const mine = sent.filter((m) => m.to === a.email);
    expect(mine).toHaveLength(1);
    expect(mine[0].subject).toBe('Seemple: "Patio" is offline');
    expect((await alertsOf(a.accountId))[0].email_status).toBe("sent");

    await admin.from("displays").update({ last_seen_at: new Date().toISOString() }).eq("id", d!.id);
    await check();
    const r = await deliverAlertEmails({ dryRun: false, provider: null });
    expect(r.provider).toBeNull();
    expect((await alertsOf(a.accountId))[1].email_status).toBe("skipped");

    const purge = await admin.rpc("alerts_purge", { p_days: 90, p_dry_run: true });
    expect(purge.data).toEqual({ alerts: 0 });
  });
});
