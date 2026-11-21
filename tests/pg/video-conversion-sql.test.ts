import { readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.DATABASE_URL || "";
if (!databaseUrl && process.env.CI) {
  throw new Error("CI must set DATABASE_URL so the video conversion Postgres test runs.");
}

const root = databaseUrl ? new URL(databaseUrl) : null;
const dbName = "pantalla_video_conversion";
const ACCOUNT = "11111111-1111-4111-8111-111111111111";
const MEDIA_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MEDIA_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const MEDIA_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const HASH = "a".repeat(64);

function urlFor(name: string) {
  const url = new URL(databaseUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

describe.skipIf(!databaseUrl)("0033 video conversion budget ledger", () => {
  let client: Client;

  beforeAll(async () => {
    if (!root || !/^(localhost|127\.0\.0\.1)$/.test(root.hostname)) {
      throw new Error("DATABASE_URL must point at localhost for the video conversion Postgres test.");
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
      create table public.accounts (id uuid primary key);
      create table public.media (
        id uuid primary key,
        account_id uuid not null references public.accounts(id),
        processing_status text,
        storage_path text,
        kind text,
        width integer,
        height integer,
        duration_ms integer
      );
      create table public.displays (
        id uuid primary key,
        account_id uuid references public.accounts(id),
        token_hash text,
        status text,
        assigned_playlist_id uuid,
        assigned_media_id uuid,
        last_seen_at timestamptz,
        content_version integer
      );
      create table public.playlists (
        id uuid primary key,
        published_transition text,
        published_playback_mode text
      );
      create table public.playlist_items (
        id uuid primary key default gen_random_uuid(),
        playlist_id uuid,
        kind text,
        position integer,
        media_id uuid,
        duration_ms integer
      );
      insert into public.accounts (id) values ('${ACCOUNT}');
      insert into public.media (id, account_id, processing_status) values
        ('${MEDIA_A}', '${ACCOUNT}', 'processing'),
        ('${MEDIA_B}', '${ACCOUNT}', 'processing'),
        ('${MEDIA_C}', '${ACCOUNT}', 'processing');
    `);
    await client.query(readFileSync(path.join(process.cwd(), "supabase/migrations/0033_video_conversion.sql"), "utf8"));
    await client.query(readFileSync(path.join(process.cwd(), "supabase/migrations/0033_video_conversion.sql"), "utf8"));
    await actAsService(client);
  });

  const actAsService = (c: Client) => c.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', false)`);

  afterAll(async () => {
    await client?.end();
  });

  const reserve = (c: Client, mediaId: string, amount: number, month = "2026-11-01") =>
    c.query(
      `select public.reserve_video_conversion(
        $1::uuid, $2::uuid, $3::date, $4, $5, 'hvc1', 1000, 1920, 1080,
        $6, $7, 'coconut') as id`,
      [ACCOUNT, mediaId, month, amount, HASH, `${ACCOUNT}/${mediaId}.mp4`, `${ACCOUNT}/${mediaId}.converted.mp4`],
    );

  it("serializes concurrent reservations so reserved plus spent never exceeds the cap", async () => {
    const other = new Client({ connectionString: urlFor(dbName) });
    await other.connect();
    await actAsService(other);
    try {
      const results = await Promise.allSettled([
        reserve(client, MEDIA_A, 10_000),
        reserve(other, MEDIA_B, 10_000),
      ]);
      const ok = results.filter((row) => row.status === "fulfilled") as PromiseFulfilledResult<{ rows: { id: string }[] }>[];
      const failed = results.filter((row) => row.status === "rejected") as PromiseRejectedResult[];
      expect(ok.length).toBe(1);
      expect(failed.length).toBe(1);
      expect(String((failed[0].reason as { message?: string })?.message || failed[0].reason)).toMatch(/budget_exhausted/);
      const month = (await client.query(`select reserved_millis, spent_millis, job_count from public.video_conversion_months where month = '2026-11-01'`)).rows[0];
      expect(Number(month.reserved_millis)).toBe(10_000);
      expect(Number(month.spent_millis)).toBe(0);
      expect(Number(month.job_count)).toBe(1);
    } finally {
      await other.end();
    }
  });

  it("reconciles actual spend, is idempotent on replay, and does not charge a provider failure", async () => {
    const jobId = (await reserve(client, MEDIA_C, 45)).rows[0].id as string;
    await client.query(`select public.complete_video_conversion($1, 'ready', 15, null)`, [jobId]);
    const after = (await client.query(`select reserved_millis, spent_millis from public.video_conversion_months where month = '2026-11-01'`)).rows[0];
    expect(Number(after.reserved_millis)).toBe(10_000);
    expect(Number(after.spent_millis)).toBe(15);
    await client.query(`select public.complete_video_conversion($1, 'ready', 15, null)`, [jobId]);
    const replay = (await client.query(`select m.reserved_millis, m.spent_millis, j.actual_millis from public.video_conversion_months m join public.video_conversion_jobs j on j.month = m.month where j.id = $1`, [jobId])).rows[0];
    expect(Number(replay.reserved_millis)).toBe(10_000);
    expect(Number(replay.spent_millis)).toBe(15);
    expect(Number(replay.actual_millis)).toBe(15);
  });

  it("rejects a caller who is not the service role", async () => {
    await client.query(`select set_config('request.jwt.claims', '{"role":"authenticated"}', false)`);
    await expect(reserve(client, MEDIA_B, 15)).rejects.toMatchObject({ code: "42501" });
    await actAsService(client);
  });
});
