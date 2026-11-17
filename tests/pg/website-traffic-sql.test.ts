import { readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// 0031 website traffic: collection, rollup, privacy (no hashes past their day), access backstop, snapshot.
const databaseUrl = process.env.DATABASE_URL || "";
if (!databaseUrl && process.env.CI) {
  throw new Error("CI must set DATABASE_URL so the website traffic Postgres test runs.");
}
const root = databaseUrl ? new URL(databaseUrl) : null;
const dbName = "pantalla_website_traffic";
const DEV = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const H = (n: number) => n.toString(16).padStart(64, "0");

function urlFor(name: string) {
  const url = new URL(databaseUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

describe.skipIf(!databaseUrl)("0031 website traffic", () => {
  let client: Client;

  beforeAll(async () => {
    if (!root || !/^(localhost|127\.0\.0\.1)$/.test(root.hostname)) {
      throw new Error("DATABASE_URL must point at localhost for the website traffic Postgres test.");
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
      -- The parts of 0029 that 0031 relies on.
      create table public.developer_users (user_id uuid primary key, role text not null default 'developer');
      create function public.is_developer(p_user uuid) returns boolean language sql stable security definer set search_path = ''
        as $$ select p_user is not null and exists (select 1 from public.developer_users d where d.user_id = p_user) $$;
      insert into public.developer_users (user_id, role) values ('${DEV}', 'admin');
    `);
    await client.query(readFileSync(path.join(process.cwd(), "supabase/migrations/0031_website_traffic.sql"), "utf8"));
    // Re-running the migration is safe.
    await client.query(readFileSync(path.join(process.cwd(), "supabase/migrations/0031_website_traffic.sql"), "utf8"));
    await actAsService(client);
  });

  // The app calls these functions with the service role's claims (PostgREST sets request.jwt.claims). Do the same,
  // so the test doesn't depend on which database user it connects as (CI connects as a non-owner role).
  const actAsService = (c: Client) => c.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', false)`);

  afterAll(async () => {
    await client?.end();
  });

  const rec = (day: string, hash: string, p: string, landing: boolean, channel = "direct", ref = "", utm = "") =>
    client.query(`select public.traffic_record($1::date, $2, $3, $4, $5, $6, $7)`, [day, hash, p, landing, channel, ref, utm]);
  const snap = async (actor: string, from: string, to: string) =>
    (await client.query(`select public.dev_traffic_snapshot($1, $2::date, $3::date) as s`, [actor, from, to])).rows[0].s;

  it("creates one random salt per day and deletes salts older than yesterday", async () => {
    const a = (await client.query(`select public.traffic_salt('2026-11-10') as s`)).rows[0].s as string;
    const b = (await client.query(`select public.traffic_salt('2026-11-10') as s`)).rows[0].s as string;
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(b).toBe(a);
    await client.query(`select public.traffic_salt('2026-11-12')`);
    const days = (await client.query(`select day::text from public.traffic_salts order by day`)).rows.map((r) => r.day);
    expect(days).toEqual(["2026-11-12"]);
  });

  it("counts page views, landings and unique visitors; keeps a source only on landings", async () => {
    await rec("2026-11-12", H(1), "/", true, "google_organic", "www.google.com", "");
    await rec("2026-11-12", H(1), "/pricing", false, "meta", "evil.example", "x");
    await rec("2026-11-12", H(2), "/es", true, "meta", "", "facebook");
    await rec("2026-11-12", H(2), "/es", false);
    const rows = (await client.query(`select path, channel, referrer_host, utm_source, page_views, landings from public.traffic_daily where day = '2026-11-12' order by path, channel`)).rows;
    expect(rows).toEqual([
      { path: "/", channel: "google_organic", referrer_host: "www.google.com", utm_source: "", page_views: 1, landings: 1 },
      { path: "/es", channel: "", referrer_host: "", utm_source: "", page_views: 1, landings: 0 },
      { path: "/es", channel: "meta", referrer_host: "", utm_source: "facebook", page_views: 1, landings: 1 },
      { path: "/pricing", channel: "", referrer_host: "", utm_source: "", page_views: 1, landings: 0 },
    ]);
    expect((await client.query(`select count(*)::int as n from public.traffic_visitors where day = '2026-11-12'`)).rows[0].n).toBe(2);
  });

  it("only accepts the public marketing pages", async () => {
    for (const bad of ["/dashboard", "/login", "/developer/analytics", "/player", "/api/health", "/es/dashboard", "/pricing?x=1", "/terms"]) {
      await expect(rec("2026-11-12", H(3), bad, false), bad).rejects.toMatchObject({ code: "23514" });
    }
    await expect(rec("2026-11-12", "not-a-hash", "/", false)).rejects.toMatchObject({ code: "23514" });
  });

  it("rolls a finished day into a count and deletes its hashes, without double counting", async () => {
    // A second connection racing the same rollup must not count yesterday twice.
    const other = new Client({ connectionString: urlFor(dbName) });
    await other.connect();
    await actAsService(other);
    try {
      await Promise.all([
        rec("2026-11-13", H(9), "/", true),
        other.query(`select public.traffic_record('2026-11-13'::date, $1, '/', true, 'direct', '', '')`, [H(8)]),
      ]);
    } finally {
      await other.end();
    }
    expect((await client.query(`select count(*)::int as n from public.traffic_visitors where day < '2026-11-13'`)).rows[0].n).toBe(0);
    expect((await client.query(`select visitors from public.traffic_unique_daily where day = '2026-11-12'`)).rows[0].visitors).toBe(2);
    // A late write for an already closed day counts its page view but never changes the visitor count.
    await rec("2026-11-12", H(5), "/", true);
    await rec("2026-11-14", H(6), "/", true);
    expect((await client.query(`select visitors from public.traffic_unique_daily where day = '2026-11-12'`)).rows[0].visitors).toBe(2);
    expect((await client.query(`select count(*)::int as n from public.traffic_visitors where day < '2026-11-14'`)).rows[0].n).toBe(0);
  });

  it("gives developers daily totals, top pages and sources for the range", async () => {
    const s = await snap(DEV, "2026-11-11", "2026-11-14");
    expect(s.daily).toEqual([
      { day: "2026-11-11", visitors: 0, page_views: 0, landings: 0 },
      { day: "2026-11-12", visitors: 2, page_views: 5, landings: 3 },
      { day: "2026-11-13", visitors: 2, page_views: 2, landings: 2 },
      { day: "2026-11-14", visitors: 1, page_views: 1, landings: 1 },
    ]);
    expect(s.pages[0]).toEqual({ path: "/", page_views: 5, landings: 5 });
    expect(s.sources).toContainEqual({ channel: "meta", referrer_host: "", utm_source: "facebook", landings: 1 });
    expect(s.sources.every((x: { channel: string }) => x.channel !== "")).toBe(true);
    expect(s.first_day).toBe("2026-11-12");
  });

  it("refuses non-developers and non-service callers, even with a mistaken grant", async () => {
    await expect(snap(OTHER, "2026-11-11", "2026-11-14")).rejects.toMatchObject({ code: "42501" });
    await client.query(`grant execute on function public.dev_traffic_snapshot(uuid, date, date) to anon, authenticated;
      grant execute on function public.traffic_record(date, text, text, boolean, text, text, text) to anon, authenticated;
      grant execute on function public.traffic_salt(date) to anon, authenticated`);
    for (const [role, claims] of [["anon", '{"role":"anon"}'], ["authenticated", '{"role":"authenticated"}'], ["authenticated", ""]] as const) {
      for (const sql of [
        `select public.dev_traffic_snapshot('${DEV}', '2026-11-11', '2026-11-14')`,
        `select public.traffic_record('2026-11-14', '${H(7)}', '/', true, 'direct', '', '')`,
        `select public.traffic_salt('2026-11-14')`,
      ]) {
        await client.query("begin");
        try {
          await client.query(`set local session authorization authenticator`);
          await client.query(`set local role ${role}`);
          await client.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
          await expect(client.query(sql), `${role} ${sql}`).rejects.toMatchObject({ code: "42501" });
        } finally {
          await client.query("rollback");
        }
      }
      // Tables are unreadable to browser roles.
      await client.query("begin");
      try {
        await client.query(`set local role ${role}`);
        await expect(client.query(`select * from public.traffic_daily`)).rejects.toMatchObject({ code: "42501" });
      } finally {
        await client.query("rollback");
      }
    }
    // The service role, with a developer actor, is allowed.
    await client.query("begin");
    try {
      await client.query(`set local session authorization authenticator`);
      await client.query(`set local role service_role`);
      await client.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`);
      const res = await client.query(`select public.dev_traffic_snapshot('${DEV}', '2026-11-11', '2026-11-14') as s`);
      expect(res.rows[0].s.daily).toHaveLength(4);
    } finally {
      await client.query("rollback");
    }
  });

  it("stores no IP addresses, user agents or account ids anywhere", async () => {
    const cols = (await client.query(`select table_name, column_name from information_schema.columns where table_schema = 'public' and table_name like 'traffic_%' order by 1, 2`)).rows
      .map((r) => `${r.table_name}.${r.column_name}`);
    expect(cols).toEqual([
      "traffic_daily.channel", "traffic_daily.day", "traffic_daily.landings", "traffic_daily.page_views", "traffic_daily.path", "traffic_daily.referrer_host", "traffic_daily.utm_source",
      "traffic_salts.day", "traffic_salts.salt",
      "traffic_unique_daily.day", "traffic_unique_daily.visitors",
      "traffic_visitors.day", "traffic_visitors.visitor_hash",
    ]);
  });

  it("deletes counters older than 400 days", async () => {
    await rec("2025-01-01", H(10), "/", true);
    await rec("2026-11-15", H(11), "/", true);
    expect((await client.query(`select count(*)::int as n from public.traffic_daily where day = '2025-01-01'`)).rows[0].n).toBe(0);
    expect((await client.query(`select count(*)::int as n from public.traffic_unique_daily where day = '2025-01-01'`)).rows[0].n).toBe(0);
  });

  // Late-arriving requests: a request for day D-1 can reach the database after a day-D request has already
  // closed D-1 (e.g. one sent just before midnight Pacific, or a small clock difference between server instances).
  const uniques = async (day: string) => (await client.query(`select visitors from public.traffic_unique_daily where day = $1`, [day])).rows[0]?.visitors ?? null;
  const hashesOn = async (day: string) => (await client.query(`select count(*)::int as n from public.traffic_visitors where day = $1`, [day])).rows[0].n;
  const viewsOn = async (day: string) => (await client.query(`select coalesce(sum(page_views), 0)::int as n from public.traffic_daily where day = $1`, [day])).rows[0].n;
  const settled = (p: Promise<unknown>) => Promise.race([p.then(() => true, () => true), new Promise((r) => setTimeout(() => r(false), 400))]);

  it("a late request for a closed day counts as a page view, never as a second visitor, and leaves no hash behind", async () => {
    await rec("2026-12-01", H(20), "/", true);
    await rec("2026-12-02", H(21), "/", true); // closes 2026-12-01
    expect(await uniques("2026-12-01")).toBe(1);
    await rec("2026-12-01", H(20), "/pricing", false); // the same visitor, late
    await rec("2026-12-01", H(23), "/", true); // a new visitor, late: can't be told apart from a repeat, so not counted
    expect(await hashesOn("2026-12-01")).toBe(0);
    await rec("2026-12-03", H(22), "/", true); // the next rollup must not add anything to 2026-12-01
    expect(await uniques("2026-12-01")).toBe(1);
    expect(await hashesOn("2026-12-01")).toBe(0);
    expect(await viewsOn("2026-12-01")).toBe(3);
    const s = await snap(DEV, "2026-12-01", "2026-12-01");
    expect(s.daily).toEqual([{ day: "2026-12-01", visitors: 1, page_views: 3, landings: 2 }]);
  });

  it("a late request that is mid-write when the day closes is rolled up exactly once", async () => {
    const other = new Client({ connectionString: urlFor(dbName) });
    await other.connect();
    await actAsService(other);
    try {
      await other.query("begin");
      await other.query(`select public.traffic_record('2026-12-03'::date, $1, '/', true, 'direct', '', '')`, [H(24)]);
      const closing = rec("2026-12-04", H(25), "/", true); // must wait for the open write to finish
      expect(await settled(closing)).toBe(false);
      await other.query("commit");
      await closing;
    } finally {
      await other.query("rollback").catch(() => {});
      await other.end();
    }
    expect(await uniques("2026-12-03")).toBe(2); // H(22) and H(24), once each
    expect(await hashesOn("2026-12-03")).toBe(0);
  });

  it("a late request that arrives while the day is closing waits, then adds no visitor", async () => {
    const other = new Client({ connectionString: urlFor(dbName) });
    await other.connect();
    await actAsService(other);
    try {
      await client.query("begin");
      await rec("2026-12-05", H(26), "/", true); // closes 2026-12-04 (H(25)) and keeps the transaction open
      const late = other.query(`select public.traffic_record('2026-12-04'::date, $1, '/features', false, 'direct', '', '')`, [H(25)]);
      expect(await settled(late)).toBe(false);
      await client.query("commit");
      await late;
    } finally {
      await client.query("rollback").catch(() => {});
      await other.end();
    }
    expect(await uniques("2026-12-04")).toBe(1);
    expect(await hashesOn("2026-12-04")).toBe(0);
    expect(await viewsOn("2026-12-04")).toBe(2);
    await rec("2026-12-06", H(27), "/", true);
    expect(await uniques("2026-12-04")).toBe(1);
  });
});
