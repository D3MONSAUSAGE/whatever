-- Pantalla phase 2A: playlists and slideshows.
-- Additive and not idempotent. Apply once, after 0001_init.sql.
-- Does not drop, rename, or alter existing columns, tokens, or pairing.

-- ---------------------------------------------------------------- tables

create table public.playlists (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  default_duration_ms integer not null default 10000
    check (default_duration_ms between 1000 and 600000),
  transition text not null default 'none'
    check (transition in ('none', 'fade')),
  published_at timestamptz,
  published_transition text
    check (published_transition is null or published_transition in ('none', 'fade')),
  revision integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index playlists_account_id_idx on public.playlists(account_id);

-- kind = draft is the editor copy. kind = published is what TVs play.
-- CASCADE so removing an account (and its media) is not blocked by slides.
-- delete_media refuses while any row still references the image.
create table public.playlist_items (
  id uuid primary key default gen_random_uuid(),
  playlist_id uuid not null references public.playlists(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  media_id uuid not null references public.media(id) on delete cascade,
  kind text not null check (kind in ('draft', 'published')),
  position integer not null check (position >= 0 and position < 40),
  duration_ms integer
    check (duration_ms is null or duration_ms between 1000 and 600000),
  created_at timestamptz not null default now(),
  unique (playlist_id, kind, position)
);
create index playlist_items_playlist_kind_idx
  on public.playlist_items(playlist_id, kind, position);
create index playlist_items_account_media_idx
  on public.playlist_items(account_id, media_id);

alter table public.displays
  add column assigned_playlist_id uuid references public.playlists(id) on delete set null;
create index displays_assigned_playlist_id_idx on public.displays(assigned_playlist_id);

-- ---------------------------------------------------------------- RLS

alter table public.playlists enable row level security;
alter table public.playlist_items enable row level security;

create policy playlists_owner_read on public.playlists
  for select to authenticated using (
    account_id in (
      select id from public.accounts where owner_user_id = (select auth.uid())
    )
  );

create policy playlist_items_owner_read on public.playlist_items
  for select to authenticated using (
    account_id in (
      select id from public.accounts where owner_user_id = (select auth.uid())
    )
  );

revoke all on public.playlists from public, anon, authenticated;
revoke all on public.playlist_items from public, anon, authenticated;
grant select on public.playlists to authenticated;
grant select on public.playlist_items to authenticated;
grant select (assigned_playlist_id) on public.displays to authenticated;

-- ---------------------------------------------------------------- functions

-- Same signature as 0001. Also clears a playlist so one image stays one image.
create or replace function public.assign_media(p_account_id uuid, p_display_id uuid, p_media_id uuid)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  if p_media_id is not null and not exists (
    select 1 from public.media where id = p_media_id and account_id = p_account_id
  ) then
    return false;
  end if;

  update public.displays
    set assigned_media_id = p_media_id,
        assigned_playlist_id = null,
        content_version = content_version + 1
    where id = p_display_id and account_id = p_account_id and status = 'active';
  return found;
end $$;

-- Same signature as 0001. Refuses when a playlist still lists the image.
create or replace function public.delete_media(p_account_id uuid, p_media_id uuid)
returns text
language plpgsql
set search_path = ''
as $$
declare v_path text;
begin
  if exists (
    select 1 from public.playlist_items
    where media_id = p_media_id and account_id = p_account_id
  ) then
    raise exception 'media_in_playlist' using errcode = 'P0001';
  end if;

  update public.displays
    set assigned_media_id = null, content_version = content_version + 1
    where assigned_media_id = p_media_id and account_id = p_account_id;

  delete from public.media where id = p_media_id and account_id = p_account_id
    returning storage_path into v_path;
  return v_path;
end $$;

-- Replace the draft. Does not change the published snapshot or any TV.
create or replace function public.save_playlist(
  p_account_id uuid,
  p_playlist_id uuid,
  p_name text,
  p_default_duration_ms integer,
  p_transition text,
  p_items jsonb
) returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_item jsonb;
  v_media uuid;
  v_duration integer;
  v_index integer := 0;
  v_name text := trim(p_name);
begin
  if v_name is null or char_length(v_name) < 1 or char_length(v_name) > 80 then
    return false;
  end if;
  if p_default_duration_ms is null
     or p_default_duration_ms < 1000 or p_default_duration_ms > 600000 then
    return false;
  end if;
  if p_transition is null or p_transition not in ('none', 'fade') then
    return false;
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 40 then
    return false;
  end if;
  if not exists (
    select 1 from public.playlists where id = p_playlist_id and account_id = p_account_id
  ) then
    return false;
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    begin
      v_media := (v_item->>'mediaId')::uuid;
    exception when others then
      return false;
    end;
    if not exists (
      select 1 from public.media where id = v_media and account_id = p_account_id
    ) then
      return false;
    end if;
    if v_item ? 'durationMs' and jsonb_typeof(v_item->'durationMs') <> 'null' then
      if (v_item->>'durationMs') !~ '^[0-9]+$' then
        return false;
      end if;
      v_duration := (v_item->>'durationMs')::integer;
      if v_duration < 1000 or v_duration > 600000 then
        return false;
      end if;
    end if;
  end loop;

  update public.playlists
    set name = v_name,
        default_duration_ms = p_default_duration_ms,
        transition = p_transition,
        updated_at = now()
    where id = p_playlist_id and account_id = p_account_id;

  delete from public.playlist_items
    where playlist_id = p_playlist_id and kind = 'draft';

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_media := (v_item->>'mediaId')::uuid;
    v_duration := null;
    if v_item ? 'durationMs' and jsonb_typeof(v_item->'durationMs') = 'number' then
      v_duration := (v_item->>'durationMs')::integer;
    end if;
    insert into public.playlist_items (
      playlist_id, account_id, media_id, kind, position, duration_ms
    ) values (
      p_playlist_id, p_account_id, v_media, 'draft', v_index, v_duration
    );
    v_index := v_index + 1;
  end loop;

  return true;
end $$;

-- Copy the draft into the published snapshot and assign those TVs.
create or replace function public.publish_playlist(
  p_account_id uuid,
  p_playlist_id uuid,
  p_display_ids uuid[]
) returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_default integer;
  v_transition text;
begin
  if p_display_ids is null
     or cardinality(p_display_ids) < 1
     or cardinality(p_display_ids) > 50 then
    return false;
  end if;

  select default_duration_ms, transition into v_default, v_transition
    from public.playlists
    where id = p_playlist_id and account_id = p_account_id
    for update;
  if not found then
    return false;
  end if;

  if exists (
    select 1 from unnest(p_display_ids) as chosen(id)
    where not exists (
      select 1 from public.displays
      where id = chosen.id and account_id = p_account_id and status = 'active'
    )
  ) then
    return false;
  end if;

  if not exists (
    select 1 from public.playlist_items
    where playlist_id = p_playlist_id and kind = 'draft'
  ) then
    return false;
  end if;

  delete from public.playlist_items
    where playlist_id = p_playlist_id and kind = 'published';

  insert into public.playlist_items (
    playlist_id, account_id, media_id, kind, position, duration_ms
  )
  select playlist_id, account_id, media_id, 'published', position,
         coalesce(duration_ms, v_default)
  from public.playlist_items
  where playlist_id = p_playlist_id and kind = 'draft'
  order by position;

  update public.playlists
    set published_at = now(),
        published_transition = v_transition,
        revision = revision + 1,
        updated_at = now()
    where id = p_playlist_id and account_id = p_account_id;

  update public.displays
    set assigned_playlist_id = p_playlist_id,
        assigned_media_id = null,
        content_version = content_version + 1
    where account_id = p_account_id
      and status = 'active'
      and id = any (p_display_ids);

  update public.displays
    set assigned_playlist_id = null,
        content_version = content_version + 1
    where account_id = p_account_id
      and assigned_playlist_id = p_playlist_id
      and not (id = any (p_display_ids));

  return true;
end $$;

-- Bump TVs off the playlist, then delete it.
create or replace function public.delete_playlist(p_account_id uuid, p_playlist_id uuid)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.playlists where id = p_playlist_id and account_id = p_account_id
  ) then
    return false;
  end if;

  update public.displays
    set assigned_playlist_id = null,
        content_version = content_version + 1
    where account_id = p_account_id and assigned_playlist_id = p_playlist_id;

  delete from public.playlists where id = p_playlist_id and account_id = p_account_id;
  return true;
end $$;

-- Published slides for a display token. Empty when a single image is assigned.
create or replace function public.player_playlist(p_token_hash text)
returns table (
  playlist_id uuid,
  transition text,
  "position" integer,
  media_id uuid,
  storage_path text,
  duration_ms integer
)
language sql
set search_path = ''
as $$
  select pl.id, pl.published_transition, pi.position, pi.media_id, m.storage_path, pi.duration_ms
  from public.displays d
  join public.playlists pl on pl.id = d.assigned_playlist_id
  join public.playlist_items pi on pi.playlist_id = pl.id and pi.kind = 'published'
  join public.media m on m.id = pi.media_id and m.account_id = d.account_id
  where d.token_hash = p_token_hash
    and d.status = 'active'
    and d.assigned_media_id is null
  order by pi.position;
$$;

revoke execute on function public.save_playlist(uuid, uuid, text, integer, text, jsonb) from public, anon, authenticated;
revoke execute on function public.publish_playlist(uuid, uuid, uuid[]) from public, anon, authenticated;
revoke execute on function public.delete_playlist(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.player_playlist(text) from public, anon, authenticated;

grant execute on function public.save_playlist(uuid, uuid, text, integer, text, jsonb) to service_role;
grant execute on function public.publish_playlist(uuid, uuid, uuid[]) to service_role;
grant execute on function public.delete_playlist(uuid, uuid) to service_role;
grant execute on function public.player_playlist(text) to service_role;
