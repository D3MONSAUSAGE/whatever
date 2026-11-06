-- Rollback for 0019_presentation_groups.sql. Run by hand. Not a migration.
-- Drops group columns and the two new functions. Restores save_playlist and
-- presentation_create_playlist to their 0016 / 0018 bodies.
-- Does not delete media rows, storage objects, playlist items, or displays.
-- Presentation rows stay (kind = presentation). Slide links from 0018 stay.
-- A playlist item duration above 600 seconds is clamped to 600 seconds so the
-- previous check can be restored. Image and video rows are already within that cap.

drop function if exists public.delete_presentation_group(uuid, uuid);
drop function if exists public.presentation_commit_group(uuid, uuid, integer, integer, integer, integer, integer, text, text, text);

update public.playlist_items
set duration_ms = 600000
where duration_ms is not null and duration_ms > 600000;

alter table public.playlist_items drop constraint if exists playlist_items_duration_ms_check;
alter table public.playlist_items
  add constraint playlist_items_duration_ms_check
  check (duration_ms is null or duration_ms between 1000 and 600000);

alter table public.media drop constraint if exists media_processing_status_check;
alter table public.media drop constraint if exists media_processing_error_check;
alter table public.media drop constraint if exists media_processing_done_check;
alter table public.media drop constraint if exists media_slide_count_check;
alter table public.media drop constraint if exists media_group_duration_ms_check;
alter table public.media drop constraint if exists media_slide_duration_ms_check;
alter table public.media drop constraint if exists media_group_revision_check;
alter table public.media drop constraint if exists media_slide_revision_check;

alter table public.media drop column if exists processing_status;
alter table public.media drop column if exists processing_error;
alter table public.media drop column if exists processing_done;
alter table public.media drop column if exists slide_count;
alter table public.media drop column if exists group_duration_ms;
alter table public.media drop column if exists slide_duration_ms;
alter table public.media drop column if exists group_revision;
alter table public.media drop column if exists slide_revision;
alter table public.media drop column if exists updated_at;

update storage.buckets
set allowed_mime_types = array[
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation'
]
where id = 'media';

create or replace function public.save_playlist(
  p_account_id uuid,
  p_playlist_id uuid,
  p_name text,
  p_default_duration_ms integer,
  p_transition text,
  p_items jsonb,
  p_playback_mode text default null
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
  v_mode text;
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
  if p_playback_mode is not null and p_playback_mode not in ('auto', 'manual') then
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

  select coalesce(p_playback_mode, playback_mode) into v_mode
    from public.playlists
    where id = p_playlist_id and account_id = p_account_id;

  update public.playlists
    set name = v_name,
        default_duration_ms = p_default_duration_ms,
        transition = p_transition,
        playback_mode = v_mode,
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

create or replace function public.presentation_create_playlist(
  p_account_id uuid,
  p_source_media_id uuid,
  p_name text,
  p_playback_mode text default 'manual'
) returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
  v_name text := left(trim(p_name), 80);
  v_mode text := coalesce(nullif(trim(p_playback_mode), ''), 'manual');
  v_n integer;
begin
  if v_name is null or char_length(v_name) < 1 then
    return null;
  end if;
  if v_mode not in ('auto', 'manual') then
    return null;
  end if;
  if not exists (
    select 1 from public.media
    where id = p_source_media_id
      and account_id = p_account_id
      and kind = 'presentation'
  ) then
    return null;
  end if;

  select count(*) into v_n
  from public.media
  where account_id = p_account_id
    and source_media_id = p_source_media_id
    and (kind is null or kind = 'image');
  if v_n is null or v_n < 1 or v_n > 40 then
    return null;
  end if;

  insert into public.playlists (
    account_id, name, default_duration_ms, transition, playback_mode,
    published_at, published_transition, published_playback_mode, revision
  ) values (
    p_account_id, v_name, 10000, 'none', v_mode,
    now(), 'none', v_mode, 1
  ) returning id into v_id;

  insert into public.playlist_items (
    playlist_id, account_id, media_id, kind, position, duration_ms
  )
  select v_id, p_account_id, m.id, k.kind, m.slide_index,
         case when k.kind = 'published' then 10000 else null end
  from public.media m
  cross join (values ('draft'), ('published')) as k(kind)
  where m.account_id = p_account_id
    and m.source_media_id = p_source_media_id
    and (m.kind is null or m.kind = 'image')
    and m.slide_index is not null
  order by m.slide_index, k.kind;

  return v_id;
end $$;
