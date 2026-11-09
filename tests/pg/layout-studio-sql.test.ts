import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Resvg } from "@resvg/resvg-js";
import { applyLayoutSave } from "@/lib/layout-publish";
import { parseLayout, playerComposition, sampleLayout } from "@/lib/layout-studio";
import { renderLayoutPng } from "@/lib/server/layout-render";

const db = "layout_studio_local";
const account = "00000000-0000-4000-8000-0000000000aa";
const other = "00000000-0000-4000-8000-0000000000bb";
const photo = "00000000-0000-4000-8000-0000000000c1";
const video = "00000000-0000-4000-8000-0000000000c2";
const foreign = "00000000-0000-4000-8000-0000000000c3";
const menu = "00000000-0000-4000-8000-000000000040";
let scratch = false;
let root = "";

function psql(database: string, sql: string) {
  return execFileSync("sudo", ["-n", "-u", "postgres", "psql", "-d", database, "-v", "ON_ERROR_STOP=1", "-tAc", sql], { encoding: "utf8" }).trim();
}

function psqlFile(database: string, sql: string) {
  execFileSync("sudo", ["-n", "-u", "postgres", "psql", "-d", database, "-v", "ON_ERROR_STOP=1", "-f", "-"], { encoding: "utf8", input: sql });
}

function migrationFunctions() {
  const sql = readFileSync("supabase/migrations/0007_menu_boards.sql", "utf8");
  const start = sql.indexOf("create or replace function public.menu_create_playlist");
  const end = sql.indexOf("revoke all on function public.menu_create_playlist");
  if (start < 0 || end < start) throw new Error("menu functions were not found in 0007");
  return sql.slice(start, end);
}

