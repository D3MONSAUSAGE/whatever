import { readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// DA-1 / 0029: the snapshot function's in-database service-role backstop (Gother M1), on real Postgres.
const databaseUrl = process.env.DATABASE_URL || "";
if (!databaseUrl && process.env.CI) {
  throw new Error("CI must set DATABASE_URL so the developer analytics privilege test runs.");
}

const root = databaseUrl ? new URL(databaseUrl) : null;
const dbName = "pantalla_dev_analytics";
const DEV = "11111111-1111-4111-8111-111111111111";
const ACCOUNT = "aaaaaaaa-1111-4111-8111-111111111111";
const SNAPSHOT = `select public.dev_analytics_snapshot('${DEV}', null) as s`;

function urlFor(name: string) {
  const url = new URL(databaseUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

describe.skipIf(!databaseUrl)("0029 dev_analytics_snapshot service-role backstop", () => {
  let client: Client;

  beforeAll(async () => {
    if (!root || !/^(localhost|127\.0\.0\.1)$/.test(root.hostname)) {
      throw new Error("DATABASE_URL must point at localhost for the developer analytics Postgres test.");
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
      do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
      do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
      do $$ begin create role service_role nologin; exception when duplicate_object then null; end $$;
      do $$ begin create role authenticator nologin; exception when duplicate_object then null; end $$;
      do $$ begin create role supabase_admin nologin; exception when duplicate_object then null; end $$;
      grant anon, authenticated, service_role to authenticator;
      create schema auth;
      create table auth.users (id uuid primary key, email text, created_at timestamptz default now(), email_confirmed_at timestamptz);
      create table public.accounts (id uuid primary key, owner_user_id uuid unique references auth.users(id) on delete cascade,
        created_at timestamptz default now(), plan text, trial_started_at timestamptz, trial_ends_at timestamptz,
        subscription_status text, comp_note text, signup_attribution jsonb, signup_attribution_at timestamptz);
      create table public.displays (id uuid primary key default gen_random_uuid(), account_id uuid references public.accounts(id) on delete cascade,
        created_at timestamptz default now(), status text default 'active', last_seen_at timestamptz, confirmed_at timestamptz);
      create table public.playback_events (id serial, account_id uuid references public.accounts(id) on delete cascade, at timestamptz default now());
      create table public.playlists (id uuid primary key default gen_random_uuid(), account_id uuid references public.accounts(id) on delete cascade, created_at timestamptz default now());
      create table public.activity_events (id serial, account_id uuid references public.accounts(id) on delete cascade,
        at timestamptz default now(), kind text, subject_name text, detail jsonb);
      create table public.display_uptime_hourly (display_id uuid, account_id uuid references public.accounts(id) on delete cascade,
        hour timestamptz, online_seconds int);
      grant usage on schema public to anon, authenticated, service_role, supabase_admin;
    `);
    await client.query(readFileSync(path.join(process.cwd(), "supabase/migrations/0029_dev_analytics.sql"), "utf8"));
    await client.query(`
      insert into auth.users (id, email) values ('${DEV}', 'dev@example.test');
      insert into public.accounts (id, owner_user_id, plan) values ('${ACCOUNT}', '${DEV}', 'trial');
      insert into public.developer_users (user_id) values ('${DEV}');
      -- A MISTAKEN grant, so only the in-function check stands between these roles and the data.
      grant execute on function public.dev_analytics_snapshot(uuid, timestamptz) to authenticated, anon, supabase_admin;
    `);
  });

  afterAll(async () => {
    await client?.end();
  });

  /** Run the snapshot as `sessionUser` (then `role`) with the given request.jwt.claims ('' = none). */
  async function callAs(sessionUser: string, role: string | null, claims: string) {
    await client.query("begin");
    try {
      await client.query(`set local session authorization ${sessionUser}`);
      if (role) await client.query(`set local role ${role}`);
      await client.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
      const res = await client.query(SNAPSHOT);
      return { ok: true as const, accounts: (res.rows[0].s.accounts as unknown[]).length };
    } catch (error) {
      return { ok: false as const, code: (error as { code?: string }).code, message: (error as Error).message };
    } finally {
      await client.query("rollback");
    }
  }

  it("refuses authenticated with NO claims under the API login role (missing role claim)", async () => {
    expect(await callAs("authenticator", "authenticated", "")).toMatchObject({ ok: false, code: "42501", message: "not_authorized" });
  });

  it("refuses anon and authenticated claims even with a mistaken EXECUTE grant", async () => {
    expect(await callAs("authenticator", "authenticated", '{"role":"authenticated"}')).toMatchObject({ ok: false, code: "42501" });
    expect(await callAs("authenticator", "anon", '{"role":"anon"}')).toMatchObject({ ok: false, code: "42501" });
    expect(await callAs("authenticator", "authenticated", '{"sub":"x"}')).toMatchObject({ ok: false, code: "42501" });
  });

  it("allows service_role claims", async () => {
    expect(await callAs("authenticator", "service_role", '{"role":"service_role"}')).toEqual({ ok: true, accounts: 1 });
  });

  it("allows a direct database-owner session without claims, and refuses one with non-service claims", async () => {
    expect(await callAs("supabase_admin", null, "")).toEqual({ ok: true, accounts: 1 });
    expect(await callAs("supabase_admin", null, '{"role":"authenticated"}')).toMatchObject({ ok: false, code: "42501" });
  });

  it("still refuses a service-role caller who isn't a developer", async () => {
    await client.query("begin");
    try {
      await client.query(`set local role service_role`);
      await client.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`);
      await expect(client.query(`select public.dev_analytics_snapshot('22222222-2222-4222-8222-222222222222', null)`)).rejects.toMatchObject({ code: "42501" });
    } finally {
      await client.query("rollback");
    }
  });
});
