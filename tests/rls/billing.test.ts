import { createHash, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { removeCreatedTestUsers } from "../helpers/account-cleanup";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const service = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
// Billing tests write plan state, so they only run against a LOCAL database.
const local = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url) && service.length > 20;
if (!local) console.log("Billing DB tests skipped: point NEXT_PUBLIC_SUPABASE_URL at a local Supabase with 0013 applied.");

const DAY = 86_400_000;
const at = (base: string, ms: number) => new Date(Date.parse(base) + ms).toISOString();

describe.skipIf(!local)("0013 entitlements (local database)", () => {
  let db: SupabaseClient;
  const users: string[] = [];

  beforeAll(() => { db = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } }); });
  afterAll(async () => { await removeCreatedTestUsers(db, users); });

  async function account(name = "Billing cafe") {
    const { data: u, error } = await db.auth.admin.createUser({ email: `pantalla-rls-${randomUUID()}@mailinator.com`, password: `${randomUUID()}Aa1!`, email_confirm: true });
    if (error || !u.user) throw new Error(error?.message);
    users.push(u.user.id);
    const { data } = await db.rpc("ensure_account", { p_user_id: u.user.id, p_name: name });
    return { id: data as string, userId: u.user.id };
  }
  async function ent(id: string, now?: string) {
    const { data, error } = await db.rpc("account_entitlement", now ? { p_account: id, p_now: now } : { p_account: id });
    if (error) throw new Error(error.message);
    return data[0];
  }
  async function screens(accountId: string, n: number) {
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      const { data, error } = await db.from("displays").insert({ account_id: accountId, name: `Screen ${i + 1}`,
        token_hash: createHash("sha256").update(randomUUID()).digest("hex") }).select("id").single();
      if (error) throw new Error(error.message);
      ids.push(data.id);
    }
    return ids;
  }
  async function pairingCode() {
    const code = createHash("sha256").update(randomUUID()).digest("hex");
    await db.from("pairing_sessions").insert({ code_hash: code, session_secret_hash: randomUUID(), expires_at: at(new Date().toISOString(), 600_000) });
    return code;
  }

  it("starts a 14-day trial from the server clock and never renews it", async () => {
    const before = Date.now();
    const a = await account();
    const { data: row } = await db.from("accounts").select("plan, created_at, trial_started_at, trial_ends_at").eq("id", a.id).single();
    expect(row!.plan).toBe("trial");
    expect(Date.parse(row!.trial_ends_at) - Date.parse(row!.trial_started_at)).toBe(14 * DAY);
    expect(Math.abs(Date.parse(row!.trial_started_at) - before)).toBeLessThan(60_000);
    // Signing in again (ensure_account) must not create a new account or reset the trial.
    const again = await db.rpc("ensure_account", { p_user_id: a.userId, p_name: "Other name" });
    expect(again.data).toBe(a.id);
    const { data: after } = await db.from("accounts").select("trial_ends_at").eq("id", a.id).single();
    expect(after!.trial_ends_at).toBe(row!.trial_ends_at);
    const e = await ent(a.id);
    expect(e).toMatchObject({ state: "trial", screen_limit: 5, playback_allowed: true, can_add_screen: true });
  });

  it("hits the expiry boundaries exactly, in any time zone", async () => {
    const a = await account();
    const end = "2026-11-15T08:00:00.000Z";
    await db.from("accounts").update({ trial_started_at: at(end, -14 * DAY), trial_ends_at: end }).eq("id", a.id);
    expect((await ent(a.id, at(end, -1))).state).toBe("trial");
    expect((await ent(a.id, end)).state).toBe("trial_grace");
    // Same instant written in Pacific and Tokyo time.
    expect((await ent(a.id, "2026-11-15T00:00:00-08:00")).state).toBe("trial_grace");
    expect((await ent(a.id, "2026-11-15T16:59:59.999+09:00")).state).toBe("trial");
    const grace = await ent(a.id, at(end, 3 * DAY - 1));
    expect(grace).toMatchObject({ state: "trial_grace", playback_allowed: true, can_add_screen: false });
    expect(Date.parse(grace.playback_ends_at)).toBe(Date.parse(end) + 3 * DAY);
    expect(await ent(a.id, at(end, 3 * DAY))).toMatchObject({ state: "expired", playback_allowed: false, screen_limit: 0 });
  });

  it("keeps content when a trial expires", async () => {
    const a = await account();
    const [d] = await screens(a.id, 1);
    await db.from("accounts").update({ trial_ends_at: at(new Date().toISOString(), -4 * DAY) }).eq("id", a.id);
    expect((await ent(a.id)).state).toBe("expired");
    const { data: still } = await db.from("displays").select("id, status, billing_active").eq("id", d).single();
    expect(still).toMatchObject({ status: "active", billing_active: true });
    expect((await db.rpc("display_entitled", { p_display: d })).data).toBe(false);
  });

  it("maps paid plans and subscription states", async () => {
    const a = await account();
    const now = "2026-12-01T00:00:00Z";
    const set = (v: Record<string, unknown>) => db.from("accounts").update(v).eq("id", a.id);
    for (const [plan, limit] of [["starter", 1], ["business", 3], ["multi", 5]] as const) {
      await set({ plan, subscription_status: "active", grace_ends_at: null, current_period_end: null });
      expect(await ent(a.id, now)).toMatchObject({ state: "active", screen_limit: limit });
    }
    await set({ plan: "business", subscription_status: "past_due", grace_ends_at: at(now, DAY) });
    expect(await ent(a.id, now)).toMatchObject({ state: "past_due", playback_allowed: true, can_add_screen: false, screen_limit: 3 });
    expect(await ent(a.id, at(now, DAY))).toMatchObject({ state: "canceled", playback_allowed: false });
    await set({ subscription_status: "canceled", current_period_end: at(now, DAY), grace_ends_at: null });
    expect((await ent(a.id, now)).state).toBe("active");
    expect((await ent(a.id, at(now, DAY))).state).toBe("canceled");
    await set({ plan: "grandfathered", subscription_status: null, current_period_end: null });
    expect(await ent(a.id, "2030-01-01T00:00:00Z")).toMatchObject({ state: "grandfathered", screen_limit: 5, playback_allowed: true });
  });

  it("enforces pairing limits only when asked (backward compatible)", async () => {
    const a = await account();
    await screens(a.id, 5);
    const full = await db.rpc("claim_pairing", { p_code_hash: await pairingCode(), p_account_id: a.id, p_name: "Sixth", p_enforce: true });
    expect(full.error?.message).toMatch(/screen_limit/);
    // Old 3-argument callers keep working unchanged.
    const old = await db.rpc("claim_pairing", { p_code_hash: await pairingCode(), p_account_id: a.id, p_name: "Old path" });
    expect(old.error).toBeNull();
    expect(old.data).toBeTruthy();
    await db.from("accounts").update({ trial_ends_at: at(new Date().toISOString(), -10 * DAY) }).eq("id", a.id);
    const inactive = await db.rpc("claim_pairing", { p_code_hash: await pairingCode(), p_account_id: a.id, p_name: "X", p_enforce: true });
    expect(inactive.error?.message).toMatch(/subscription_inactive/);
    const b = await account();
    const ok = await db.rpc("claim_pairing", { p_code_hash: await pairingCode(), p_account_id: b.id, p_name: "First", p_enforce: true });
    expect(ok.error).toBeNull();
  });

  it("runs the downgrade screen selection without deleting anything", async () => {
    const a = await account();
    const b = await account();
    const ids = await screens(a.id, 3);
    const [foreign] = await screens(b.id, 1);
    await db.from("accounts").update({ plan: "starter", subscription_status: "active" }).eq("id", a.id);
    // No choice yet: the most recently active screen keeps playing.
    await db.from("displays").update({ confirmed_at: new Date().toISOString() }).eq("id", ids[1]);
    const def = await db.rpc("entitled_display_ids", { p_account: a.id });
    expect(def.data.map((r: { display_id: string }) => r.display_id)).toEqual([ids[1]]);
    expect((await ent(a.id)).active_screens).toBe(3);

    expect((await db.rpc("select_billing_screens", { p_account: a.id, p_display_ids: [ids[0], ids[2]] })).data).toBe("too_many");
    expect((await db.rpc("select_billing_screens", { p_account: a.id, p_display_ids: [foreign] })).data).toBe("not_found");
    expect((await db.rpc("select_billing_screens", { p_account: a.id, p_display_ids: [ids[2]] })).data).toBe("ok");
    expect((await db.rpc("display_entitled", { p_display: ids[2] })).data).toBe(true);
    expect((await db.rpc("display_entitled", { p_display: ids[1] })).data).toBe(false);
    const { data: kept } = await db.from("displays").select("id, status").eq("account_id", a.id);
    expect(kept).toHaveLength(3);
    expect(kept!.every((d) => d.status === "active")).toBe(true);
    // The other account's screen was untouched.
    expect((await db.from("displays").select("billing_active").eq("id", foreign).single()).data!.billing_active).toBe(true);
  });

  it("never pauses an existing grandfathered screen, even above 5 or deselected", async () => {
    const a = await account("Early cafe");
    await db.from("accounts").update({ plan: "grandfathered" }).eq("id", a.id);
    const ids = await screens(a.id, 7);
    await db.from("displays").update({ billing_active: false }).eq("id", ids[0]);
    const { data } = await db.rpc("entitled_display_ids", { p_account: a.id });
    expect((data as { display_id: string }[]).length).toBe(7);
    const e = await ent(a.id);
    expect(e.state).toBe("grandfathered");
    expect(e.playback_allowed).toBe(true);
    expect(e.can_add_screen).toBe(false);
  });

  it("keeps billing functions and the event table server-only", async () => {
    const a = await account();
    const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    expect((await client.rpc("account_entitlement", { p_account: a.id })).error).toBeTruthy();
    expect((await client.rpc("select_billing_screens", { p_account: a.id, p_display_ids: [] })).error).toBeTruthy();
    expect((await client.from("stripe_events").select("id")).error).toBeTruthy();
  });
});
