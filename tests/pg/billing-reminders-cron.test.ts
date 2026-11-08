import { readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.DATABASE_URL || "";
if (!databaseUrl && process.env.CI) {
  throw new Error("CI must set DATABASE_URL so the billing reminder privilege test runs.");
}

const root = databaseUrl ? new URL(databaseUrl) : null;
const dbName = "pantalla_reminders";
const secret = "fixture-cron-secret";

function urlFor(name: string) {
  const url = new URL(databaseUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

describe.skipIf(!databaseUrl)("billing reminder scheduler privileges", () => {
  let client: Client;

  beforeAll(async () => {
    if (!root || !/^(localhost|127\.0\.0\.1)$/.test(root.hostname)) {
      throw new Error("DATABASE_URL must point at localhost for the billing reminder Postgres test.");
    }
    const admin = new Client({ connectionString: urlFor(root.pathname.replace(/^\//, "") || "pantalla") });
    await admin.connect();
    try {
      await admin.query(`
        select pg_terminate_backend(pid) from pg_stat_activity
        where datname = $1 and pid <> pg_backend_pid()
      `, [dbName]);
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
    `);
    const migration = readFileSync(path.join(process.cwd(), "supabase/migrations/0022_billing_reminders_cron.sql"), "utf8");
    await client.query(migration);
    await client.query(`
      create schema if not exists vault;
      create table if not exists vault.decrypted_secrets (name text primary key, decrypted_secret text);
      create schema if not exists net;
      create sequence if not exists net.req_id;
      create table if not exists net.http_request_queue (
        id bigint primary key,
        url text not null,
        headers jsonb not null
      );
      create table if not exists net._http_response (
        id bigint primary key,
        status_code integer,
        content text,
        headers jsonb,
        error_msg text,
        timed_out boolean
      );
      create or replace function net.http_get(
        url text,
        params jsonb default '{}'::jsonb,
        headers jsonb default '{}'::jsonb,
        timeout_milliseconds integer default 2000
      ) returns bigint
      language plpgsql
      as $fn$
      declare
        new_id bigint;
      begin
        new_id := nextval('net.req_id');
        insert into net.http_request_queue (id, url, headers) values (new_id, url, headers);
        return new_id;
      end
      $fn$;
    `);
    await client.query(
      `insert into vault.decrypted_secrets (name, decrypted_secret) values ('seemple_cron_secret', $1)`,
      [secret],
    );
  }, 60_000);

  afterAll(async () => {
    await client?.end();
  });

  it("installs a security-definer function outside public and denies API roles", async () => {
    const fn = await client.query(`
      select n.nspname, p.prosecdef, p.proconfig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where p.proname = 'dispatch_billing_reminders'
    `);
    expect(fn.rows).toHaveLength(1);
    expect(fn.rows[0].nspname).toBe("private");
    expect(fn.rows[0].prosecdef).toBe(true);
    expect(fn.rows[0].proconfig.join(",")).toMatch(/search_path=/);
    expect(fn.rows[0].proconfig.some((item: string) => item === "search_path=" || item === 'search_path=""')).toBe(true);
    const publicFn = await client.query(`select to_regprocedure('public.dispatch_billing_reminders()') as name`);
    expect(publicFn.rows[0].name).toBeNull();

    for (const role of ["anon", "authenticated", "service_role"]) {
      const execute = await client.query(`select has_function_privilege($1, 'private.dispatch_billing_reminders(boolean)', 'execute') as ok`, [role]);
      const check = await client.query(`select has_function_privilege($1, 'private.billing_reminders_auth_check(bigint)', 'execute') as ok`, [role]);
      const usage = await client.query(`select has_schema_privilege($1, 'private', 'usage') as ok`, [role]);
      const read = await client.query(`select has_table_privilege($1, 'private.billing_reminder_dispatches', 'select') as ok`, [role]);
      expect(execute.rows[0].ok).toBe(false);
      expect(check.rows[0].ok).toBe(false);
      expect(usage.rows[0].ok).toBe(false);
      expect(read.rows[0].ok).toBe(false);
    }
    const rls = await client.query(`
      select c.relrowsecurity as enabled,
             (select count(*) from pg_policy pol where pol.polrelid = c.oid) as policies
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'private' and c.relname = 'billing_reminder_dispatches'
    `);
    expect(rls.rows[0].enabled).toBe(true);
    expect(Number(rls.rows[0].policies)).toBe(0);
    const postgres = await client.query(`select exists (select 1 from pg_roles where rolname = 'postgres') as present`);
    if (postgres.rows[0].present) {
      const grant = await client.query(`select has_function_privilege('postgres', 'private.dispatch_billing_reminders(boolean)', 'execute') as ok`);
      expect(grant.rows[0].ok).toBe(true);
    }

    await client.query(`set role service_role`);
    try {
      await expect(client.query(`select private.dispatch_billing_reminders(true)`)).rejects.toThrow(/permission denied/i);
    } finally {
      await client.query(`reset role`);
    }
  });

  it("builds the bearer server-side and returns no secret", async () => {
    const dispatched = await client.query(`select private.dispatch_billing_reminders(true) as result`);
    const result = dispatched.rows[0].result;
    expect(result).toMatchObject({ status: "dispatched", dry_run: true });
    expect(Object.keys(result).sort()).toEqual(["dry_run", "request_id", "status"]);
    expect(JSON.stringify(result)).not.toContain(secret);

    const queued = await client.query(`
      select url, (headers->>'Authorization' = 'Bearer ' || $2) as aligned
      from net.http_request_queue
      where id = $1
    `, [result.request_id, secret]);
    expect(queued.rows[0].url).toBe("https://pantalla-chi.vercel.app/api/cron/billing-reminders?dryRun=1");
    expect(queued.rows[0].aligned).toBe(true);

    await client.query(`
      insert into net._http_response (id, status_code, content, headers, error_msg, timed_out)
      values (
        $1, 200,
        '{"ok":true,"cronAuth":"accepted","enabled":false,"dryRun":true,"orgs":[{"email":"hidden@example.com"}]}',
        '{"authorization":"Bearer fixture-cron-secret"}'::jsonb,
        'Bearer fixture-cron-secret',
        false
      )
    `, [result.request_id]);
    const aligned = await client.query(`select private.billing_reminders_auth_check($1) as result`, [result.request_id]);
    expect(aligned.rows[0].result).toEqual({
      status: "checked",
      http_status: 200,
      timed_out: false,
      ok: true,
      enabled: false,
      dry_run: true,
      cron_auth: "accepted",
      auth: "aligned",
    });
    expect(JSON.stringify(aligned.rows[0].result)).not.toContain(secret);
    expect(JSON.stringify(aligned.rows[0].result)).not.toContain("hidden@example.com");

    await client.query(`update net._http_response set status_code = 401, content = '{"error":"Unauthorized."}' where id = $1`, [result.request_id]);
    const rejected = await client.query(`select private.billing_reminders_auth_check($1) as result`, [result.request_id]);
    expect(rejected.rows[0].result.auth).toBe("rejected");
    expect(rejected.rows[0].result.http_status).toBe(401);

    await client.query(`update net._http_response set status_code = 503, content = '{"error":"Cron is not configured."}' where id = $1`, [result.request_id]);
    const missing = await client.query(`select private.billing_reminders_auth_check($1) as result`, [result.request_id]);
    expect(missing.rows[0].result.auth).toBe("app_unconfigured");

    await client.query(`
      update net._http_response
      set status_code = 200,
          content = '{"ok":true,"cronAuth":"accepted","enabled":true,"dryRun":true,"orgs":[{"email":"hidden@example.com"}]}'
      where id = $1
    `, [result.request_id]);
    const flagOn = await client.query(`select private.billing_reminders_auth_check($1) as result`, [result.request_id]);
    expect(flagOn.rows[0].result.auth).toBe("flag_on");
    expect(JSON.stringify(flagOn.rows[0].result)).not.toContain("hidden@example.com");

    await client.query(`
      insert into net._http_response (id, status_code, content, headers, error_msg)
      values (424242, 200, $1, '{"authorization":"Bearer fixture-cron-secret"}'::jsonb, 'Bearer fixture-cron-secret')
    `, [secret]);
    const unknown = await client.query(`select private.billing_reminders_auth_check(424242) as result`);
    expect(unknown.rows[0].result).toEqual({ status: "unknown_request" });
    expect(JSON.stringify(unknown.rows[0].result)).not.toContain(secret);

    const pending = await client.query(`select private.dispatch_billing_reminders(false) as result`);
    expect(pending.rows[0].result.dry_run).toBe(false);
    const waiting = await client.query(`select private.billing_reminders_auth_check($1) as result`, [pending.rows[0].result.request_id]);
    expect(waiting.rows[0].result).toEqual({ status: "pending" });
    const liveUrl = await client.query(`select url from net.http_request_queue where id = $1`, [pending.rows[0].result.request_id]);
    expect(liveUrl.rows[0].url).toBe("https://pantalla-chi.vercel.app/api/cron/billing-reminders");
  });

  it("ignores an origin that would place the bearer token in a URL", async () => {
    await client.query(`
      insert into vault.decrypted_secrets (name, decrypted_secret)
      values ('pekko_app_origin', 'https://evil.example/path?token=fixture-cron-secret')
    `);
    const dispatched = await client.query(`select private.dispatch_billing_reminders(true) as result`);
    const queued = await client.query(`select url from net.http_request_queue where id = $1`, [dispatched.rows[0].result.request_id]);
    expect(queued.rows[0].url).toBe("https://pantalla-chi.vercel.app/api/cron/billing-reminders?dryRun=1");
    expect(queued.rows[0].url).not.toContain(secret);
    await client.query(`delete from vault.decrypted_secrets where name = 'pekko_app_origin'`);
  });

  it("does not call the app or return the secret when vault is empty, and swallows provider errors", async () => {
    await client.query(`update vault.decrypted_secrets set decrypted_secret = '' where name = 'seemple_cron_secret'`);
    const before = await client.query(`select count(*)::int as n from net.http_request_queue`);
    const empty = await client.query(`select private.dispatch_billing_reminders(true) as result`);
    const after = await client.query(`select count(*)::int as n from net.http_request_queue`);
    expect(empty.rows[0].result).toEqual({ status: "no_secret" });
    expect(after.rows[0].n).toBe(before.rows[0].n);
    await client.query(`update vault.decrypted_secrets set decrypted_secret = $1 where name = 'seemple_cron_secret'`, [secret]);

    await client.query(`
      create or replace function net.http_get(
        url text,
        params jsonb default '{}'::jsonb,
        headers jsonb default '{}'::jsonb,
        timeout_milliseconds integer default 2000
      ) returns bigint
      language plpgsql
      as $fn$
      begin
        raise exception 'boom %', (select decrypted_secret from vault.decrypted_secrets where name = 'seemple_cron_secret');
      end
      $fn$;
    `);
    const failed = await client.query(`select private.dispatch_billing_reminders(true) as result`);
    expect(failed.rows[0].result).toEqual({ status: "dispatch_failed" });
    expect(JSON.stringify(failed.rows[0].result)).not.toContain(secret);
  });

  it("rolls back only the billing scheduler", async () => {
    const rollback = readFileSync(path.join(process.cwd(), "supabase/rollback/0022_billing_reminders_cron.sql"), "utf8");
    await client.query(rollback);
    const left = await client.query(`
      select to_regprocedure('private.dispatch_billing_reminders(boolean)') as dispatch,
             to_regprocedure('private.billing_reminders_auth_check(bigint)') as check,
             to_regclass('private.billing_reminder_dispatches') as requests,
             to_regprocedure('public.dispatch_billing_reminders()') as public_dispatch
    `);
    expect(left.rows[0].dispatch).toBeNull();
    expect(left.rows[0].check).toBeNull();
    expect(left.rows[0].requests).toBeNull();
    expect(left.rows[0].public_dispatch).toBeNull();
    const vault = await client.query(`select decrypted_secret = $1 as same from vault.decrypted_secrets where name = 'seemple_cron_secret'`, [secret]);
    expect(vault.rows[0].same).toBe(true);
  });
});
