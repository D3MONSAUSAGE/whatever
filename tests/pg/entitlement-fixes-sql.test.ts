import { readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.DATABASE_URL || "";
if (!databaseUrl && process.env.CI) {
  throw new Error("CI must set DATABASE_URL so the entitlement fixes Postgres test runs.");
}

const root = databaseUrl ? new URL(databaseUrl) : null;
const dbName = "pantalla_entitlement_fixes";
const ACCT_A = "aaaaaaaa-1111-4111-8111-111111111111";
const ACCT_B = "bbbbbbbb-2222-4222-8222-222222222222";
const DISP_A1 = "11111111-aaaa-4111-8111-111111111111";
const DISP_B1 = "11111111-bbbb-4111-8111-111111111111";
const file = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");

function urlFor(name: string) {
  const url = new URL(databaseUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

describe.skipIf(!databaseUrl)("0035 entitlement fixes SQL", () => {
  let client: Client;

  beforeAll(async () => {
    if (!root || !/^(localhost|127\.0\.0\.1)$/.test(root.hostname)) {
      throw new Error("DATABASE_URL must point at localhost for the entitlement fixes Postgres test.");
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
      create table public.accounts (
        id uuid primary key,
        name text not null,
        owner_user_id uuid not null,
        created_at timestamptz not null default now(),
        plan text not null default 'trial',
        trial_started_at timestamptz default now(),
        trial_ends_at timestamptz default (now() + interval '14 days'),
        stripe_customer_id text,
        stripe_subscription_id text,
        subscription_status text,
        current_period_end timestamptz,
        cancel_at_period_end boolean not null default false,
        grace_ends_at timestamptz,
        comp_note text
      );
      create table public.locations (
        id uuid primary key default gen_random_uuid(),
        account_id uuid not null references public.accounts(id),
        created_at timestamptz not null default now()
      );
      create table public.displays (
        id uuid primary key,
        account_id uuid not null references public.accounts(id),
        location_id uuid,
        name text not null,
        status text not null default 'active',
        billing_active boolean not null default true,
        confirmed_at timestamptz,
        created_at timestamptz not null default now()
      );
      create table public.pairing_sessions (
        id uuid primary key default gen_random_uuid(),
        code_hash text not null,
        session_secret_hash text not null,
        status text not null default 'pending',
        display_id uuid,
        claimed_at timestamptz,
        expires_at timestamptz not null
      );
      create table public.stripe_events (
        id text primary key,
        type text not null,
        processed_at timestamptz
      );
    `);
    await client.query(file("supabase/migrations/0013_billing_entitlements.sql")
      .split("-- Backfill")[0]
      .slice(file("supabase/migrations/0013_billing_entitlements.sql").indexOf("create or replace function public.plan_screen_limit")));
    await client.query(file("supabase/migrations/0015_comp_plan.sql"));
    await client.query(file("supabase/migrations/0035_entitlement_fixes.sql"));
    await client.query(`
      insert into public.accounts (id, name, owner_user_id) values
        ('${ACCT_A}', 'Cafe A', '11111111-1111-4111-8111-111111111111'),
        ('${ACCT_B}', 'Cafe B', '22222222-2222-4222-8222-222222222222');
      insert into public.displays (id, account_id, name) values
        ('${DISP_A1}', '${ACCT_A}', 'A1'),
        ('${DISP_B1}', '${ACCT_B}', 'B1');
    `);
  });

  afterAll(async () => {
    await client?.end();
  });

  async function ent(accountId: string, now: string) {
    const res = await client.query(`select * from public.account_entitlement($1, $2::timestamptz)`, [accountId, now]);
    return res.rows[0];
  }

  it("Issue #1: caps failed-payment canceled accounts at least(grace_ends_at, current_period_end) and blocks unpaid/paused/incomplete", async () => {
    await client.query(`
      update public.accounts set
        plan = 'multi',
        subscription_status = 'canceled',
        grace_ends_at = '2026-11-08T08:00:00Z',
        current_period_end = '2026-11-25T08:00:00Z',
        trial_canceled_before_charge = false
      where id = '${ACCT_A}'
    `);
    expect(await ent(ACCT_A, "2026-11-08T07:59:59.999Z")).toMatchObject({ state: "active", playback_allowed: true });
    expect(await ent(ACCT_A, "2026-11-08T08:00:00.000Z")).toMatchObject({ state: "canceled", playback_allowed: false, screen_limit: 0 });
    expect((await client.query(`select public.display_entitled('${DISP_A1}', '2026-11-08T08:00:00Z') as ok`)).rows[0].ok).toBe(false);

    // Normal cancel without payment failure keeps access through current_period_end
    await client.query(`
      update public.accounts set grace_ends_at = null, current_period_end = '2026-11-25T08:00:00Z' where id = '${ACCT_A}'
    `);
    expect(await ent(ACCT_A, "2026-11-25T07:59:59.999Z")).toMatchObject({ state: "active", playback_allowed: true });
    expect(await ent(ACCT_A, "2026-11-25T08:00:00.000Z")).toMatchObject({ state: "canceled", playback_allowed: false });

    // Restricted statuses never leak active playback even if current_period_end is in the future
    for (const status of ["unpaid", "incomplete", "incomplete_expired", "paused"]) {
      await client.query(`update public.accounts set subscription_status = $1 where id = '${ACCT_A}'`, [status]);
      expect(await ent(ACCT_A, "2026-11-10T00:00:00Z")).toMatchObject({ state: "canceled", playback_allowed: false, screen_limit: 0 });
    }
  });

  it("Issue #4: Option B pre-charge cancellations keep 3-day trial_grace then expired, while paid cancels go straight to canceled", async () => {
    await client.query(`
      update public.accounts set
        plan = 'starter',
        trial_started_at = '2026-11-01T08:00:00Z',
        trial_ends_at = '2026-11-15T08:00:00Z',
        subscription_status = 'canceled',
        current_period_end = '2026-11-15T08:00:00Z',
        grace_ends_at = null,
        trial_canceled_before_charge = true
      where id = '${ACCT_A}'
    `);

    // Immediate cancel before trial end -> trial until Nov 15 08:00Z
    expect(await ent(ACCT_A, "2026-11-15T07:59:59.999Z")).toMatchObject({
      state: "trial", screen_limit: 5, playback_allowed: true, can_add_screen: true,
    });
    // Exact boundary in UTC and Pacific (-08:00) -> enters trial_grace
    const gStart = await ent(ACCT_A, "2026-11-15T00:00:00-08:00");
    expect(gStart).toMatchObject({
      state: "trial_grace", screen_limit: 5, playback_allowed: true, can_add_screen: false,
    });
    expect(gStart.trial_ends_at).toBeTruthy();
    expect((await client.query(`select public.display_entitled('${DISP_A1}', '2026-11-16T08:00:00Z') as ok`)).rows[0].ok).toBe(true);

    // 1 ms before 3-day grace ends -> still trial_grace
    expect(await ent(ACCT_A, "2026-11-18T07:59:59.999Z")).toMatchObject({ state: "trial_grace", playback_allowed: true });
    // Exact grace end -> expired
    expect(await ent(ACCT_A, "2026-11-18T08:00:00.000Z")).toMatchObject({
      state: "expired", screen_limit: 0, playback_allowed: false, can_add_screen: false, playback_ends_at: null,
    });
    expect((await client.query(`select public.display_entitled('${DISP_A1}', '2026-11-18T08:00:00Z') as ok`)).rows[0].ok).toBe(false);

    // Paid cancel (trial_canceled_before_charge = false) NEVER gets trial_grace even if trial_ends_at was later
    await client.query(`
      update public.accounts set
        plan = 'business',
        trial_ends_at = '2026-12-10T00:00:00Z',
        subscription_status = 'canceled',
        current_period_end = '2026-12-01T00:00:00Z',
        trial_canceled_before_charge = false
      where id = '${ACCT_B}'
    `);
    expect(await ent(ACCT_B, "2026-12-01T00:00:00Z")).toMatchObject({ state: "canceled", playback_allowed: false });
  });

  it("isolates tenants and rolls back cleanly without losing account data", async () => {
    await client.query(`
      update public.accounts set plan = 'multi', subscription_status = 'active', current_period_end = '2026-12-11T15:27:47Z', trial_canceled_before_charge = false where id = '${ACCT_B}';
    `);
    expect(await ent(ACCT_A, "2026-11-18T08:00:00Z")).toMatchObject({ state: "expired", playback_allowed: false });
    expect(await ent(ACCT_B, "2026-11-18T08:00:00Z")).toMatchObject({ state: "active", playback_allowed: true });
    expect((await client.query(`select public.display_entitled('${DISP_B1}', '2026-11-18T08:00:00Z') as ok`)).rows[0].ok).toBe(true);

    await client.query("begin");
    try {
      await client.query(file("supabase/rollback/0035_entitlement_fixes.sql").replace(/^begin;|commit;$/gm, ""));
      const col = await client.query(`
        select count(*)::int as n from information_schema.columns
        where table_schema = 'public' and table_name = 'accounts' and column_name = 'trial_canceled_before_charge'
      `);
      expect(col.rows[0].n).toBe(0);
      const count = await client.query(`select count(*)::int as n from public.accounts`);
      expect(count.rows[0].n).toBe(2);
    } finally {
      await client.query("rollback");
    }
  });
});
