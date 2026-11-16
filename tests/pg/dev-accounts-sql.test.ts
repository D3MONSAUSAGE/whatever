import { readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// DA-2 / 0030: dev_accounts_list on real Postgres: caller backstop, field allowlist, live reads after deletion.
const databaseUrl = process.env.DATABASE_URL || "";
if (!databaseUrl && process.env.CI) {
  throw new Error("CI must set DATABASE_URL so the developer accounts privilege test runs.");
}

const root = databaseUrl ? new URL(databaseUrl) : null;
const dbName = "pantalla_dev_accounts";
const DEV = "11111111-1111-4111-8111-111111111111";
const OWNER = "22222222-2222-4222-8222-222222222222";
const ACCOUNT = "aaaaaaaa-1111-4111-8111-111111111111";
const DEV_ACCOUNT = "aaaaaaaa-2222-4222-8222-222222222222";
const ORPHAN = "33333333-3333-4333-8333-333333333333";
const LIST = `select public.dev_accounts_list('${DEV}') as s`;
const file = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");

function urlFor(name: string) {
  const url = new URL(databaseUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

/** The real plan_screen_limit and account_entitlement from 0015 (latest definitions), so trial state isn't stubbed. */
function entitlementSql() {
  const src = file("supabase/migrations/0015_comp_plan.sql");
  const limit = src.slice(src.indexOf("create or replace function public.plan_screen_limit"), src.indexOf("$$;", src.indexOf("create or replace function public.plan_screen_limit")) + 3);
  const start = src.indexOf("create or replace function public.account_entitlement");
  const ent = src.slice(start, src.indexOf("end $$;", start) + 7);
  return `${limit}\n${ent}`;
}

const ROW_KEYS = [
  "cancel_at_period_end", "comp", "created_at", "current_period_end", "deletion_pending", "email", "email_domain",
  "ever_confirmed", "excluded_reason", "first_paired_at", "first_playback_at", "id", "last_check_in_at",
  "last_confirmed_at", "last_owner_action_at", "last_owner_action_kind", "last_sign_in_at", "plan", "playback_ends_at",
  "plus_alias", "referrer_host", "screens_active", "screens_ever", "state", "subscription_status", "trial_ends_at",
  "trial_started_at", "user_confirmed", "user_created_at", "utm_campaign", "utm_medium", "utm_source",
];

describe.skipIf(!databaseUrl)("0030 dev_accounts_list", () => {
  let client: Client;

  beforeAll(async () => {
    if (!root || !/^(localhost|127\.0\.0\.1)$/.test(root.hostname)) {
      throw new Error("DATABASE_URL must point at localhost for the developer accounts Postgres test.");
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
      do $$ begin create role supabase_admin nologin; exception when duplicate_object or unique_violation then null; end $$;
      grant anon, authenticated, service_role to authenticator;
      create schema auth;
      create table auth.users (id uuid primary key, email text, created_at timestamptz default now(), email_confirmed_at timestamptz,
        last_sign_in_at timestamptz, encrypted_password text, raw_user_meta_data jsonb, phone text);
      create table public.accounts (id uuid primary key, name text, owner_user_id uuid unique references auth.users(id) on delete cascade,
        created_at timestamptz default now(), plan text default 'trial', trial_started_at timestamptz, trial_ends_at timestamptz,
        subscription_status text, current_period_end timestamptz, cancel_at_period_end boolean default false, grace_ends_at timestamptz,
        stripe_customer_id text, stripe_subscription_id text, comp_note text, signup_attribution jsonb, signup_attribution_at timestamptz);
      create table public.displays (id uuid primary key default gen_random_uuid(), account_id uuid references public.accounts(id) on delete cascade,
        name text, token_hash text, created_at timestamptz default now(), status text default 'active', last_seen_at timestamptz,
        confirmed_at timestamptz, billing_active boolean default true);
      create table public.playback_events (id serial, account_id uuid references public.accounts(id) on delete cascade, at timestamptz default now());
      create table public.playlists (id uuid primary key default gen_random_uuid(), account_id uuid references public.accounts(id) on delete cascade, created_at timestamptz default now());
      create table public.activity_events (id serial, account_id uuid references public.accounts(id) on delete cascade,
        at timestamptz default now(), kind text, subject_name text, detail jsonb);
      create table public.display_uptime_hourly (display_id uuid, account_id uuid references public.accounts(id) on delete cascade,
        hour timestamptz, online_seconds int);
      create table public.account_deletion_requests (id uuid primary key default gen_random_uuid(), account_id uuid not null, user_id uuid not null,
        requested_at timestamptz default now(), scheduled_for timestamptz not null, status text not null default 'pending');
      grant usage on schema public to anon, authenticated, service_role, supabase_admin;
    `);
    await client.query(entitlementSql());
    await client.query(file("supabase/migrations/0029_dev_analytics.sql"));
    await client.query(file("supabase/migrations/0030_dev_accounts.sql"));
    await client.query(`
      insert into auth.users (id, email, encrypted_password, raw_user_meta_data, phone, last_sign_in_at) values
        ('${DEV}', 'dev@example.test', 'HASH-SECRET-1', '{"display_name":"Dev Person"}', '+15550000001', now() - interval '1 day'),
        ('${OWNER}', 'owner+shop@public-mail.test', 'HASH-SECRET-2', '{"display_name":"Owner Person"}', '+15550000002', now() - interval '3 days'),
        ('${ORPHAN}', 'never@public-mail.test', 'HASH-SECRET-3', null, null, null);
      insert into public.accounts (id, name, owner_user_id, plan, trial_started_at, trial_ends_at, stripe_customer_id, stripe_subscription_id, signup_attribution) values
        ('${ACCOUNT}', 'Secret Business Name', '${OWNER}', 'trial', now() - interval '2 days', now() + interval '12 days', 'cus_SECRET', 'sub_SECRET',
         '{"utm_source":"facebook","utm_medium":"paid_social","referrer":"https://user:pw@l.facebook.com/path?q=secret","gclid":"GCLID-SECRET"}'),
        ('${DEV_ACCOUNT}', 'Dev Co', '${DEV}', 'trial', now() - interval '20 days', now() - interval '6 days', null, null, null);
      insert into public.displays (account_id, name, token_hash, created_at, last_seen_at, confirmed_at) values
        ('${ACCOUNT}', 'Secret Screen Name', 'TOKEN-HASH-SECRET', now() - interval '2 days', now() - interval '1 minute', now() - interval '1 hour');
      insert into public.displays (account_id, name, token_hash, created_at, status) values ('${ACCOUNT}', 'Old TV', 'TOKEN-2', now() - interval '2 days', 'revoked');
      insert into public.playback_events (account_id, at) values ('${ACCOUNT}', now() - interval '2 days');
      insert into public.activity_events (account_id, at, kind, subject_name, detail) values
        ('${ACCOUNT}', now() - interval '5 hours', 'playlist.published', 'Secret Playlist Name', '{"x":"Secret Detail"}'),
        ('${ACCOUNT}', now() - interval '1 hour', 'media.deleted', 'Secret File Name', '{}'),
        -- Fired by promo/schedule/playlist propagation too, so not an owner action (#132 OWNER_KINDS).
        ('${ACCOUNT}', now() - interval '30 minutes', 'screen.content_changed', 'Secret Screen Name', '{}');
      insert into public.account_deletion_requests (account_id, user_id, scheduled_for) values ('${ACCOUNT}', '${OWNER}', now() + interval '7 days');
      insert into public.developer_users (user_id) values ('${DEV}');
      insert into public.analytics_exclusions (account_id, reason) values ('${DEV_ACCOUNT}', 'internal');
      -- A MISTAKEN grant, so only the in-function check stands between these roles and the data.
      grant execute on function public.dev_accounts_list(uuid) to authenticated, anon, supabase_admin;
    `);
  });

  afterAll(async () => {
    await client?.end();
  });

  async function callAs(sessionUser: string, role: string | null, claims: string, sql = LIST) {
    await client.query("begin");
    try {
      await client.query(`set local session authorization ${sessionUser}`);
      if (role) await client.query(`set local role ${role}`);
      await client.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
      const res = await client.query(sql);
      return { ok: true as const, s: res.rows[0].s };
    } catch (error) {
      return { ok: false as const, code: (error as { code?: string }).code, message: (error as Error).message };
    } finally {
      await client.query("rollback");
    }
  }
  const asService = (sql = LIST) => callAs("authenticator", "service_role", '{"role":"service_role"}', sql);

  it("refuses anon/authenticated (with or without claims) even with a mistaken EXECUTE grant", async () => {
    expect(await callAs("authenticator", "authenticated", "")).toMatchObject({ ok: false, code: "42501", message: "not_authorized" });
    expect(await callAs("authenticator", "authenticated", '{"role":"authenticated"}')).toMatchObject({ ok: false, code: "42501" });
    expect(await callAs("authenticator", "anon", '{"role":"anon"}')).toMatchObject({ ok: false, code: "42501" });
    expect(await callAs("supabase_admin", null, '{"role":"authenticated"}')).toMatchObject({ ok: false, code: "42501" });
  });

  it("refuses a service-role caller who isn't a developer", async () => {
    expect(await asService(`select public.dev_accounts_list('${OWNER}') as s`)).toMatchObject({ ok: false, code: "42501" });
    expect(await asService(`select public.dev_accounts_list(null) as s`)).toMatchObject({ ok: false, code: "42501" });
  });

  it("is security definer with an empty search_path", async () => {
    const res = await client.query(`select proacl::text as acl, prosecdef, proconfig from pg_proc where proname = 'dev_accounts_list'`);
    expect(res.rows[0].prosecdef).toBe(true);
    expect(res.rows[0].proconfig).toEqual(['search_path=""']);
  });

  it("returns only the allowlisted fields for a developer, with nothing secret or content-bearing", async () => {
    const r = await asService();
    expect(r.ok).toBe(true);
    const s = (r as { s: { accounts: Record<string, unknown>[]; users_without_account: Record<string, unknown>[] } }).s;
    for (const a of s.accounts) expect(Object.keys(a).sort()).toEqual(ROW_KEYS);
    for (const u of s.users_without_account) expect(Object.keys(u).sort()).toEqual(["email", "email_domain", "id", "last_sign_in_at", "plus_alias", "user_confirmed", "user_created_at"]);
    const text = JSON.stringify(s);
    expect(text).not.toMatch(/SECRET|Secret|Person|\+1555|Dev Co|Old TV|GCLID|user:pw|\/path/);
    const acct = s.accounts.find((a) => a.id === ACCOUNT)!;
    expect(acct).toMatchObject({
      email: "owner+shop@public-mail.test", plus_alias: true, state: "trial", screens_active: 1, screens_ever: 2,
      ever_confirmed: true, last_owner_action_kind: "playlist.published", utm_source: "facebook",
      referrer_host: "l.facebook.com", deletion_pending: true, excluded_reason: null,
    });
    const dev = s.accounts.find((a) => a.id === DEV_ACCOUNT)!;
    expect(dev).toMatchObject({ excluded_reason: "internal", state: "expired", screens_ever: 0, last_owner_action_at: null });
    expect(s.users_without_account.map((u) => u.id)).toEqual([ORPHAN]);
  });

  it("allows a direct database-owner session without claims", async () => {
    expect(await callAs("supabase_admin", null, "")).toMatchObject({ ok: true });
  });

  it("reads live: a deleted user/account is gone on the next call, with no copy left behind", async () => {
    await client.query("begin");
    try {
      await client.query(`delete from auth.users where id = '${OWNER}'`);
      await client.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`);
      const res = await client.query(LIST);
      const text = JSON.stringify(res.rows[0].s);
      expect(text).not.toContain(ACCOUNT);
      expect(text).not.toContain("owner+shop@public-mail.test");
      // 0030 creates no table, so nothing else could still hold the row.
      const tables = await client.query(`select count(*)::int as n from pg_class where relkind = 'r' and relnamespace = 'public'::regnamespace and relname like '%account%list%'`);
      expect(tables.rows[0].n).toBe(0);
    } finally {
      await client.query("rollback");
    }
  });

  it("rollback removes only the function and can be re-applied", async () => {
    await client.query("begin");
    try {
      await client.query(file("supabase/rollback/0030_dev_accounts.sql").replace(/^begin;|commit;$/gm, ""));
      const gone = await client.query(`select count(*)::int as n from pg_proc where proname = 'dev_accounts_list'`);
      expect(gone.rows[0].n).toBe(0);
      const kept = await client.query(`select (select count(*) from public.accounts)::int as a, (select count(*) from public.developer_users)::int as d`);
      expect(kept.rows[0]).toEqual({ a: 2, d: 1 });
    } finally {
      await client.query("rollback");
    }
  });
});
