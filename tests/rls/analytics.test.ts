import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";
import { removeCreatedTestUsers } from "../helpers/account-cleanup";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";
const service = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const local = /^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url);
const configured = local && anon.length > 20 && service.length > 20 && process.env.PANTALLA_ANALYTICS_MIGRATION !== "absent";

/** M8 (0005_analytics.sql): triggers, proof of play, purge, and that analytics tables stay server-only. Local DB only. */
describe.skipIf(!configured)("analytics schema", () => {
  const admin: SupabaseClient = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const created: string[] = [];
  afterAll(() => removeCreatedTestUsers(admin, created));

  it("buckets heartbeats, records outages, logs changes, confirms playback, and hides it all from users", async () => {
    const email = `pantalla-rls-${randomUUID()}@mailinator.com`;
    const password = `${randomUUID()}Aa1!`;
    const { data: u, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !u.user) throw new Error(error?.message);
    created.push(u.user.id);
    const { data: accountId } = await admin.rpc("ensure_account", { p_user_id: u.user.id, p_name: "Analytics Cafe" });
    const token = `an-${randomUUID()}`;
    const base = Date.now() - 3 * 3600_000;
    const at = (ms: number) => new Date(base + ms).toISOString();
    const { data: d, error: de } = await admin.from("displays")
      .insert({ account_id: accountId, name: "Bar TV", token_hash: token, last_seen_at: at(0) }).select("id").single();
    if (de) throw new Error(de.message);

    await admin.from("displays").update({ last_seen_at: at(30_000) }).eq("id", d.id);
    await admin.from("displays").update({ last_seen_at: at(60_000) }).eq("id", d.id);
    await admin.from("displays").update({ last_seen_at: at(60_000 + 20 * 60_000) }).eq("id", d.id); // 20 min gap
    await admin.from("displays").update({ content_version: 5 }).eq("id", d.id);

    const { data: buckets } = await admin.from("display_uptime_hourly").select("online_seconds").eq("display_id", d.id);
    expect((buckets ?? []).reduce((s, b) => s + (b.online_seconds as number), 0)).toBe(60);
    const { data: periods } = await admin.from("display_offline_periods").select("*").eq("display_id", d.id);
    expect(periods).toHaveLength(1);
    const { data: events } = await admin.from("activity_events").select("kind").eq("account_id", accountId);
    expect(events!.map((e) => e.kind).sort()).toEqual(["screen.content_changed", "screen.paired"]);

    expect((await admin.rpc("report_playing", { p_token_hash: token, p_version: 5 })).data).toBe(true);
    expect((await admin.rpc("report_playing", { p_token_hash: token, p_version: 5 })).data).toBe(true);
    expect((await admin.rpc("report_playing", { p_token_hash: "nope", p_version: 5 })).data).toBe(false);
    const { data: plays } = await admin.from("playback_events").select("version").eq("display_id", d.id);
    expect(plays).toHaveLength(1);
    const { data: row } = await admin.from("displays").select("confirmed_version").eq("id", d.id).single();
    expect(Number(row!.confirmed_version)).toBe(5);

    const dry = await admin.rpc("analytics_purge", { p_days: 90, p_dry_run: true });
    expect(dry.error).toBeNull();
    expect(dry.data).toMatchObject({ uptime: 0, offline: 0, activity: 0, playback: 0 });

    const user = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    await user.auth.signInWithPassword({ email, password });
    for (const table of ["display_uptime_hourly", "display_offline_periods", "playback_events", "activity_events"]) {
      const r = await user.from(table).select("*").limit(1);
      expect(r.error !== null || (r.data ?? []).length === 0, table).toBe(true);
    }
    for (const fn of ["report_playing", "analytics_purge"]) {
      const r = await user.rpc(fn, fn === "report_playing" ? { p_token_hash: token, p_version: 9 } : { p_days: 7, p_dry_run: false });
      expect(r.error, fn).not.toBeNull();
    }
  });
});
