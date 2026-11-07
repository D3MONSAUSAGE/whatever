import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.DATABASE_URL || "";
if (!databaseUrl && process.env.CI) {
  throw new Error("CI must set DATABASE_URL to a Postgres service so presentation concurrency tests run.");
}

const root = databaseUrl ? new URL(databaseUrl) : null;
const dbName = "pantalla_groups";

function urlFor(name: string) {
  const url = new URL(databaseUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

async function query(client: Client, sql: string, params: unknown[] = []) {
  return client.query(sql, params);
}

describe.skipIf(!databaseUrl)("presentation groups on PostgreSQL", () => {
  let client: Client;

  beforeAll(async () => {
    if (!root || !/^(localhost|127\.0\.0\.1)$/.test(root.hostname)) {
      throw new Error("DATABASE_URL must point at localhost for the presentation Postgres tests.");
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
      create schema if not exists auth;
      create table if not exists auth.users (id uuid primary key);
      create or replace function auth.uid() returns uuid language sql as $$ select null::uuid $$;
      create schema if not exists storage;
      create table if not exists storage.buckets (
        id text primary key,
        name text,
        public boolean,
        file_size_limit bigint,
        allowed_mime_types text[]
      );
    `);
    await client.query(`
      do $$ begin create role anon; exception when duplicate_object then null; end $$;
      do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
      do $$ begin create role service_role; exception when duplicate_object then null; end $$;
    `);
    const dir = path.join(process.cwd(), "supabase/migrations");
    const files = readdirSync(dir).filter((name) => name.endsWith(".sql")).sort();
    for (const file of files) {
      if (file.startsWith("0012_")) continue;
      const sql = readFileSync(path.join(dir, file), "utf8");
      await client.query(sql);
    }
    const migration = readFileSync(path.join(dir, "0019_presentation_groups.sql"), "utf8");
    expect(migration).not.toMatch(/set\s+updated_at\s*=\s*created_at/i);
  }, 60_000);

  afterAll(async () => {
    await client?.end();
  });

  it("leaves updated_at null when a row is not touched", async () => {
    const account = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    await query(client, `insert into auth.users (id) values ($1) on conflict do nothing`, [account]);
    await query(client, `insert into public.accounts (id, name, owner_user_id) values ($1, 'Cafe', $1)`, [account]);
    const media = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    await query(client, `
      insert into public.media (id, account_id, file_name, storage_path, mime_type, size_bytes, kind)
      values ($1, $2, 'old.png', $3, 'image/png', 10, 'image')
    `, [media, account, `${account}/${media}.png`]);
    const row = await query(client, `select updated_at from public.media where id = $1`, [media]);
    expect(row.rows[0].updated_at).toBeNull();
  });

  it("lets one of two concurrent finishes claim, and the loser cannot delete committed slides", async () => {
    const account = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const parent = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const committed = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    const staging = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    await query(client, `insert into auth.users (id) values ($1) on conflict do nothing`, [account]);
    await query(client, `insert into public.accounts (id, name, owner_user_id) values ($1, 'Race', $1)`, [account]);
    await query(client, `
      insert into public.media (id, account_id, file_name, storage_path, mime_type, size_bytes, kind, group_revision, processing_status, slide_count)
      values ($1, $2, 'deck.pptx', $3, 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 20, 'presentation', 1, 'ready', 1)
    `, [parent, account, `${account}/${parent}.pptx`]);
    await query(client, `
      insert into public.media (id, account_id, file_name, storage_path, mime_type, size_bytes, kind, source_media_id, slide_index, slide_revision)
      values
        ($1, $2, 'kept.png', $3, 'image/png', 8, 'image', $4, 0, 1),
        ($5, $2, 'partial.png', $6, 'image/png', 8, 'image', $4, 0, 2)
    `, [committed, account, `${account}/${committed}.png`, parent, staging, `${account}/${staging}.png`]);

    const a = new Client({ connectionString: urlFor(dbName) });
    const b = new Client({ connectionString: urlFor(dbName) });
    await a.connect();
    await b.connect();
    try {
      const [left, right] = await Promise.all([
        a.query(`select public.presentation_claim_group($1, $2, 1) as claim`, [account, parent]),
        b.query(`select public.presentation_claim_group($1, $2, 1) as claim`, [account, parent]),
      ]);
      const claims = [left.rows[0].claim, right.rows[0].claim] as { outcome: string; token?: string }[];
      expect(claims.filter((claim) => claim.outcome === "claimed")).toHaveLength(1);
      expect(claims.filter((claim) => claim.outcome === "busy")).toHaveLength(1);
      const winner = claims.find((claim) => claim.outcome === "claimed")!;
      const loserToken = "99999999-9999-4999-8999-999999999999";

      const lostDelete = await a.query(
        `select public.presentation_discard_staging($1, $2, $3) as paths`,
        [account, parent, loserToken],
      );
      expect(lostDelete.rows[0].paths).toEqual([]);
      const winnerDelete = await a.query(
        `select public.presentation_discard_staging($1, $2, $3) as paths`,
        [account, parent, winner.token],
      );
      expect(winnerDelete.rows[0].paths).toEqual([]);
      const stillThere = await query(client, `select id from public.media where source_media_id = $1 order by slide_revision`, [parent]);
      expect(stillThere.rows.map((row) => row.id)).toEqual([committed, staging]);
    } finally {
      await a.end();
      await b.end();
    }
  });

  it("rejects the old worker after its claim expires and keeps the winner's slides and the source", async () => {
    const account = "abababab-abab-4aba-8aba-abababababab";
    const parent = "bcbcbcbc-bcbc-4bcb-8bcb-bcbcbcbcbcbc";
    const source = `${account}/${parent}.pptx`;
    const tokenA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
    await query(client, `insert into auth.users (id) values ($1) on conflict do nothing`, [account]);
    await query(client, `insert into public.accounts (id, name, owner_user_id) values ($1, 'Fence', $1)`, [account]);
    await query(client, `
      insert into public.media (
        id, account_id, file_name, storage_path, mime_type, size_bytes, kind,
        group_revision, processing_status, processing_token, processing_generation, slide_count, updated_at
      ) values (
        $1, $2, 'deck.pptx', $3, 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        40, 'presentation', 0, 'processing', $4, 1, 0, now()
      )
    `, [parent, account, source, tokenA]);

    const early = "cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd";
    const inserted = await query(client, `
      select public.presentation_insert_slide($1, $2, $3, 'early.png', $4, 4, 10, 10, 0, 1, $5) as id
    `, [account, parent, early, `${account}/${early}.png`, tokenA]);
    expect(inserted.rows[0].id).toBe(early);

    await query(client, `update public.media set updated_at = now() - interval '10 minutes' where id = $1`, [parent]);
    const takeover = await query(client, `select public.presentation_claim_group($1, $2, 0) as claim`, [account, parent]);
    const claimB = takeover.rows[0].claim as { outcome: string; token: string; generation: number; revision: number };
    expect(claimB.outcome).toBe("claimed");
    expect(claimB.generation).toBe(2);
    expect(claimB.revision).toBe(0);

    const late = "dededede-dede-4ded-8ded-dededededede";
    const rejected = await query(client, `
      select public.presentation_insert_slide($1, $2, $3, 'late.png', $4, 4, 10, 10, 1, 1, $5) as id
    `, [account, parent, late, `${account}/${late}.png`, tokenA]);
    expect(rejected.rows[0].id).toBeNull();

    const stolenCommit = await query(client, `
      select public.presentation_commit_group($1, $2, 0, 1, 10, 10, 40, 'deck.pptx',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation', $3, 1, $4) as rev
    `, [account, parent, source, tokenA]);
    expect(stolenCommit.rows[0].rev).toBeNull();

    const failed = await query(client, `
      update public.media
      set processing_status = 'failed', processing_token = null
      where id = $1 and account_id = $2 and processing_token = $3
      returning id
    `, [parent, account, tokenA]);
    expect(failed.rowCount).toBe(0);
    const sourceRow = await query(client, `select storage_path, processing_token from public.media where id = $1`, [parent]);
    expect(sourceRow.rows[0].storage_path).toBe(source);
    expect(sourceRow.rows[0].processing_token).toBe(claimB.token);

    const cleaned = await query(client, `select public.presentation_discard_staging($1, $2, $3) as paths`, [account, parent, tokenA]);
    expect(cleaned.rows[0].paths).toEqual([`${account}/${early}.png`]);

    const slide0 = "e1e1e1e1-e1e1-41e1-81e1-e1e1e1e1e1e1";
    const slide1 = "e2e2e2e2-e2e2-42e2-82e2-e2e2e2e2e2e2";
    for (const [id, index] of [[slide0, 0], [slide1, 1]] as const) {
      const row = await query(client, `
        select public.presentation_insert_slide($1, $2, $3, $4, $5, 4, 1280, 720, $6, $7, $8) as id
      `, [account, parent, id, `slide-${index}.png`, `${account}/${id}.png`, index, claimB.generation, claimB.token]);
      expect(row.rows[0].id).toBe(id);
    }
    const again = await query(client, `
      select public.presentation_insert_slide($1, $2, $3, 'nope.png', $4, 4, 10, 10, 0, 1, $5) as id
    `, [account, parent, "e3e3e3e3-e3e3-43e3-83e3-e3e3e3e3e3e3", `${account}/nope.png`, tokenA]);
    expect(again.rows[0].id).toBeNull();

    const committed = await query(client, `
      select public.presentation_commit_group($1, $2, 0, 2, 1280, 720, 40, 'deck.pptx',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation', $3, $4, $5) as rev
    `, [account, parent, source, claimB.generation, claimB.token]);
    expect(Number(committed.rows[0].rev)).toBe(2);

    const slides = await query(client, `
      select id, slide_index, slide_revision, claim_token::text
      from public.media where source_media_id = $1
      order by slide_index
    `, [parent]);
    expect(slides.rows).toEqual([
      { id: slide0, slide_index: 0, slide_revision: 2, claim_token: claimB.token },
      { id: slide1, slide_index: 1, slide_revision: 2, claim_token: claimB.token },
    ]);
    const parentAfter = await query(client, `select storage_path, group_revision, slide_count from public.media where id = $1`, [parent]);
    expect(parentAfter.rows[0]).toMatchObject({ storage_path: source, group_revision: 2, slide_count: 2 });
  });

  it("detach removes the group and leaves the rest of the screen's playlist playable", async () => {
    const account = "12121212-1212-4121-8121-121212121212";
    const parent = "13131313-1313-4131-8131-131313131313";
    const slide = "14141414-1414-4141-8141-141414141414";
    const image = "15151515-1515-4151-8151-151515151515";
    const playlist = "16161616-1616-4161-8161-161616161616";
    const display = "17171717-1717-4171-8171-171717171717";
    const token = "display-token-hash-for-detach-test";
    await query(client, `insert into auth.users (id) values ($1) on conflict do nothing`, [account]);
    await query(client, `insert into public.accounts (id, name, owner_user_id) values ($1, 'Screen', $1)`, [account]);
    await query(client, `
      insert into public.media (id, account_id, file_name, storage_path, mime_type, size_bytes, kind, group_revision, processing_status, slide_count, group_duration_ms)
      values ($1, $2, 'deck.pptx', $3, 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 30, 'presentation', 1, 'ready', 1, 10000)
    `, [parent, account, `${account}/${parent}.pptx`]);
    await query(client, `
      insert into public.media (id, account_id, file_name, storage_path, mime_type, size_bytes, kind, source_media_id, slide_index, slide_revision)
      values ($1, $2, 'slide.png', $3, 'image/png', 9, 'image', $4, 0, 1)
    `, [slide, account, `${account}/${slide}.png`, parent]);
    await query(client, `
      insert into public.media (id, account_id, file_name, storage_path, mime_type, size_bytes, kind)
      values ($1, $2, 'poster.png', $3, 'image/png', 9, 'image')
    `, [image, account, `${account}/${image}.png`]);
    await query(client, `
      insert into public.playlists (id, account_id, name, default_duration_ms, transition, playback_mode, published_at, published_transition, published_playback_mode, revision)
      values ($1, $2, 'Lobby', 10000, 'none', 'auto', now(), 'none', 'auto', 1)
    `, [playlist, account]);
    await query(client, `
      insert into public.playlist_items (playlist_id, account_id, media_id, kind, position, duration_ms)
      values
        ($1, $2, $3, 'published', 0, 8000),
        ($1, $2, $4, 'published', 1, 10000),
        ($1, $2, $3, 'draft', 0, 8000),
        ($1, $2, $4, 'draft', 1, 10000)
    `, [playlist, account, image, parent]);
    await query(client, `
      insert into public.displays (id, account_id, name, assigned_playlist_id, content_version, token_hash, status)
      values ($1, $2, 'Bar', $3, 3, $4, 'active')
    `, [display, account, playlist, token]);

    const removed = await query(client, `select public.delete_presentation_group($1, $2) as paths`, [account, parent]);
    expect(removed.rows[0].paths).toEqual(expect.arrayContaining([`${account}/${parent}.pptx`, `${account}/${slide}.png`]));

    const screen = await query(client, `select assigned_playlist_id, content_version from public.displays where id = $1`, [display]);
    expect(screen.rows[0].assigned_playlist_id).toBe(playlist);
    expect(Number(screen.rows[0].content_version)).toBe(4);

    const playing = await query(client, `select media_id, storage_path, duration_ms from public.player_playlist($1)`, [token]);
    expect(playing.rows).toEqual([
      expect.objectContaining({ media_id: image, storage_path: `${account}/${image}.png`, duration_ms: 8000 }),
    ]);
    const dangling = await query(client, `
      select count(*)::int as n from public.playlist_items
      where media_id in ($1, $2, $3)
    `, [parent, slide, image]);
    expect(dangling.rows[0].n).toBe(2);
  });

  it("flatten keeps columns and turns a grouped playlist into slides the old player can show", async () => {
    const account = "18181818-1818-4181-8181-181818181818";
    const parent = "19191919-1919-4191-8191-191919191919";
    const slideA = "1a1a1a1a-1a1a-41a1-81a1-1a1a1a1a1a1a";
    const slideB = "1b1b1b1b-1b1b-41b1-81b1-1b1b1b1b1b1b";
    const playlist = "1c1c1c1c-1c1c-41c1-81c1-1c1c1c1c1c1c";
    const display = "1d1d1d1d-1d1d-41d1-81d1-1d1d1d1d1d1d";
    const token = "display-token-hash-for-flatten";
    await query(client, `insert into auth.users (id) values ($1) on conflict do nothing`, [account]);
    await query(client, `insert into public.accounts (id, name, owner_user_id) values ($1, 'Old', $1)`, [account]);
    await query(client, `
      insert into public.media (id, account_id, file_name, storage_path, mime_type, size_bytes, kind, group_revision, processing_status, slide_count, group_duration_ms)
      values ($1, $2, 'deck.pptx', $3, 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 40, 'presentation', 1, 'ready', 2, 15000)
    `, [parent, account, `${account}/${parent}.pptx`]);
    await query(client, `
      insert into public.media (id, account_id, file_name, storage_path, mime_type, size_bytes, kind, source_media_id, slide_index, slide_revision, slide_duration_ms)
      values
        ($1, $2, 'a.png', $3, 'image/png', 4, 'image', $4, 0, 1, 3500000),
        ($5, $2, 'b.png', $6, 'image/png', 4, 'image', $4, 1, 1, null)
    `, [slideA, account, `${account}/${slideA}.png`, parent, slideB, `${account}/${slideB}.png`]);
    await query(client, `
      insert into public.playlists (id, account_id, name, default_duration_ms, transition, playback_mode, published_at, published_transition, published_playback_mode, revision)
      values ($1, $2, 'Grouped', 10000, 'none', 'auto', now(), 'none', 'auto', 2)
    `, [playlist, account]);
    await query(client, `
      insert into public.playlist_items (playlist_id, account_id, media_id, kind, position, duration_ms)
      values ($1, $2, $3, 'published', 0, 20000), ($1, $2, $3, 'draft', 0, 20000)
    `, [playlist, account, parent]);
    await query(client, `
      insert into public.displays (id, account_id, name, assigned_playlist_id, content_version, token_hash, status)
      values ($1, $2, 'Wall', $3, 1, $4, 'active')
    `, [display, account, playlist, token]);

    const rollback = readFileSync(path.join(process.cwd(), "supabase/rollback/0019_presentation_groups.sql"), "utf8");
    expect(rollback).not.toMatch(/drop column/i);
    expect(rollback).not.toMatch(/duration_ms = 600000/i);
    await client.query(rollback);

    const parentRow = await query(client, `select group_revision, group_duration_ms, updated_at from public.media where id = $1`, [parent]);
    expect(Number(parentRow.rows[0].group_revision)).toBe(1);
    expect(Number(parentRow.rows[0].group_duration_ms)).toBe(15000);

    const playing = await query(client, `
      select media_id, storage_path, duration_ms from public.player_playlist($1) order by "position"
    `, [token]);
    expect(playing.rows.map((row) => row.media_id)).toEqual([slideA, slideB]);
    expect(playing.rows.map((row) => Number(row.duration_ms))).toEqual([3500000, 20000]);
    const screen = await query(client, `select content_version, assigned_playlist_id from public.displays where id = $1`, [display]);
    expect(screen.rows[0].assigned_playlist_id).toBe(playlist);
    expect(Number(screen.rows[0].content_version)).toBeGreaterThan(1);
  });
});
