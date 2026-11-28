import { readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// 0039 guest menu claims: idempotency key, server-only access, cascades, rollback.
const databaseUrl = process.env.DATABASE_URL || "";
if (!databaseUrl && process.env.CI) throw new Error("CI must set DATABASE_URL so the guest claims Postgres test runs.");
const root = databaseUrl ? new URL(databaseUrl) : null;
const dbName = "pantalla_guest_claims";
const sql = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");
const ACC = "33333333-3333-4333-8333-333333333333";
const ACC2 = "44444444-4444-4444-8444-444444444444";
const MENU = "55555555-5555-4555-8555-555555555555";

function urlFor(name: string) {
  const url = new URL(databaseUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

describe.skipIf(!databaseUrl)("0039 guest claims", () => {
  let client: Client;

  beforeAll(async () => {
    if (!root || !/^(localhost|127\.0\.0\.1)$/.test(root.hostname)) throw new Error("DATABASE_URL must point at localhost.");
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
      grant usage on schema public to anon, authenticated, service_role;
      create table public.accounts (id uuid primary key);
      create table public.menus (id uuid primary key, account_id uuid not null references public.accounts(id) on delete cascade);
      insert into public.accounts values ('${ACC}'), ('${ACC2}');
      insert into public.menus values ('${MENU}', '${ACC}');
    `);
    await client.query(sql("supabase/migrations/0039_guest_claims.sql"));
    await client.query(sql("supabase/migrations/0039_guest_claims.sql")); // safe to re-run
  });

  afterAll(async () => { await client?.end(); });

  it("one board per (account, browser draft): a second claim of the same draft conflicts", async () => {
    await client.query(`insert into public.guest_claims (account_id, draft_id) values ($1, 'draft-0001-abcd')`, [ACC]);
    await expect(client.query(`insert into public.guest_claims (account_id, draft_id) values ($1, 'draft-0001-abcd')`, [ACC])).rejects.toMatchObject({ code: "23505" });
    // Another account may use the same random id (it never sees the first account's row).
    await client.query(`insert into public.guest_claims (account_id, draft_id) values ($1, 'draft-0001-abcd')`, [ACC2]);
    await client.query(`update public.guest_claims set menu_id = $1 where account_id = $2 and draft_id = 'draft-0001-abcd'`, [MENU, ACC]);
  });

  it("refuses malformed draft ids", async () => {
    for (const id of ["short", "has space here", "x".repeat(65), "guest:abc-1234567"]) {
      await expect(client.query(`insert into public.guest_claims (account_id, draft_id) values ($1, $2)`, [ACC, id]), id).rejects.toMatchObject({ code: "23514" });
    }
  });

  it("is server-only: anon and signed-in roles can't read or write it", async () => {
    for (const role of ["anon", "authenticated"]) {
      for (const q of [`select * from public.guest_claims`, `insert into public.guest_claims (account_id, draft_id) values ('${ACC}', 'draft-9999-zzzz')`]) {
        await client.query("begin");
        try {
          await client.query(`set local role ${role}`);
          await expect(client.query(q), `${role} ${q}`).rejects.toMatchObject({ code: "42501" });
        } finally {
          await client.query("rollback");
        }
      }
    }
    const rls = (await client.query(`select relrowsecurity from pg_class where oid = 'public.guest_claims'::regclass`)).rows[0].relrowsecurity;
    expect(rls).toBe(true);
  });

  it("a deleted board leaves the claim (menu_id null); a deleted account removes its claims", async () => {
    await client.query(`delete from public.menus where id = $1`, [MENU]);
    expect((await client.query(`select menu_id from public.guest_claims where account_id = $1`, [ACC])).rows[0].menu_id).toBeNull();
    await client.query(`delete from public.accounts where id = $1`, [ACC]);
    expect((await client.query(`select count(*)::int as n from public.guest_claims where account_id = $1`, [ACC])).rows[0].n).toBe(0);
  });

  it("rolls back cleanly", async () => {
    await client.query(sql("supabase/rollback/0039_guest_claims.sql"));
    expect((await client.query(`select to_regclass('public.guest_claims') as t`)).rows[0].t).toBeNull();
    expect((await client.query(`select to_regclass('public.menus') as t`)).rows[0].t).toBe("menus");
  });
});
