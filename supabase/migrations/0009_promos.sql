-- M12: branded promo slides. Additive only: one new table and three functions.
-- A promo renders to a normal PNG in public.media with its own one-slide
-- playlist (menu_create_playlist). "Add to menu" either appends the slide to
-- the menu's playlist, or (when the promo has dates) builds a "menu + promo"
-- playlist and ordinary date-limited rows in public.schedules. The player is
-- unchanged.

create table if not exists public.promos (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  template text not null check (template in ('happy', 'deal', 'special')),
  content jsonb not null default '{}'::jsonb,
  media_id uuid references public.media(id) on delete set null,
  playlist_id uuid references public.playlists(id) on delete set null,
  starts_on date,
  ends_on date,
  menu_id uuid references public.menus(id) on delete set null,
  placement text not null default 'none' check (placement in ('none', 'added', 'scheduled')),
  combo_playlist_id uuid references public.playlists(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint promos_dates check (starts_on is null or ends_on is null or ends_on >= starts_on)
);
create index if not exists promos_account_id_idx on public.promos(account_id);

alter table public.promos enable row level security;
revoke all on public.promos from anon, authenticated;

-- Bump a playlist's revision and the screens that play it directly.
create or replace function public.promo_bump_playlist(p_account_id uuid, p_playlist_id uuid)
returns void
language sql
set search_path = ''
as $$
  with b as (
    update public.playlists set revision = revision + 1, updated_at = now()
      where id = p_playlist_id and account_id = p_account_id
      returning id
  )
  update public.displays set content_version = content_version + 1
    where account_id = p_account_id and assigned_playlist_id in (select id from b);
$$;

-- Append a slide (draft + published) to an existing published playlist. Idempotent.
create or replace function public.promo_add_to_playlist(
  p_account_id uuid, p_playlist_id uuid, p_media_id uuid, p_duration_ms integer
) returns boolean
language plpgsql
set search_path = ''
as $$
declare v_draft int; v_pub int;
begin
  if not exists (select 1 from public.media where id = p_media_id and account_id = p_account_id)
     or not exists (select 1 from public.playlists where id = p_playlist_id and account_id = p_account_id) then
    return false;
  end if;
  if exists (select 1 from public.playlist_items where playlist_id = p_playlist_id and media_id = p_media_id and kind = 'published') then
    return true;
  end if;
  select coalesce(max(position) + 1, 0) into v_draft from public.playlist_items where playlist_id = p_playlist_id and kind = 'draft';
  select coalesce(max(position) + 1, 0) into v_pub from public.playlist_items where playlist_id = p_playlist_id and kind = 'published';
  insert into public.playlist_items (playlist_id, account_id, media_id, kind, position, duration_ms)
    values (p_playlist_id, p_account_id, p_media_id, 'draft', v_draft, p_duration_ms),
           (p_playlist_id, p_account_id, p_media_id, 'published', v_pub, p_duration_ms);
  perform public.promo_bump_playlist(p_account_id, p_playlist_id);
  return true;
end $$;

-- Remove a slide from a playlist, never leaving it with no published slides.
create or replace function public.promo_remove_from_playlist(
  p_account_id uuid, p_playlist_id uuid, p_media_id uuid
) returns boolean
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.playlist_items
      where playlist_id = p_playlist_id and account_id = p_account_id and kind = 'published' and media_id <> p_media_id
  ) then
    return false;
  end if;
  delete from public.playlist_items
    where playlist_id = p_playlist_id and account_id = p_account_id and media_id = p_media_id;
  perform public.promo_bump_playlist(p_account_id, p_playlist_id);
  return true;
end $$;

-- New published playlist: the base playlist's published slides, then the promo.
create or replace function public.promo_create_combo(
  p_account_id uuid, p_name text, p_base_playlist_id uuid, p_media_id uuid, p_duration_ms integer
) returns uuid
language plpgsql
set search_path = ''
as $$
declare v_id uuid; v_n int;
begin
  if not exists (select 1 from public.media where id = p_media_id and account_id = p_account_id)
     or not exists (select 1 from public.playlists where id = p_base_playlist_id and account_id = p_account_id) then
    return null;
  end if;
  insert into public.playlists (account_id, name, default_duration_ms, transition, published_at, published_transition, revision)
    select p_account_id, left(trim(p_name), 80), default_duration_ms, coalesce(published_transition, 'none'), now(), coalesce(published_transition, 'none'), 1
      from public.playlists where id = p_base_playlist_id
    returning id into v_id;
  insert into public.playlist_items (playlist_id, account_id, media_id, kind, position, duration_ms)
    select v_id, p_account_id, media_id, k.kind, row_number() over (partition by k.kind order by position) - 1, duration_ms
      from public.playlist_items i
      cross join (values ('draft'), ('published')) as k(kind)
      where i.playlist_id = p_base_playlist_id and i.kind = 'published';
  select count(*) into v_n from public.playlist_items where playlist_id = v_id and kind = 'published';
  insert into public.playlist_items (playlist_id, account_id, media_id, kind, position, duration_ms)
    values (v_id, p_account_id, p_media_id, 'draft', v_n, p_duration_ms),
           (v_id, p_account_id, p_media_id, 'published', v_n, p_duration_ms);
  return v_id;
end $$;

revoke all on function public.promo_bump_playlist(uuid, uuid) from public, anon, authenticated;
revoke all on function public.promo_add_to_playlist(uuid, uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.promo_remove_from_playlist(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.promo_create_combo(uuid, text, uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.promo_bump_playlist(uuid, uuid) to service_role;
grant execute on function public.promo_add_to_playlist(uuid, uuid, uuid, integer) to service_role;
grant execute on function public.promo_remove_from_playlist(uuid, uuid, uuid) to service_role;
grant execute on function public.promo_create_combo(uuid, text, uuid, uuid, integer) to service_role;
