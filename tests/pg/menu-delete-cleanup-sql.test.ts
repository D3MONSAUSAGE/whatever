import { readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// Parity Phase 1 item 3 / 0031: menu_delete_cleanup on real Postgres. Fixture data only (public repo).
const databaseUrl = process.env.DATABASE_URL || "";
if (!databaseUrl && process.env.CI) {
  throw new Error("CI must set DATABASE_URL so the menu delete cleanup test runs.");
}

const root = databaseUrl ? new URL(databaseUrl) : null;
const dbName = "pantalla_menu_cleanup";
const A = "aaaaaaaa-0000-4000-8000-000000000001";
const B = "bbbbbbbb-0000-4000-8000-000000000002";
const file = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");
const MIGRATION = "supabase/migrations/0031_menu_delete_cleanup.sql";

function urlFor(name: string) {
  const url = new URL(databaseUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

describe.skipIf(!databaseUrl)("0031 menu_delete_cleanup", () => {
  let client: Client;
  let other: Client;

  beforeAll(async () => {
    if (!root || !/^(localhost|127\.0\.0\.1)$/.test(root.hostname)) {
      throw new Error("DATABASE_URL must point at localhost for the menu delete cleanup Postgres test.");
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
    other = new Client({ connectionString: urlFor(dbName) });
    await client.connect();
    await other.connect();
    // The columns and foreign keys that matter, as in 0001-0019 (on delete behaviour included).
    await client.query(`
      do $$ begin create role anon nologin; exception when duplicate_object or unique_violation then null; end $$;
      do $$ begin create role authenticated nologin; exception when duplicate_object or unique_violation then null; end $$;
      do $$ begin create role service_role nologin; exception when duplicate_object or unique_violation then null; end $$;
      create table public.accounts (id uuid primary key, name text);
      create table public.media (id uuid primary key default gen_random_uuid(), account_id uuid not null references public.accounts(id) on delete cascade,
        file_name text not null, storage_path text not null unique, thumbnail_path text,
        source_media_id uuid references public.media(id) on delete set null);
      create table public.playlists (id uuid primary key default gen_random_uuid(), account_id uuid not null references public.accounts(id) on delete cascade, name text not null);
      create table public.playlist_items (id uuid primary key default gen_random_uuid(),
        playlist_id uuid not null references public.playlists(id) on delete cascade,
        account_id uuid not null references public.accounts(id) on delete cascade,
        media_id uuid not null references public.media(id) on delete cascade, kind text not null, position int not null default 0);
      create table public.displays (id uuid primary key default gen_random_uuid(), account_id uuid not null references public.accounts(id) on delete cascade,
        name text not null, status text not null default 'active', token_hash text,
        assigned_media_id uuid references public.media(id) on delete set null,
        assigned_playlist_id uuid references public.playlists(id) on delete set null, content_version int not null default 0);
      create table public.display_playback (display_id uuid primary key references public.displays(id) on delete cascade,
        account_id uuid not null references public.accounts(id) on delete cascade,
        playlist_id uuid references public.playlists(id) on delete set null);
      create table public.schedules (id uuid primary key default gen_random_uuid(), account_id uuid not null references public.accounts(id) on delete cascade,
        name text not null, playlist_id uuid not null references public.playlists(id) on delete cascade);
      create table public.menus (id uuid primary key default gen_random_uuid(), account_id uuid not null references public.accounts(id) on delete cascade,
        name text not null, content jsonb not null default '{}'::jsonb,
        media_id uuid references public.media(id) on delete set null, playlist_id uuid references public.playlists(id) on delete set null);
      create table public.promos (id uuid primary key default gen_random_uuid(), account_id uuid not null references public.accounts(id) on delete cascade,
        name text not null, content jsonb not null default '{}'::jsonb,
        media_id uuid references public.media(id) on delete set null, playlist_id uuid references public.playlists(id) on delete set null,
        menu_id uuid references public.menus(id) on delete set null, combo_playlist_id uuid references public.playlists(id) on delete set null);
      create table public.brand_kits (account_id uuid primary key references public.accounts(id) on delete cascade,
        logo_media_id uuid references public.media(id) on delete set null, identity jsonb not null default '{}'::jsonb);
      grant usage on schema public to anon, authenticated, service_role;
      grant select, insert, update, delete on all tables in schema public to service_role;
      insert into public.accounts values ('${A}', 'Fixture Cafe'), ('${B}', 'Other Fixture');
    `);
    await client.query(file(MIGRATION));
    await client.query(file(MIGRATION)); // idempotent
  });

  afterAll(async () => {
    await other?.end();
    await client?.end();
  });

  beforeEach(async () => {
    await client.query(`truncate public.brand_kits, public.promos, public.menus, public.schedules, public.display_playback,
      public.displays, public.playlist_items, public.playlists, public.media cascade`);
  });

  /** A menu as rerenderMenu leaves it: one render, one playlist with its draft + published slide. */
  async function seedMenu(account = A, name = "Lunch") {
    const media = (await client.query(`insert into public.media (account_id, file_name, storage_path) values ($1::uuid, $2, $1::text || '/' || gen_random_uuid() || '.png') returning id, storage_path`, [account, `${name} (menu).png`])).rows[0];
    const playlist = (await client.query(`insert into public.playlists (account_id, name) values ($1, $2) returning id`, [account, name])).rows[0];
    await client.query(`insert into public.playlist_items (playlist_id, account_id, media_id, kind) values ($1, $2, $3, 'draft'), ($1, $2, $3, 'published')`, [playlist.id, account, media.id]);
    const menu = (await client.query(`insert into public.menus (account_id, name, media_id, playlist_id) values ($1, $2, $3, $4) returning id`, [account, name, media.id, playlist.id])).rows[0];
    return { mediaId: String(media.id), path: String(media.storage_path), playlistId: String(playlist.id), menuId: String(menu.id) };
  }

  async function cleanup(menuId: string, account = A, db = client) {
    const res = await db.query(`select public.menu_delete_cleanup($1, $2) as r`, [account, menuId]);
    return res.rows[0].r;
  }
  const exists = async (table: string, id: string) => (await client.query(`select 1 from public.${table} where id = $1`, [id])).rowCount === 1;

  it("removes an exclusively owned playlist and render, and returns the storage path", async () => {
    const m = await seedMenu();
    expect(await cleanup(m.menuId)).toEqual({ playlistDeleted: true, playlistKept: null, mediaDeleted: true, mediaKept: null, paths: [m.path] });
    expect(await exists("menus", m.menuId)).toBe(false);
    expect(await exists("playlists", m.playlistId)).toBe(false);
    expect(await exists("media", m.mediaId)).toBe(false);
    expect((await client.query(`select count(*)::int as n from public.playlist_items`)).rows[0].n).toBe(0);
  });

  it("returns null for another account's menu and touches nothing", async () => {
    const m = await seedMenu();
    expect(await cleanup(m.menuId, B)).toBeNull();
    expect(await exists("menus", m.menuId)).toBe(true);
    expect(await exists("playlists", m.playlistId)).toBe(true);
  });

  const keptCases: [string, (m: Awaited<ReturnType<typeof seedMenu>>) => Promise<void>, string, string][] = [
    ["a screen has the playlist", async (m) => {
      await client.query(`insert into public.displays (account_id, name, token_hash, assigned_playlist_id) values ($1, 'Counter', 'h', $2)`, [A, m.playlistId]);
    }, "screen", "playlist"],
    ["an unpaired (revoked) screen still has the playlist", async (m) => {
      await client.query(`insert into public.displays (account_id, name, status, assigned_playlist_id) values ($1, 'Old', 'revoked', $2)`, [A, m.playlistId]);
    }, "screen", "playlist"],
    ["a TV's remote playback points at it", async (m) => {
      const d = (await client.query(`insert into public.displays (account_id, name) values ($1, 'Remote') returning id`, [A])).rows[0];
      await client.query(`insert into public.display_playback (display_id, account_id, playlist_id) values ($1, $2, $3)`, [d.id, A, m.playlistId]);
    }, "screen", "playlist"],
    ["a schedule uses it", async (m) => {
      await client.query(`insert into public.schedules (account_id, name, playlist_id) values ($1, 'Lunch rule', $2)`, [A, m.playlistId]);
    }, "schedule", "playlist"],
    ["a promo uses it as its combo playlist", async (m) => {
      await client.query(`insert into public.promos (account_id, name, combo_playlist_id) values ($1, 'Happy hour', $2)`, [A, m.playlistId]);
    }, "promo", "playlist"],
    ["another menu points at the same playlist", async (m) => {
      await client.query(`insert into public.menus (account_id, name, playlist_id) values ($1, 'Copy', $2)`, [A, m.playlistId]);
    }, "menu", "playlist"],
    ["another menu's layout mentions the playlist", async (m) => {
      await client.query(`insert into public.menus (account_id, name, content) values ($1, 'Layout', jsonb_build_object('zones', jsonb_build_array(jsonb_build_object('playlistId', $2::text))))`, [A, m.playlistId]);
    }, "menu", "playlist"],
    ["the owner added another slide to the playlist", async (m) => {
      const extra = (await client.query(`insert into public.media (account_id, file_name, storage_path) values ($1::uuid, 'photo.png', $1::text || '/extra.png') returning id`, [A])).rows[0];
      await client.query(`insert into public.playlist_items (playlist_id, account_id, media_id, kind, position) values ($1, $2, $3, 'draft', 1)`, [m.playlistId, A, extra.id]);
    }, "other_items", "playlist"],
  ];

  for (const [label, setup, reason] of keptCases) {
    it(`keeps the playlist and its render when ${label}`, async () => {
      const m = await seedMenu();
      await setup(m);
      const r = await cleanup(m.menuId);
      expect(r).toMatchObject({ playlistDeleted: false, playlistKept: reason, mediaDeleted: false, mediaKept: "playlist", paths: [] });
      expect(await exists("menus", m.menuId)).toBe(false);
      expect(await exists("playlists", m.playlistId)).toBe(true);
      expect(await exists("media", m.mediaId)).toBe(true);
      expect((await client.query(`select count(*)::int as n from public.playlist_items where playlist_id = $1`, [m.playlistId])).rows[0].n).toBeGreaterThanOrEqual(2);
      expect((await client.query(`select count(*)::int as n from public.schedules`)).rows[0].n).toBe(reason === "schedule" ? 1 : 0);
    });
  }

  const mediaCases: [string, (m: Awaited<ReturnType<typeof seedMenu>>) => Promise<void>, string][] = [
    ["another playlist has the render", async (m) => {
      const p = (await client.query(`insert into public.playlists (account_id, name) values ($1, 'Mix') returning id`, [A])).rows[0];
      await client.query(`insert into public.playlist_items (playlist_id, account_id, media_id, kind) values ($1, $2, $3, 'published')`, [p.id, A, m.mediaId]);
    }, "playlist"],
    ["a screen has the render assigned directly", async (m) => {
      await client.query(`insert into public.displays (account_id, name, assigned_media_id) values ($1, 'Direct', $2)`, [A, m.mediaId]);
    }, "screen"],
    ["a promo uses the render", async (m) => {
      await client.query(`insert into public.promos (account_id, name, media_id) values ($1, 'Promo', $2)`, [A, m.mediaId]);
    }, "promo"],
    ["another menu uses the render as a photo", async (m) => {
      await client.query(`insert into public.menus (account_id, name, content) values ($1, 'Photo menu', jsonb_build_object('photoMediaId', $2::text))`, [A, m.mediaId]);
    }, "menu"],
    ["the brand kit uses it", async (m) => {
      await client.query(`insert into public.brand_kits (account_id, logo_media_id) values ($1, $2)`, [A, m.mediaId]);
    }, "brand_kit"],
    ["another file was made from it", async (m) => {
      await client.query(`insert into public.media (account_id, file_name, storage_path, source_media_id) values ($1::uuid, 'slide', $1::text || '/child.png', $2)`, [A, m.mediaId]);
    }, "media"],
  ];

  for (const [label, setup, reason] of mediaCases) {
    it(`deletes the playlist but keeps the render when ${label}`, async () => {
      const m = await seedMenu();
      await setup(m);
      expect(await cleanup(m.menuId)).toMatchObject({ playlistDeleted: true, mediaDeleted: false, mediaKept: reason, paths: [] });
      expect(await exists("playlists", m.playlistId)).toBe(false);
      expect(await exists("media", m.mediaId)).toBe(true);
      // Nothing that used the render lost it.
      expect((await client.query(`select count(*)::int as n from public.displays where assigned_media_id is null and name = 'Direct'`)).rows[0].n).toBe(0);
    });
  }

  it("a menu with no playlist or render just goes", async () => {
    const menu = (await client.query(`insert into public.menus (account_id, name) values ($1, 'Empty') returning id`, [A])).rows[0];
    expect(await cleanup(String(menu.id))).toEqual({ playlistDeleted: false, playlistKept: null, mediaDeleted: false, mediaKept: null, paths: [] });
  });

  it("waits for a concurrent schedule that starts using the playlist, then keeps it", async () => {
    const m = await seedMenu();
    await other.query("begin");
    await other.query(`insert into public.schedules (account_id, name, playlist_id) values ($1, 'Racing rule', $2)`, [A, m.playlistId]);
    let settled = false;
    const pending = cleanup(m.menuId).then((r) => {
      settled = true;
      return r;
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(settled).toBe(false); // blocked on the playlist row lock
    await other.query("commit");
    expect(await pending).toMatchObject({ playlistDeleted: false, playlistKept: "schedule", mediaDeleted: false });
    expect((await client.query(`select count(*)::int as n from public.schedules`)).rows[0].n).toBe(1);
  });

  it("a write that starts after the cleanup fails its foreign key instead of pointing at a deleted playlist", async () => {
    const m = await seedMenu();
    const d = (await client.query(`insert into public.displays (account_id, name) values ($1, 'Late') returning id`, [A])).rows[0];
    await client.query("begin");
    await client.query(`select public.menu_delete_cleanup($1, $2)`, [A, m.menuId]);
    const late = other.query(`update public.displays set assigned_playlist_id = $1 where id = $2`, [m.playlistId, d.id]).then(() => "ok", (e: { code?: string }) => e.code);
    await new Promise((resolve) => setTimeout(resolve, 300));
    await client.query("commit");
    expect(await late).toBe("23503");
    expect((await client.query(`select assigned_playlist_id from public.displays where id = $1`, [d.id])).rows[0].assigned_playlist_id).toBeNull();
  });

  it("is SECURITY INVOKER with an empty search_path, executable by service_role only", async () => {
    const res = await client.query(`select proacl::text as acl, prosecdef, proconfig from pg_proc where proname = 'menu_delete_cleanup'`);
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].prosecdef).toBe(false);
    expect(res.rows[0].proconfig).toEqual(['search_path=""']);
    const acl = String(res.rows[0].acl);
    expect(acl).toContain("service_role=X");
    expect(acl).not.toMatch(/(^|[{,])=X/); // PUBLIC
    expect(acl).not.toContain("anon=");
    expect(acl).not.toContain("authenticated=");
    for (const role of ["anon", "authenticated"]) {
      const can = await client.query(`select has_function_privilege($1, 'public.menu_delete_cleanup(uuid, uuid)', 'execute') as ok`, [role]);
      expect(can.rows[0].ok).toBe(false);
    }
  });

  it("rollback removes only the function and the migration re-applies", async () => {
    await client.query(file("supabase/rollback/0031_menu_delete_cleanup.sql"));
    expect((await client.query(`select count(*)::int as n from pg_proc where proname = 'menu_delete_cleanup'`)).rows[0].n).toBe(0);
    await client.query(file("supabase/rollback/0031_menu_delete_cleanup.sql"));
    expect((await client.query(`select count(*)::int as n from pg_tables where schemaname = 'public'`)).rows[0].n).toBe(10);
    await client.query(file(MIGRATION));
    expect((await client.query(`select count(*)::int as n from pg_proc where proname = 'menu_delete_cleanup'`)).rows[0].n).toBe(1);
  });
});
