import { readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CTA_LOCATIONS, FUNNEL_EVENTS, GUEST_ACTIONS, GUEST_SOURCES, SIGNUP_ERROR_CODES, TEMPLATE_TRY_SPOTS } from "@/lib/funnel";

// 0032 signup funnel counters: counting, allow-list, access backstop, snapshot, rollback.
const databaseUrl = process.env.DATABASE_URL || "";
if (!databaseUrl && process.env.CI) {
  throw new Error("CI must set DATABASE_URL so the funnel Postgres test runs.");
}
const root = databaseUrl ? new URL(databaseUrl) : null;
const dbName = "pantalla_funnel_daily";
const DEV = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const sql = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");

function urlFor(name: string) {
  const url = new URL(databaseUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

describe.skipIf(!databaseUrl)("0032 funnel daily counters", () => {
  let client: Client;

  beforeAll(async () => {
    if (!root || !/^(localhost|127\.0\.0\.1)$/.test(root.hostname)) {
      throw new Error("DATABASE_URL must point at localhost for the funnel Postgres test.");
    }
    const admin = new Client({ connectionString: urlFor(root.pathname.replace(/^\//, "") || "pantalla") });
    await admin.connect();
    try {
      await admin.query(`select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()`, [dbName]);
      await admin.query(`drop database if exists ${dbName}`);
      await admin.query(`create database ${dbName}`);
    } finally {
      await admin.end();
    }
    client = new Client({ connectionString: urlFor(dbName) });
    await client.connect();
    await client.query(`
      do $$ begin create role anon nologin; exception when duplicate_object or unique_violation then null; end $$;
      do $$ begin create role authenticated nologin; exception when duplicate_object or unique_violation then null; end $$;
      do $$ begin create role service_role nologin; exception when duplicate_object or unique_violation then null; end $$;
      do $$ begin create role authenticator nologin; exception when duplicate_object or unique_violation then null; end $$;
      grant anon, authenticated, service_role to authenticator;
      grant usage on schema public to anon, authenticated, service_role;
      create table public.developer_users (user_id uuid primary key, role text not null default 'developer');
      create function public.is_developer(p_user uuid) returns boolean language sql stable security definer set search_path = ''
        as $$ select p_user is not null and exists (select 1 from public.developer_users d where d.user_id = p_user) $$;
      insert into public.developer_users (user_id, role) values ('${DEV}', 'admin');
    `);
    await client.query(sql("supabase/migrations/0031_website_traffic.sql"));
    await client.query(sql("supabase/migrations/0032_funnel_daily.sql"));
    // Re-running the migration is safe.
    await client.query(sql("supabase/migrations/0032_funnel_daily.sql"));
    // 0038 widens the event list for the guest editor (and is safe to re-run too).
    await client.query(sql("supabase/migrations/0038_guest_funnel_events.sql"));
    await client.query(sql("supabase/migrations/0038_guest_funnel_events.sql"));
    await client.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', false)`);
  });

  afterAll(async () => {
    await client?.end();
  });

  const rec = (day: string, event: string, detail = "") => client.query(`select public.funnel_record($1::date, $2, $3)`, [day, event, detail]);
  const snap = async (actor: string, from: string, to: string) =>
    (await client.query(`select public.dev_funnel_snapshot($1, $2::date, $3::date) as s`, [actor, from, to])).rows[0].s;

  it("counts events per day, event and detail", async () => {
    await rec("2026-11-18", "cta_click", "hero");
    await rec("2026-11-19", "cta_click", "hero");
    await rec("2026-11-19", "cta_click", "hero");
    await rec("2026-11-19", "signup_view");
    await rec("2026-11-19", "signup_error", "short_password");
    const s = await snap(DEV, "2026-11-19", "2026-11-19");
    expect(s.first_day).toBe("2026-11-18");
    expect(s.rows).toEqual([
      { event: "cta_click", detail: "hero", count: 2 },
      { event: "signup_error", detail: "short_password", count: 1 },
      { event: "signup_view", detail: "", count: 1 },
    ]);
    expect((await snap(DEV, "2026-11-18", "2026-11-19")).rows[0]).toEqual({ event: "cta_click", detail: "hero", count: 3 });
  });

  it("accepts every event and detail the app sends, and rejects anything else", async () => {
    const allowed: [string, string][] = [
      ...CTA_LOCATIONS.map((d) => ["cta_click", d] as [string, string]),
      ["signup_view", ""], ["signup_submit", ""],
      ...SIGNUP_ERROR_CODES.map((d) => ["signup_error", d] as [string, string]),
      ...TEMPLATE_TRY_SPOTS.map((d) => ["template_try", d] as [string, string]),
      ...GUEST_SOURCES.map((d) => ["guest_open", d] as [string, string]),
      ["guest_edit", ""], ["guest_preview", ""],
      ...GUEST_ACTIONS.map((d) => ["guest_action", d] as [string, string]),
      ...GUEST_ACTIONS.map((d) => ["signup_prompt", d] as [string, string]),
    ];
    expect(new Set(allowed.map(([e]) => e))).toEqual(new Set(FUNNEL_EVENTS));
    for (const [e, d] of allowed) await rec("2026-11-17", e, d);
    for (const [e, d] of [["purchase", ""], ["signup_error", "owner@example.com"], ["signup_error", "Has Spaces"], ["cta_click", "x".repeat(31)]]) {
      await expect(rec("2026-11-17", e, d), `${e} ${d}`).rejects.toMatchObject({ code: "23514" });
    }
  });

  it("stores no person, account, address or browser data", async () => {
    const cols = (await client.query(`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'funnel_daily' order by 1`)).rows.map((r) => r.column_name);
    expect(cols).toEqual(["count", "day", "detail", "event"]);
  });

  it("refuses non-developers and non-service callers, even with a mistaken grant", async () => {
    await expect(snap(OTHER, "2026-11-11", "2026-11-19")).rejects.toMatchObject({ code: "42501" });
    await client.query(`grant execute on function public.dev_funnel_snapshot(uuid, date, date) to anon, authenticated;
      grant execute on function public.funnel_record(date, text, text) to anon, authenticated`);
    for (const [role, claims] of [["anon", '{"role":"anon"}'], ["authenticated", '{"role":"authenticated"}'], ["authenticated", ""]] as const) {
      for (const q of [`select public.dev_funnel_snapshot('${DEV}', '2026-11-11', '2026-11-19')`, `select public.funnel_record('2026-11-19', 'signup_view', '')`]) {
        await client.query("begin");
        try {
          await client.query(`set local session authorization authenticator`);
          await client.query(`set local role ${role}`);
          await client.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
          await expect(client.query(q), `${role} ${q}`).rejects.toMatchObject({ code: "42501" });
        } finally {
          await client.query("rollback");
        }
      }
      await client.query("begin");
      try {
        await client.query(`set local role ${role}`);
        await expect(client.query(`select * from public.funnel_daily`)).rejects.toMatchObject({ code: "42501" });
      } finally {
        await client.query("rollback");
      }
    }
  });

  it("deletes rows older than 400 days", async () => {
    await rec("2025-01-01", "signup_view");
    await rec("2026-11-19", "signup_view");
    const old = (await client.query(`select count(*)::int as n from public.funnel_daily where day = '2025-01-01'`)).rows[0].n;
    expect(old).toBe(0);
  });

  it("0038 rolls back to the original event list, dropping only guest-editor rows", async () => {
    await rec("2026-11-20", "guest_open", "demo");
    await rec("2026-11-20", "signup_view");
    await client.query(sql("supabase/rollback/0038_guest_funnel_events.sql"));
    const left = (await client.query(`select event from public.funnel_daily where day = '2026-11-20' order by 1`)).rows.map((r) => r.event);
    expect(left).toEqual(["signup_view"]);
    await expect(rec("2026-11-20", "guest_open", "demo")).rejects.toMatchObject({ code: "23514" });
  });

  it("rolls back cleanly, leaving 0031 in place", async () => {
    await client.query(sql("supabase/rollback/0032_funnel_daily.sql"));
    const left = (await client.query(`select to_regclass('public.funnel_daily') as t, to_regclass('public.traffic_daily') as traffic`)).rows[0];
    expect(left.t).toBeNull();
    expect(left.traffic).toBe("traffic_daily");
    const fns = (await client.query(`select proname from pg_proc where proname in ('funnel_record', 'dev_funnel_snapshot')`)).rows;
    expect(fns).toEqual([]);
  });
});
