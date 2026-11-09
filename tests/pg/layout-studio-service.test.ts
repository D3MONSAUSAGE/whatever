import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyLayoutSave } from "@/lib/layout-publish";
import { parseLayout, playerComposition, sampleLayout } from "@/lib/layout-studio";
import { renderLayoutPng } from "@/lib/server/layout-render";

const db = "layout_studio_service";
const account = "00000000-0000-4000-8000-0000000000aa";
const other = "00000000-0000-4000-8000-0000000000bb";
const oldMedia = "00000000-0000-4000-8000-000000000001";
const video = "00000000-0000-4000-8000-000000000004";
const foreign = "00000000-0000-4000-8000-000000000003";
const menu = "00000000-0000-4000-8000-000000000040";
const legacy = "00000000-0000-4000-8000-000000000041";
let scratch = false;

function psql(database: string, sql: string) {
  return execFileSync("sudo", ["-n", "-u", "postgres", "psql", "-d", database, "-v", "ON_ERROR_STOP=1", "-tAc", sql], { encoding: "utf8" }).trim();
}

function canUseLocalPostgres() {
  try {
    return psql("postgres", "select inet_server_addr() is null") === "t";
  } catch {
    return false;
  }
}

describe("layout service on a disposable database", () => {
  beforeAll(() => {
    scratch = canUseLocalPostgres();
    if (!scratch) return;
    psql("postgres", `drop database if exists ${db}`);
    psql("postgres", `create database ${db}`);
    psql(db, `
      create schema auth;
      create table auth.users (id uuid primary key);
      create table public.accounts (id uuid primary key, name text not null, owner_user_id uuid not null references auth.users(id));
      create table public.media (id uuid primary key, account_id uuid not null references public.accounts(id), file_name text not null, storage_path text not null, mime_type text not null, size_bytes integer not null, kind text);
      create table public.playlists (id uuid primary key, account_id uuid not null, name text not null, revision integer not null default 0, updated_at timestamptz not null default now());
      create table public.playlist_items (id uuid primary key, playlist_id uuid not null, account_id uuid not null, media_id uuid not null, kind text not null);
      create table public.displays (id uuid primary key, account_id uuid not null, content_version integer not null default 0, assigned_media_id uuid, assigned_playlist_id uuid);
      create table public.menus (id uuid primary key, account_id uuid not null, name text not null, template text not null, content jsonb not null, media_id uuid, playlist_id uuid);
    `);
    psql(db, `
      create function public.menu_swap_media(p_account_id uuid, p_old_media_id uuid, p_new_media_id uuid) returns boolean language plpgsql as $$
      begin
        if not exists (select 1 from public.media where id = p_new_media_id and account_id = p_account_id) then return false; end if;
        if p_old_media_id is null then return true; end if;
        with touched as (
          update public.playlist_items set media_id = p_new_media_id
            where account_id = p_account_id and media_id = p_old_media_id returning playlist_id
        ), bumped as (
          update public.playlists p set revision = p.revision + 1, updated_at = now()
            where p.account_id = p_account_id and p.id in (select playlist_id from touched) returning p.id
        )
        update public.displays d set content_version = d.content_version + 1
          where d.account_id = p_account_id and d.assigned_playlist_id in (select id from bumped);
        update public.displays set assigned_media_id = p_new_media_id, content_version = content_version + 1
          where account_id = p_account_id and assigned_media_id = p_old_media_id;
        return true;
      end $$;
    `);
    psql(db, `
      insert into auth.users values ('00000000-0000-4000-8000-0000000000a1'), ('00000000-0000-4000-8000-0000000000b1');
      insert into public.accounts values ('${account}', 'A', '00000000-0000-4000-8000-0000000000a1'), ('${other}', 'B', '00000000-0000-4000-8000-0000000000b1');
      insert into public.media values
        ('${oldMedia}', '${account}', 'old.png', '${account}/old.png', 'image/png', 10, 'image'),
        ('${video}', '${account}', 'promo.mp4', '${account}/promo.mp4', 'video/mp4', 10, 'video'),
        ('${foreign}', '${other}', 'theirs.png', '${other}/theirs.png', 'image/png', 10, 'image');
      insert into public.playlists values
        ('00000000-0000-4000-8000-000000000010', '${account}', 'Menu', 1, now()),
        ('00000000-0000-4000-8000-000000000011', '${account}', 'Lunch schedule', 1, now());
      insert into public.playlist_items values
        ('00000000-0000-4000-8000-000000000020', '00000000-0000-4000-8000-000000000010', '${account}', '${oldMedia}', 'published'),
        ('00000000-0000-4000-8000-000000000021', '00000000-0000-4000-8000-000000000011', '${account}', '${oldMedia}', 'published');
      insert into public.displays values
        ('00000000-0000-4000-8000-000000000030', '${account}', 4, null, '00000000-0000-4000-8000-000000000010'),
        ('00000000-0000-4000-8000-000000000031', '${account}', 4, null, '00000000-0000-4000-8000-000000000011');
      insert into public.menus values
        ('${menu}', '${account}', 'Casa Mesa', 'fresh', '{"title":"Casa Mesa"}', '${oldMedia}', '00000000-0000-4000-8000-000000000010'),
        ('${legacy}', '${account}', 'Classic lunch', 'classic', '{"title":"Classic lunch","sections":[{"name":"Soup","items":[{"name":"Tomato","price":"$6","description":"Cup"}]}]}', null, null);
    `);
  });

  afterAll(() => {
    if (scratch) psql("postgres", `drop database if exists ${db}`);
  });

  it("drafts without moving screens, then publishes the png, the font, and the player box", async () => {
    if (!scratch) return;
    const stored: Buffer[] = [];
    const doc = {
      ...sampleLayout("menu-promo-67"),
      title: "Casa Mesa Cantina",
      font: "noto-serif" as const,
      primaryColor: "#0b3d2e",
      split: 0.61,
      imageMediaId: null,
      videoMediaId: video,
      sections: [{ name: "Plates", items: [{ name: "Pollo asado", price: "$15.50", description: "Kept on the board" }] }],
    };
    const files = [
      { id: video, accountId: account, mime: "video/mp4", kind: "video" as const },
      { id: foreign, accountId: other, mime: "image/png", kind: "image" as const },
    ];
    const stolen = await applyLayoutSave({
      enabled: true, accountId: account, mode: "publish", document: { ...doc, imageMediaId: foreign }, files, previousMediaId: oldMedia,
    }, {
      writeContent: async () => { throw new Error("wrote"); },
      render: async () => { throw new Error("rendered"); },
      swap: async () => { throw new Error("swapped"); },
    });
    expect(stolen.ok).toBe(false);
    expect(psql(db, "select content_version from public.displays where id = '00000000-0000-4000-8000-000000000030'")).toBe("4");

    await applyLayoutSave({
      enabled: true, accountId: account, mode: "draft", document: doc, files, previousMediaId: oldMedia,
    }, {
      writeContent: async (next, template) => {
        const payload = JSON.stringify(next).replace(/'/g, "''");
        psql(db, `update public.menus set template = '${template}', content = '${payload}'::jsonb where id = '${menu}' and account_id = '${account}'`);
      },
      render: async () => { throw new Error("draft rendered"); },
      swap: async () => { throw new Error("draft swapped"); },
    });
    expect(psql(db, "select content_version from public.displays where id = '00000000-0000-4000-8000-000000000030'")).toBe("4");
    expect(psql(db, "select media_id from public.playlist_items where id = '00000000-0000-4000-8000-000000000020'")).toBe(oldMedia);
    const reloaded = parseLayout(JSON.parse(psql(db, `select content::text from public.menus where id = '${menu}'`)));
    expect(reloaded.ok).toBe(true);
    if (reloaded.ok) {
      expect(reloaded.value.title).toBe("Casa Mesa Cantina");
      expect(reloaded.value.sections[0].items[0].price).toBe("$15.50");
      expect(reloaded.value.sections[0].items[0].description).toBe("Kept on the board");
      expect(reloaded.value.font).toBe("noto-serif");
      expect(reloaded.value.split).toBe(0.61);
      expect(reloaded.value.primaryColor).toBe("#0b3d2e");
    }

    const published = await applyLayoutSave({
      enabled: true, accountId: account, mode: "publish", document: doc, files, previousMediaId: oldMedia,
    }, {
      writeContent: async (next, template) => {
        const payload = JSON.stringify(next).replace(/'/g, "''");
        psql(db, `update public.menus set template = '${template}', content = '${payload}'::jsonb where id = '${menu}' and account_id = '${account}'`);
      },
      render: async (next) => {
        const png = renderLayoutPng(next);
        const inter = renderLayoutPng({ ...next, font: "inter" });
        expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
        expect(Buffer.compare(png, inter)).not.toBe(0);
        stored.push(png);
        const id = "00000000-0000-4000-8000-0000000000ee";
        psql(db, `insert into public.media values ('${id}', '${account}', 'board.png', '${account}/${id}.png', 'image/png', ${png.length}, 'image')`);
        return id;
      },
      swap: async (previous, next) => {
        const ok = psql(db, `select public.menu_swap_media('${account}', '${previous}', '${next}')`);
        expect(ok).toBe("t");
        psql(db, `update public.menus set media_id = '${next}' where id = '${menu}' and account_id = '${account}'`);
      },
    });
    expect(published.ok).toBe(true);
    if (published.ok) expect(published.swapped).toBe(true);
    expect(psql(db, "select content_version from public.displays where id = '00000000-0000-4000-8000-000000000030'")).toBe("5");
    expect(psql(db, "select content_version from public.displays where id = '00000000-0000-4000-8000-000000000031'")).toBe("5");
    expect(psql(db, "select media_id from public.playlist_items where playlist_id = '00000000-0000-4000-8000-000000000011'")).toBe("00000000-0000-4000-8000-0000000000ee");
    expect(psql(db, `select content->>'title' from public.menus where id = '${legacy}'`)).toBe("Classic lunch");
    const live = parseLayout(JSON.parse(psql(db, `select content::text from public.menus where id = '${menu}'`)));
    expect(live.ok).toBe(true);
    if (live.ok) {
      const composition = playerComposition(live.value, "https://signed-png", "https://signed-mp4");
      expect(composition?.video?.box.x).toBeGreaterThan(0);
      expect(composition?.video?.box.w).toBeLessThan(1920);
      expect(composition).not.toHaveProperty("groupIndex");
      expect(live.value.sections[0].items[0].name).toBe("Pollo asado");
    }
    expect(stored).toHaveLength(1);
  });
});