describe("layout studio on local postgres", () => {
  beforeAll(() => {
    try {
      scratch = psql("postgres", "select inet_server_addr() is null") === "t";
    } catch {
      scratch = false;
    }
    if (!scratch) return;
    root = mkdtempSync(join(tmpdir(), "layout-studio-local-"));
    psql("postgres", `drop database if exists ${db}`);
    psql("postgres", `create database ${db}`);
    psqlFile(db, `
      create extension if not exists pgcrypto;
      create schema if not exists auth;
      create table auth.users (id uuid primary key);
      create table public.accounts (
        id uuid primary key,
        name text not null,
        owner_user_id uuid not null references auth.users(id)
      );
      create table public.media (
        id uuid primary key,
        account_id uuid not null references public.accounts(id),
        file_name text not null,
        storage_path text not null unique,
        mime_type text not null,
        size_bytes integer not null,
        kind text
      );
      create table public.playlists (
        id uuid primary key default gen_random_uuid(),
        account_id uuid not null references public.accounts(id),
        name text not null check (char_length(name) between 1 and 80),
        default_duration_ms integer not null default 10000,
        transition text not null default 'none',
        published_at timestamptz,
        published_transition text,
        revision integer not null default 0,
        updated_at timestamptz not null default now()
      );
      create table public.playlist_items (
        id uuid primary key default gen_random_uuid(),
        playlist_id uuid not null references public.playlists(id),
        account_id uuid not null references public.accounts(id),
        media_id uuid not null references public.media(id),
        kind text not null check (kind in ('draft', 'published')),
        position integer not null,
        duration_ms integer
      );
      create table public.displays (
        id uuid primary key,
        account_id uuid not null references public.accounts(id),
        name text not null,
        assigned_media_id uuid,
        assigned_playlist_id uuid,
        content_version integer not null default 0
      );
      create table public.menus (
        id uuid primary key,
        account_id uuid not null references public.accounts(id),
        name text not null,
        template text not null check (template in ('classic', 'fresh', 'bold')),
        content jsonb not null,
        media_id uuid,
        playlist_id uuid
      );
    `);
    psqlFile(db, migrationFunctions());
    psql(db, `
      insert into auth.users values ('00000000-0000-4000-8000-0000000000a1'), ('00000000-0000-4000-8000-0000000000b1');
      insert into public.accounts values ('${account}', 'Local cafe', '00000000-0000-4000-8000-0000000000a1'), ('${other}', 'Other', '00000000-0000-4000-8000-0000000000b1');
    `);
  });

  afterAll(() => {
    if (scratch) psql("postgres", `drop database if exists ${db}`);
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it("stores a library photo and video, then publishes through the migration functions", async () => {
    if (!scratch) return;
    const red = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#ff0000"/></svg>`).render().asPng();
    const photoPath = `${account}/${photo}.png`;
    const videoPath = `${account}/${video}.mp4`;
    writeFileSync(join(root, `${photo}.png`), red);
    writeFileSync(join(root, `${video}.mp4`), Buffer.from("local-video"));
    const photoSql = photoPath.replace(/'/g, "''");
    const videoSql = videoPath.replace(/'/g, "''");
    psql(db, `
      insert into public.media values
        ('${photo}', '${account}', 'patio.png', '${photoSql}', 'image/png', ${red.length}, 'image'),
        ('${video}', '${account}', 'promo.mp4', '${videoSql}', 'video/mp4', 11, 'video'),
        ('${foreign}', '${other}', 'theirs.png', '${other}/theirs.png', 'image/png', 4, 'image');
      insert into public.menus values
        ('${menu}', '${account}', 'Evening', 'classic', '{"title":"Evening"}', null, null);
    `);
    const doc = {
      ...sampleLayout("signature"),
      title: "Evening service",
      font: "noto-serif" as const,
      imageMediaId: photo,
      videoMediaId: video,
    };
    const files = [
      { id: photo, accountId: account, mime: "image/png", kind: "image" as const },
      { id: video, accountId: account, mime: "video/mp4", kind: "video" as const },
      { id: foreign, accountId: other, mime: "image/png", kind: "image" as const },
    ];
    const stolen = await applyLayoutSave({
      enabled: true, accountId: account, mode: "publish", document: { ...doc, videoMediaId: foreign }, files, previousMediaId: null,
    }, {
      writeContent: async () => { throw new Error("wrote"); },
      render: async () => { throw new Error("rendered"); },
      swap: async () => { throw new Error("swapped"); },
    });
    expect(stolen.ok).toBe(false);

    await applyLayoutSave({
      enabled: true, accountId: account, mode: "draft", document: doc, files, previousMediaId: null,
    }, {
      writeContent: async (next, template) => {
        const payload = JSON.stringify(next).replace(/'/g, "''");
        psql(db, `update public.menus set name = 'Evening service', template = '${template}', content = '${payload}'::jsonb where id = '${menu}' and account_id = '${account}'`);
      },
      render: async () => { throw new Error("draft rendered"); },
      swap: async () => { throw new Error("draft swapped"); },
    });
    expect(psql(db, "select count(*) from public.playlists")).toBe("0");
    const reloaded = parseLayout(JSON.parse(psql(db, `select content::text from public.menus where id = '${menu}'`)));
    expect(reloaded.ok).toBe(true);
    if (!reloaded.ok) return;
    expect(reloaded.value.imageMediaId).toBe(photo);
    expect(reloaded.value.videoMediaId).toBe(video);
    expect(reloaded.value.font).toBe("noto-serif");

    const published = await applyLayoutSave({
      enabled: true, accountId: account, mode: "publish", document: reloaded.value, files, previousMediaId: null,
    }, {
      writeContent: async (next, template) => {
        const payload = JSON.stringify(next).replace(/'/g, "''");
        psql(db, `update public.menus set template = '${template}', content = '${payload}'::jsonb where id = '${menu}' and account_id = '${account}'`);
      },
      render: async (next) => {
        const stored = readFileSync(join(root, `${photo}.png`));
        const png = renderLayoutPng(next, { bytes: stored, mime: "image/png" });
        const id = "00000000-0000-4000-8000-0000000000ee";
        writeFileSync(join(root, `${id}.png`), png);
        psql(db, `insert into public.media values ('${id}', '${account}', 'board.png', '${account}/${id}.png', 'image/png', ${png.length}, 'image')`);
        expect(readFileSync(join(root, `${id}.png`)).subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
        return id;
      },
      swap: async (previous, next) => {
        const created = psql(db, `select public.menu_create_playlist('${account}', 'Evening service', '${next}')`);
        expect(created).toMatch(/^[0-9a-f-]{36}$/);
        psql(db, `update public.menus set media_id = '${next}', playlist_id = '${created}' where id = '${menu}' and account_id = '${account}'`);
        psql(db, `insert into public.displays values ('00000000-0000-4000-8000-000000000030', '${account}', 'Bar', null, '${created}', 4)`);
        const swapped = psql(db, `select public.menu_swap_media('${account}', '${next}', '${foreign}')`);
        expect(swapped).toBe("f");
        expect(psql(db, "select content_version from public.displays")).toBe("4");
      },
    });
    expect(published.ok).toBe(true);
    const live = parseLayout(JSON.parse(psql(db, `select content::text from public.menus where id = '${menu}'`)));
    expect(live.ok).toBe(true);
    if (!live.ok) return;
    const mediaId = psql(db, `select media_id::text from public.playlist_items where kind = 'published'`);
    const composition = playerComposition(live.value, `file://${root}/${mediaId}.png`, `file://${root}/${video}.mp4`);
    expect(composition?.video?.mediaId).toBe(video);
    expect(composition?.video?.url).toContain(`${video}.mp4`);
    expect(composition?.video?.url).not.toContain("/layout-studio/media/promo");
    expect(composition?.video && composition.video.box.x).toBeGreaterThan(0);
    expect(composition?.video && composition.video.box.x + composition.video.box.w).toBe(1920);
  });
});
