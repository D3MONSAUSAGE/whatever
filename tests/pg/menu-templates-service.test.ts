import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyLayoutSave } from "@/lib/layout-publish";
import { layoutSvg, parseLayout, playerComposition } from "@/lib/layout-studio";
import { designById, designDocument, switchDesign } from "@/lib/menu-designs";
import { createHash } from "node:crypto";
import { renderLayoutPng } from "@/lib/server/layout-render";

const db = "menu_templates_service";
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

describe("premium template board on a disposable database: draft, publish, schedules, old boards", () => {
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

  it("drafts without touching screens, publishes to the screens and schedule already showing the board, keeps old boards", async () => {
    if (!scratch) return;
    const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
    // Owner picks Bold Fast Casual, edits content, applies brand colours and a video, then switches to Pizza Night.
    const base = designDocument(designById("bold-fast-casual")!);
    const edited = switchDesign({
      ...base,
      title: "Casa Mesa Burgers",
      primaryColor: "#0b3d2e",
      accentColor: "#ffd34d",
      videoMediaId: video,
      sections: [{ name: "Burgers", items: [{ name: "Casa smash", price: "$10.50", description: "Kept through the switch" }] }, ...base.sections.slice(1)],
    }, designById("pizza-night")!);
    const doc = { ...edited, variant: "night" };
    const files = [{ id: video, accountId: account, mime: "video/mp4", kind: "video" as const }];
    const write = async (next: unknown, template: string) => {
      const payload = JSON.stringify(next).replace(/'/g, "''");
      psql(db, `update public.menus set template = '${template}', content = '${payload}'::jsonb where id = '${menu}' and account_id = '${account}'`);
    };

    await applyLayoutSave({ enabled: true, accountId: account, mode: "draft", document: doc, files, previousMediaId: oldMedia }, {
      writeContent: write,
      render: async () => { throw new Error("draft rendered"); },
      swap: async () => { throw new Error("draft swapped"); },
    });
    // Save draft: no screen, playlist or schedule playlist changed.
    expect(psql(db, "select string_agg(content_version::text, ',' order by id) from public.displays")).toBe("4,4");
    expect(psql(db, "select count(*) from public.playlist_items where media_id = '" + oldMedia + "'")).toBe("2");
    const drafted = parseLayout(JSON.parse(psql(db, `select content::text from public.menus where id = '${menu}'`)));
    expect(drafted.ok).toBe(true);
    if (!drafted.ok) return;
    // Every template field survives storage.
    expect([drafted.value.design, drafted.value.variant, drafted.value.stockPhoto]).toEqual(["pizza-night", "night", "pizza"]); // the sample photo follows the template until the owner picks their own
    expect(drafted.value.title).toBe("Casa Mesa Burgers");
    expect(drafted.value.sections[0].items[0]).toEqual({ name: "Casa smash", price: "$10.50", description: "Kept through the switch" });
    expect([drafted.value.primaryColor, drafted.value.accentColor, drafted.value.videoMediaId]).toEqual(["#0b3d2e", "#ffd34d", video]);

    let rendered: Buffer | null = null;
    const published = await applyLayoutSave({ enabled: true, accountId: account, mode: "publish", document: doc, files, previousMediaId: oldMedia }, {
      writeContent: write,
      render: async (next) => {
        rendered = renderLayoutPng(next);
        // The published image is exactly the stored document drawn by the shared renderer.
        expect(sha(rendered)).toBe(sha(renderLayoutPng(drafted.value)));
        expect(layoutSvg(next)).toContain("CASA MESA BURGERS");
        const id = "00000000-0000-4000-8000-0000000000ef";
        psql(db, `insert into public.media values ('${id}', '${account}', 'board.png', '${account}/${id}.png', 'image/png', ${rendered.length}, 'image')`);
        return id;
      },
      swap: async (previous, next) => {
        expect(psql(db, `select public.menu_swap_media('${account}', '${previous}', '${next}')`)).toBe("t");
        psql(db, `update public.menus set media_id = '${next}' where id = '${menu}' and account_id = '${account}'`);
      },
    });
    expect(published.ok).toBe(true);
    expect(rendered).not.toBeNull();
    // Publish: both the board's playlist and the schedule's playlist now show the new image; their screens bumped once.
    expect(psql(db, "select string_agg(content_version::text, ',' order by id) from public.displays")).toBe("5,5");
    expect(psql(db, "select count(*) from public.playlist_items where media_id = '00000000-0000-4000-8000-0000000000ef'")).toBe("2");
    // The other account and the classic board are untouched.
    expect(psql(db, `select content->>'title' from public.menus where id = '${legacy}'`)).toBe("Classic lunch");
    expect(psql(db, `select count(*) from public.media where account_id = '${other}'`)).toBe("1");
    // The TV plays the video only in the photo area of the template.
    const live = parseLayout(JSON.parse(psql(db, `select content::text from public.menus where id = '${menu}'`)));
    expect(live.ok).toBe(true);
    if (live.ok) {
      const comp = playerComposition(live.value, "https://signed-png", "https://signed-mp4");
      expect(comp?.video?.box).toEqual({ x: 1260, y: 0, w: 660, h: 713 });
    }
  });
});
