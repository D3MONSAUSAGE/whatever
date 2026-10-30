-- M10: menu boards. Additive only: one new table and two functions.
-- A menu keeps the editable items; each save renders a normal PNG into
-- public.media and points the menu's own playlist at it, so the existing
-- player, cache, playlists and schedules play it unchanged.

create table if not exists public.menus (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  template text not null check (template in ('classic', 'fresh', 'bold')),
  content jsonb not null default '{}'::jsonb,
  media_id uuid references public.media(id) on delete set null,
  playlist_id uuid references public.playlists(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists menus_account_id_idx on public.menus(account_id);

-- Server-only, like alerts: RLS on and no policies.
alter table public.menus enable row level security;
revoke all on public.menus from anon, authenticated;

-- Create the menu's playlist (draft + published, one slide) for a new image.
create or replace function public.menu_create_playlist(
  p_account_id uuid,
  p_name text,
  p_media_id uuid
) returns uuid
language plpgsql
set search_path = ''
as $$
declare v_id uuid;
begin
  if not exists (select 1 from public.media where id = p_media_id and account_id = p_account_id) then
    return null;
  end if;
  insert into public.playlists (account_id, name, default_duration_ms, transition,
                                published_at, published_transition, revision)
    values (p_account_id, left(trim(p_name), 80), 30000, 'none', now(), 'none', 1)
    returning id into v_id;
  insert into public.playlist_items (playlist_id, account_id, media_id, kind, position, duration_ms)
    values (v_id, p_account_id, p_media_id, 'draft', 0, null),
           (v_id, p_account_id, p_media_id, 'published', 0, 30000);
  return v_id;
end $$;

-- Swap the old menu image for the new one everywhere it is used, so TVs
-- showing the menu (directly, through its playlist, or by schedule) reload.
create or replace function public.menu_swap_media(
  p_account_id uuid,
  p_old_media_id uuid,
  p_new_media_id uuid
) returns boolean
language plpgsql
set search_path = ''
as $$
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
      returning playlist_id, kind
  ), bumped as (
    update public.playlists p
      set revision = p.revision + 1, updated_at = now()
      where p.account_id = p_account_id
        and p.id in (select playlist_id from touched where kind = 'published')
      returning p.id
  )
  update public.displays d
    set content_version = d.content_version + 1
    where d.account_id = p_account_id
      and d.assigned_playlist_id in (select id from bumped);

  update public.displays
    set assigned_media_id = p_new_media_id, content_version = content_version + 1
    where account_id = p_account_id and assigned_media_id = p_old_media_id;
  return true;
end $$;

revoke all on function public.menu_create_playlist(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.menu_swap_media(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.menu_create_playlist(uuid, text, uuid) to service_role;
grant execute on function public.menu_swap_media(uuid, uuid, uuid) to service_role;
