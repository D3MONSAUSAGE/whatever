import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { removeCreatedTestUsers } from "../helpers/account-cleanup";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const service = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const local = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url) && service.length > 20;

describe.skipIf(!local)("0015 comp plan (local database)", () => {
  let db: SupabaseClient;
  const users: string[] = [];
  beforeAll(() => { db = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } }); });
  afterAll(async () => { await removeCreatedTestUsers(db, users); });

  async function account() {
    const email = `pantalla-rls-${randomUUID()}@mailinator.com`, password = `${randomUUID()}Aa1!`;
    const { data: u, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !u.user) throw new Error(error?.message);
    users.push(u.user.id);
    const { data } = await db.rpc("ensure_account", { p_user_id: u.user.id, p_name: "Review" });
    return { id: data as string, email, password };
  }

  it("comp is active, 5 screens, never expires, and survives a past trial end", async () => {
    const a = await account();
    await db.from("accounts").update({ trial_ends_at: new Date(Date.now() - 30 * 86_400_000).toISOString() }).eq("id", a.id);
    expect((await db.rpc("set_account_comp", { p_account: a.id, p_on: true, p_note: "play-reviewer" })).error).toBeNull();
    const far = new Date(Date.now() + 3650 * 86_400_000).toISOString();
    const { data } = await db.rpc("account_entitlement", { p_account: a.id, p_now: far });
    expect(data[0]).toMatchObject({ state: "active", plan: "comp", screen_limit: 5, playback_allowed: true, can_add_screen: true });
  });

  it("only the service role can set comp", async () => {
    const a = await account();
    const user = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    await user.auth.signInWithPassword({ email: a.email, password: a.password });
    expect((await user.rpc("set_account_comp", { p_account: a.id, p_on: true })).error).not.toBeNull();
    await user.from("accounts").update({ plan: "comp" }).eq("id", a.id);
    const { data } = await db.from("accounts").select("plan").eq("id", a.id).single();
    expect(data!.plan).toBe("trial");
  });

  it("ending comp starts a fresh trial", async () => {
    const a = await account();
    await db.rpc("set_account_comp", { p_account: a.id, p_on: true });
    await db.rpc("set_account_comp", { p_account: a.id, p_on: false });
    const { data } = await db.rpc("account_entitlement", { p_account: a.id });
    expect(data[0].state).toBe("trial");
  });
});
