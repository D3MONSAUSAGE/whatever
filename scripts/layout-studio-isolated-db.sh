#!/bin/sh
# Disposable local proof that a draft does not move screens and publish uses menu_swap_media.
# Creates and drops only the database named layout_studio_scratch on the local socket.
set -eu
if ! sudo -n -u postgres psql -d postgres -tAc "select inet_server_addr() is null" | grep -q t; then
  echo "Refusing: Postgres is not the local socket." >&2
  exit 1
fi
sudo -n -u postgres psql -d postgres -v ON_ERROR_STOP=1 -c "drop database if exists layout_studio_scratch;"
sudo -n -u postgres psql -d postgres -v ON_ERROR_STOP=1 -c "create database layout_studio_scratch;"
sudo -n -u postgres psql -d layout_studio_scratch -v ON_ERROR_STOP=1 <<'SQL'
create schema auth;
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
  storage_path text not null,
  mime_type text not null,
  size_bytes integer not null
);
create table public.playlists (
  id uuid primary key,
  account_id uuid not null references public.accounts(id),
  name text not null,
  revision integer not null default 0,
  updated_at timestamptz not null default now()
);
create table public.playlist_items (
  id uuid primary key,
  playlist_id uuid not null references public.playlists(id),
  account_id uuid not null references public.accounts(id),
  media_id uuid not null references public.media(id),
  kind text not null
);
create table public.displays (
  id uuid primary key,
  account_id uuid not null references public.accounts(id),
  content_version integer not null default 0,
  assigned_media_id uuid references public.media(id),
  assigned_playlist_id uuid references public.playlists(id)
);
create table public.menus (
  id uuid primary key,
  account_id uuid not null references public.accounts(id),
  name text not null,
  template text not null check (template in ('classic', 'fresh', 'bold')),
  content jsonb not null,
  media_id uuid references public.media(id),
  playlist_id uuid references public.playlists(id)
);
SQL
# The function body is the existing menu_swap_media, limited to the columns this proof needs.
sudo -n -u postgres psql -d layout_studio_scratch -v ON_ERROR_STOP=1 <<'SQL'
create function public.menu_swap_media(p_account_id uuid, p_old_media_id uuid, p_new_media_id uuid) returns boolean
language plpgsql as $$
begin
  if not exists (select 1 from public.media where id = p_new_media_id and account_id = p_account_id) then
    return false;
  end if;
  if p_old_media_id is null then
    return true;
  end if;
  with touched as (
    update public.playlist_items
      set media_id = p_new_media_id
      where account_id = p_account_id and media_id = p_old_media_id
      returning playlist_id
  ), bumped as (
    update public.playlists p
      set revision = p.revision + 1, updated_at = now()
      where p.account_id = p_account_id and p.id in (select playlist_id from touched)
      returning p.id
  )
  update public.displays d
    set content_version = d.content_version + 1
    where d.account_id = p_account_id and d.assigned_playlist_id in (select id from bumped);
  update public.displays
    set assigned_media_id = p_new_media_id, content_version = content_version + 1
    where account_id = p_account_id and assigned_media_id = p_old_media_id;
  return true;
end $$;

insert into auth.users values ('00000000-0000-4000-8000-0000000000a1'), ('00000000-0000-4000-8000-0000000000b1');
insert into public.accounts values
  ('00000000-0000-4000-8000-0000000000aa', 'A', '00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-0000000000bb', 'B', '00000000-0000-4000-8000-0000000000b1');
insert into public.media values
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000aa', 'old.png', '00000000-0000-4000-8000-0000000000aa/old.png', 'image/png', 10),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000aa', 'new.png', '00000000-0000-4000-8000-0000000000aa/new.png', 'image/png', 10),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-0000000000bb', 'theirs.png', '00000000-0000-4000-8000-0000000000bb/theirs.png', 'image/png', 10);
insert into public.playlists values ('00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-0000000000aa', 'Menu', 1, now());
insert into public.playlist_items values
  ('00000000-0000-4000-8000-000000000020', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000001', 'published');
insert into public.displays values
  ('00000000-0000-4000-8000-000000000030', '00000000-0000-4000-8000-0000000000aa', 4, null, '00000000-0000-4000-8000-000000000010');
insert into public.menus values
  ('00000000-0000-4000-8000-000000000040', '00000000-0000-4000-8000-0000000000aa', 'Casa Mesa', 'fresh', '{"title":"Casa Mesa"}', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000010');

update public.menus set content = '{"title":"Draft title","sections":[{"name":"Plates","items":[{"name":"Pollo","price":"$15.50","description":"Kept"}]}]}'
  where account_id = '00000000-0000-4000-8000-0000000000aa';
do $$ begin
  if (select content_version from public.displays) <> 4 then
    raise exception 'draft moved the screen';
  end if;
  if (select media_id from public.playlist_items) <> '00000000-0000-4000-8000-000000000001' then
    raise exception 'draft swapped the image';
  end if;
end $$;

select public.menu_swap_media(
  '00000000-0000-4000-8000-0000000000aa',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000003'
);
do $$ begin
  if (select content_version from public.displays) <> 4 then
    raise exception 'another account media was swapped';
  end if;
end $$;

select public.menu_swap_media(
  '00000000-0000-4000-8000-0000000000aa',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002'
);
do $$ begin
  if (select content_version from public.displays) <> 5 then
    raise exception 'publish did not bump the screen';
  end if;
  if (select media_id from public.playlist_items) <> '00000000-0000-4000-8000-000000000002' then
    raise exception 'publish did not swap the image';
  end if;
  if (select content->>'title' from public.menus) <> 'Draft title' then
    raise exception 'menu items were not kept';
  end if;
end $$;
SQL
sudo -n -u postgres psql -d postgres -v ON_ERROR_STOP=1 -c "drop database if exists layout_studio_scratch;"
echo "layout studio isolated database proof passed and the scratch database was dropped"
