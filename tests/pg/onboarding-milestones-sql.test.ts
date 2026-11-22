import { readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Applies 0036 to production-shaped fixture tables and checks the backfill, the milestone function,
// the first-publish insert trigger, idempotent re-runs and the rollback.
const databaseUrl = process.env.DATABASE_URL || "";
if (!databaseUrl && process.env.CI) {
  throw new Error("CI must set DATABASE_URL so the onboarding milestone migration test runs.");
}
const root = databaseUrl ? new URL(databaseUrl) : null;
const dbName = "pantalla_onboarding";
const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");
const acct = (n: number) => `aaaaaaaa-0000-4000-8000-00000000000${n}`;

function urlFor(name: string) {
  const url = new URL(databaseUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

type Row = { m: Record<string, string>; c: Date | null; f: Date | null; d: Date | null };

describe.skipIf(!databaseUrl)("0036 onboarding milestones", () => {
  let client: Client;
  const account = async (n: number) =>
    (await client.query<Row>(`select onboarding_milestones m, onboarding_completed_at c, first_menu_celebrated_at f, onboarding_dismissed_at d
      from public.accounts where id = $1`, [acct(n)])).rows[0];
  const steps = async (n: number) => Object.keys((await account(n)).m).sort();
  const mark = async (n: number, s: string[], kind: string | null = null) =>
    (await client.query(`select public.onboarding_mark($1, $2::text[], 'web', $3) r`, [acct(n), s, kind])).rows[0].r as
      { milestones: Record<string, string>; completed_at: string | null };

  beforeAll(async () => {
    if (!root || !/^(localhost|127\.0\.0\.1)$/.test(root.hostname)) {
      throw new Error("DATABASE_URL must point at localhost for the onboarding Postgres test.");
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
    await client.query(read("tests/pg/fixtures/onboarding-schema.sql"));
    await client.query(read("tests/pg/fixtures/onboarding-seed.sql"));
    await client.query(read("supabase/migrations/0036_onboarding_milestones.sql"));
  });

  afterAll(async () => {
    await client?.end();
  });

  it("credits only qualifying first content", async () => {
    expect(await steps(1)).toEqual([]);
    expect(await steps(2)).toEqual(["first_menu", "preview_menu"]); // draft board with an item
    expect(await steps(3)).toEqual([]); // title-only board and its (menu).png still
    expect(await steps(4)).toEqual(["first_menu", "preview_menu"]); // finished upload
    expect(await steps(5)).toEqual([]); // converting, failed, promo still, slide child
  });

  it("marks backfilled first menus as already celebrated so nobody sees a late popup", async () => {
    expect((await account(2)).f).not.toBeNull();
    expect((await account(4)).f).not.toBeNull();
    expect((await account(1)).f).toBeNull();
    expect((await account(3)).f).toBeNull();
  });

  it("keeps finished accounts finished and never clears dismissal", async () => {
    expect((await account(6)).c).not.toBeNull(); // v1 existing customer
    expect((await account(8)).c).not.toBeNull(); // all five required steps from data
    expect(await steps(8)).toEqual(["customize_menu", "first_menu", "first_update", "preview_menu", "screen", "show_on_tv"]);
    const a7 = await account(7);
    expect(a7.d?.toISOString()).toBe("2026-11-20T10:00:00.000Z");
    expect(a7.c).toBeNull();
  });

  it("does not count a first publish to two TVs as an update, and credits optional steps from data", async () => {
    expect(await steps(9)).toEqual(["first_menu", "playlists", "preview_menu", "schedules", "screen", "show_on_tv"]);
    expect((await account(9)).c).toBeNull();
  });

  it("backfills a missing first publish once and re-runs without changes", async () => {
    const before = (await client.query(`select id, onboarding_milestones, onboarding_completed_at, first_menu_celebrated_at from public.accounts order by id`)).rows;
    const fp = await client.query(`select account_id, detail from public.activity_events where kind = 'commercial.first_publish' order by account_id`);
    expect(fp.rows.map((r) => r.account_id)).toEqual([acct(8), acct(9)]);
    expect(fp.rows[0].detail).toEqual({ backfilled: true });
    await client.query(read("supabase/migrations/0036_onboarding_milestones.sql"));
    const after = (await client.query(`select id, onboarding_milestones, onboarding_completed_at, first_menu_celebrated_at from public.accounts order by id`)).rows;
    expect(after).toEqual(before);
    expect((await client.query(`select count(*)::int n from public.activity_events where kind = 'commercial.first_publish'`)).rows[0].n).toBe(2);
  });

  it("logs commercial.first_publish for playlists inserted already published", async () => {
    await client.query(`insert into public.playlists (account_id, name, published_at) values ($1, 'Board', now()), ($1, 'Board 2', now())`, [acct(1)]);
    await client.query(`insert into public.playlists (account_id, name) values ($1, 'Draft')`, [acct(2)]);
    const rows = (await client.query(`select account_id, count(*)::int n from public.activity_events
      where kind = 'commercial.first_publish' and account_id = any($1::uuid[]) group by account_id`, [[acct(1), acct(2)]])).rows;
    expect(rows).toEqual([{ account_id: acct(1), n: 1 }]);
  });

  it("stamps milestones once, ignores unknown steps and completes on the five required steps", async () => {
    const first = await mark(1, ["first_menu"], "menu_board");
    const t = first.milestones.first_menu;
    expect(t).toMatch(/Z$/);
    await mark(1, ["first_menu", "bogus", "preview_menu"], "upload");
    expect((await account(1)).m.first_menu).toBe(t);
    expect(await steps(1)).toEqual(["first_menu", "preview_menu"]);
    const optional = await mark(1, ["screen", "show_on_tv", "schedules"]);
    expect(optional.completed_at).toBeNull(); // optional steps never complete onboarding
    const done = await mark(1, ["first_update"]);
    expect(done.completed_at).not.toBeNull();
    expect((await mark(1, ["playlists"])).completed_at).toBe(done.completed_at);
    const events = (await client.query(`select kind, detail from public.activity_events where account_id = $1 and kind like 'onboarding.%' order by id`, [acct(1)])).rows;
    expect(events.map((e) => e.kind)).toEqual([
      "onboarding.first_menu", "onboarding.preview_menu", "onboarding.screen", "onboarding.show_on_tv",
      "onboarding.schedules", "onboarding.first_update", "onboarding.completed", "onboarding.playlists",
    ]);
    expect(events[0].detail).toEqual({ source: "web", kind: "menu_board" });
  });

  it("is callable by the service role only and keeps milestones an object", async () => {
    const grants = (await client.query(`select grantee from information_schema.routine_privileges
      where routine_schema = 'public' and routine_name = 'onboarding_mark' and grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')`)).rows;
    expect(grants.map((g) => g.grantee)).toEqual(["service_role"]);
    await expect(client.query(`update public.accounts set onboarding_milestones = '[]' where id = $1`, [acct(1)])).rejects.toThrow();
  });

  it("rolls back cleanly and re-applies", async () => {
    await client.query(read("supabase/rollback/0036_onboarding_milestones.sql"));
    const cols = (await client.query(`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'accounts'
      and column_name in ('onboarding_milestones', 'onboarding_completed_at', 'first_menu_celebrated_at')`)).rows;
    expect(cols).toEqual([]);
    const dismissed = await client.query(`select onboarding_dismissed_at d from public.accounts where id = $1`, [acct(7)]);
    expect(dismissed.rows[0].d).not.toBeNull();
    await client.query(read("supabase/migrations/0036_onboarding_milestones.sql"));
    expect(await steps(8)).toContain("first_update");
  });
});
