-- Rollback for 0016_manual_slideshow.sql. Run by hand only if needed.
-- Restores Automatic-only playback. Does not delete playlists or items.
-- Does not touch accounts, displays, media, pairing, billing, or tokens.

drop function if exists public.save_playlist(uuid, uuid, text, integer, text, jsonb, text);
drop function if exists public.player_playlist(text);

-- Restore pre-0016 save_playlist (no playback_mode argument).
create function public.save_playlist(
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

-- Restore player_playlist without playback_mode (0003 shape).
create function public.player_playlist(p_token_hash text)
returns table (
  playlist_id uuid,
  transition text,
  "position" integer,
  media_id uuid,
  storage_path text,
  duration_ms integer,
  kind text,
  width integer,
  height integer,
  media_duration_ms integer
)
language sql
set search_path = ''
as $$
  select pl.id,
         pl.published_transition,
         pi.position,
         pi.media_id,
         m.storage_path,
         pi.duration_ms,
         coalesce(m.kind, 'image'),
         m.width,
         m.height,
         m.duration_ms
  from public.displays d
  join public.playlists pl on pl.id = d.assigned_playlist_id
  join public.playlist_items pi on pi.playlist_id = pl.id and pi.kind = 'published'
  join public.media m on m.id = pi.media_id and m.account_id = d.account_id
  where d.token_hash = p_token_hash
    and d.status = 'active'
    and d.assigned_media_id is null
  order by pi.position;
$$;

-- publish / snapshot keep working; stop writing published_playback_mode.
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

create or replace function public.snapshot_playlist(p_account_id uuid, p_playlist_id uuid)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_default integer;
  v_transition text;
begin
  select default_duration_ms, transition into v_default, v_transition
    from public.playlists
    where id = p_playlist_id and account_id = p_account_id
    for update;
  if not found then
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
    set content_version = content_version + 1
    where account_id = p_account_id
      and status = 'active'
      and assigned_playlist_id = p_playlist_id;

  return true;
end $$;

alter table public.playlists drop constraint if exists playlists_playback_mode_check;
alter table public.playlists drop constraint if exists playlists_published_playback_mode_check;
alter table public.playlists drop column if exists published_playback_mode;
alter table public.playlists drop column if exists playback_mode;

revoke execute on function public.save_playlist(uuid, uuid, text, integer, text, jsonb) from public, anon, authenticated;
revoke execute on function public.player_playlist(text) from public, anon, authenticated;
grant execute on function public.save_playlist(uuid, uuid, text, integer, text, jsonb) to service_role;
grant execute on function public.player_playlist(text) to service_role;
grant execute on function public.publish_playlist(uuid, uuid, uuid[]) to service_role;
grant execute on function public.snapshot_playlist(uuid, uuid) to service_role;
