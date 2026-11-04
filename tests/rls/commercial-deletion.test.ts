import { createHash, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { removeCreatedTestUsers } from "../helpers/account-cleanup";
import { setTestDb } from "@/lib/server/supabase";
import { deleteAccountData, runDueDeletions } from "@/lib/server/account-deletion";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const service = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
// Writes and deletes accounts, so only against a LOCAL database with 0013 + 0014 applied.
const local = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url) && service.length > 20;
const DAY = 86_400_000;

describe.skipIf(!local)("0014 commercial events and account deletion (local database)", () => {
  let db: SupabaseClient;
  const users: string[] = [];
  beforeAll(() => { db = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } }); setTestDb(db); });
  afterAll(async () => { setTestDb(null); await removeCreatedTestUsers(db, users); });

  async function account() {
    const { data: u, error } = await db.auth.admin.createUser({ email: `pantalla-rls-${randomUUID()}@mailinator.com`, password: `${randomUUID()}Aa1!`, email_confirm: true });
    if (error || !u.user) throw new Error(error?.message);
    users.push(u.user.id);
    const { data } = await db.rpc("ensure_account", { p_user_id: u.user.id, p_name: "Cafe" });
    return { id: data as string, userId: u.user.id };
  }
  async function kinds(id: string) {
    const { data } = await db.from("activity_events").select("kind, subject_name, detail").eq("account_id", id).like("kind", "commercial.%");
    return (data ?? []) as { kind: string; subject_name: string | null; detail: Record<string, unknown> }[];
  }
  async function screen(id: string) {
    const { data, error } = await db.from("displays").insert({ account_id: id, name: "Front", token_hash: createHash("sha256").update(randomUUID()).digest("hex") }).select("id").single();
    if (error) throw new Error(error.message);
    return data.id as string;
  }

  it("logs the trial funnel once each, with no personal data", async () => {
    const a = await account();
    await screen(a.id); await screen(a.id);
    const { data: p } = await db.from("playlists").insert({ account_id: a.id, name: "Lunch" }).select("id").single();
    await db.from("playlists").update({ published_at: new Date().toISOString() }).eq("id", p!.id);
    await db.from("playlists").update({ published_at: null }).eq("id", p!.id);
    await db.from("playlists").update({ published_at: new Date().toISOString() }).eq("id", p!.id);
    const ev = await kinds(a.id);
    const count = (k: string) => ev.filter((e) => e.kind === `commercial.${k}`).length;
    expect(count("trial_started")).toBe(1);
    expect(count("first_screen_paired")).toBe(1);
    expect(count("first_publish")).toBe(1);
    for (const e of ev) {
      expect(e.subject_name).toBeNull();
      expect(JSON.stringify(e.detail)).not.toMatch(/@|Cafe|Front|Lunch/);
    }
  });

  it("logs converted, plan_changed and canceled from plan changes", async () => {
    const a = await account();
    await db.from("accounts").update({ plan: "starter", subscription_status: "active" }).eq("id", a.id);
    await db.from("accounts").update({ plan: "business" }).eq("id", a.id);
    await db.from("accounts").update({ subscription_status: "canceled" }).eq("id", a.id);
    const ev = await kinds(a.id);
    expect(ev.find((e) => e.kind === "commercial.converted")?.detail).toMatchObject({ from: "trial", plan: "starter" });
    expect(ev.find((e) => e.kind === "commercial.plan_changed")?.detail).toMatchObject({ from: "starter", plan: "business" });
    expect(ev.filter((e) => e.kind === "commercial.canceled")).toHaveLength(1);
  });

  it("records trial_expired after grace and screens_during_trial at trial end, once", async () => {
    const a = await account();
    await screen(a.id);
    const ends = new Date(Date.now() - 4 * DAY).toISOString();
    await db.from("accounts").update({ trial_started_at: new Date(Date.now() - 18 * DAY).toISOString(), trial_ends_at: ends }).eq("id", a.id);
    await db.rpc("record_commercial_events");
    await db.rpc("record_commercial_events");
    const ev = await kinds(a.id);
    expect(ev.filter((e) => e.kind === "commercial.trial_expired")).toHaveLength(1);
    expect(ev.filter((e) => e.kind === "commercial.screens_during_trial")).toHaveLength(1);
    // Grandfathered accounts never expire.
    const g = await account();
    await db.from("accounts").update({ plan: "grandfathered", trial_ends_at: ends }).eq("id", g.id);
    await db.rpc("record_commercial_events");
    expect((await kinds(g.id)).some((e) => e.kind === "commercial.trial_expired")).toBe(false);
  });

  it("hides commercial events and the overview from customers", async () => {
    const overview = await db.rpc("commercial_overview", { p_days: 30 });
    expect(overview.error).toBeNull();
    expect(JSON.stringify(overview.data)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-|@/);
    const c = createClient(url, anon, { auth: { persistSession: false } });
    for (const fn of ["commercial_overview", "record_commercial_events", "request_account_deletion", "claim_due_account_deletions"]) {
      const r = await c.rpc(fn, {});
      expect(r.error, fn).not.toBeNull();
    }
    expect((await c.from("account_deletion_requests").select("id")).data ?? []).toHaveLength(0);
  });

  it("only lets the owner request deletion of their own account", async () => {
    const a = await account(), b = await account();
    const bad = await db.rpc("request_account_deletion", { p_account: a.id, p_user: b.userId });
    expect(bad.error?.message).toMatch(/not_owner/);
    const ok1 = await db.rpc("request_account_deletion", { p_account: a.id, p_user: a.userId });
    const ok2 = await db.rpc("request_account_deletion", { p_account: a.id, p_user: a.userId });
    expect(ok1.data).toBe(ok2.data); // one pending request
    await expect(deleteAccountData(a.id, b.userId)).rejects.toThrow(/not_owner/);
    expect((await db.from("accounts").select("id").eq("id", a.id)).data).toHaveLength(1);
  });

  it("the job deletes only due accounts: files, rows and sign-in, keeping a minimal record", async () => {
    const a = await account(), keep = await account(), early = await account();
    await screen(a.id); await screen(keep.id);
    for (const acc of [a, keep]) {
      const up = await db.storage.from("media").upload(`${acc.id}/sub/x.png`, Buffer.from("x"), { contentType: "image/png" });
      expect(up.error).toBeNull();
    }
    const r1 = await db.rpc("request_account_deletion", { p_account: a.id, p_user: a.userId });
    await db.rpc("request_account_deletion", { p_account: early.id, p_user: early.userId });
    await db.from("account_deletion_requests").update({ scheduled_for: new Date(Date.now() - 1000).toISOString() }).eq("id", r1.data);

    expect(await runDueDeletions({ dryRun: true })).toMatchObject({ deleted: 0 });
    expect((await db.from("accounts").select("id").eq("id", a.id)).data).toHaveLength(1);

    const res = await runDueDeletions({ dryRun: false });
    expect(res).toMatchObject({ deleted: 1, failed: 0 });
    expect((await db.from("accounts").select("id").eq("id", a.id)).data).toHaveLength(0);
    expect((await db.from("displays").select("id").eq("account_id", a.id)).data).toHaveLength(0);
    expect((await db.from("activity_events").select("id").eq("account_id", a.id)).data).toHaveLength(0);
    expect((await db.auth.admin.getUserById(a.userId)).data.user).toBeNull();
    expect((await db.storage.from("media").list(`${a.id}/sub`)).data ?? []).toHaveLength(0);
    const rec = await db.from("account_deletion_requests").select("*").eq("id", r1.data).single();
    expect(rec.data).toMatchObject({ status: "completed" });
    expect(JSON.stringify(rec.data)).not.toMatch(/@/);
    // Others untouched: not requested, and requested but not yet due.
    expect((await db.storage.from("media").list(`${keep.id}/sub`)).data).toHaveLength(1);
    for (const acc of [keep, early]) expect((await db.from("accounts").select("id").eq("id", acc.id)).data).toHaveLength(1);
    await db.storage.from("media").remove([`${keep.id}/sub/x.png`]);
  });
});
