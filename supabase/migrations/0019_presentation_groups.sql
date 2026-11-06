-- Presentation groups: one library row owns ordered slide images.
-- Additive. Does not rewrite existing playlist items, media rows, or player RPCs.
-- Historical slide images stay individual playlist entries. Only new uploads
-- (and an explicit replace) advance group_revision.
-- Does not touch billing, Stripe, Meta, accounts, pairing, or tokens.
-- Apply by hand. Rollback: supabase/rollback/0019_presentation_groups.sql.

-- ---------------------------------------------------------------- media columns
-- Existing rows: group_revision 0, slide_revision null, processing_status null.
-- The app treats that as "already ready" and does not regroup their playlists.

alter table public.media
  add column if not exists processing_status text,
  add column if not exists processing_error text,
  add column if not exists processing_done integer,
  add column if not exists slide_count integer,
  add column if not exists group_duration_ms integer,
  add column if not exists slide_duration_ms integer,
  add column if not exists group_revision integer not null default 0,
  add column if not exists slide_revision integer,
  add column if not exists updated_at timestamptz;

update public.media
set updated_at = created_at
where updated_at is null;

alter table public.media drop constraint if exists media_processing_status_check;
alter table public.media
  add constraint media_processing_status_check
  check (processing_status is null or processing_status in ('pending', 'processing', 'ready', 'failed'));

alter table public.media drop constraint if exists media_processing_error_check;
alter table public.media
  add constraint media_processing_error_check
  check (processing_error is null or char_length(processing_error) <= 200);

alter table public.media drop constraint if exists media_processing_done_check;
alter table public.media
  add constraint media_processing_done_check
  check (processing_done is null or processing_done >= 0);

alter table public.media drop constraint if exists media_slide_count_check;
alter table public.media
  add constraint media_slide_count_check
  check (slide_count is null or (slide_count >= 0 and slide_count <= 40));

alter table public.media drop constraint if exists media_group_duration_ms_check;
alter table public.media
  add constraint media_group_duration_ms_check
  check (group_duration_ms is null or group_duration_ms between 3000 and 3600000);

alter table public.media drop constraint if exists media_slide_duration_ms_check;
alter table public.media
  add constraint media_slide_duration_ms_check
  check (slide_duration_ms is null or slide_duration_ms between 3000 and 3600000);

alter table public.media drop constraint if exists media_group_revision_check;
alter table public.media
  add constraint media_group_revision_check
  check (group_revision >= 0);

alter table public.media drop constraint if exists media_slide_revision_check;
alter table public.media
  add constraint media_slide_revision_check
  check (slide_revision is null or slide_revision >= 0);

-- Playlist item durations for a presentation may be up to 3600s.
-- Image and video items stay capped at 600s in save_playlist. Widening the
-- check keeps every existing row valid (1000–600000 still passes).

do $$
declare
  r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'playlist_items'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%duration_ms%'
  loop
    execute format('alter table public.playlist_items drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.playlist_items
  add constraint playlist_items_duration_ms_check
  check (duration_ms is null or duration_ms between 1000 and 3600000);

-- ---------------------------------------------------------------- storage
-- PDF joins the existing image, video, and pptx allow-list.

update storage.buckets
set allowed_mime_types = array[
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/pdf'
]
where id = 'media';

-- ---------------------------------------------------------------- save_playlist
-- Same signature as 0016. Presentation items accept 3–3600 seconds.
-- Images and videos stay 1–600 seconds. Null duration still means "playlist default".

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
  v_kind text;
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
    select kind into v_kind
      from public.media
      where id = v_media and account_id = p_account_id;
    if not found then
      return false;
    end if;
    if v_item ? 'durationMs' and jsonb_typeof(v_item->'durationMs') <> 'null' then
      if (v_item->>'durationMs') !~ '^[0-9]+$' then
        return false;
      end if;
      v_duration := (v_item->>'durationMs')::integer;
      if v_kind = 'presentation' then
        if v_duration < 3000 or v_duration > 3600000 then
          return false;
        end if;
      elsif v_duration < 1000 or v_duration > 600000 then
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

-- ---------------------------------------------------------------- legacy expand
-- Per-slide playlists stay available when the caller asks (expandSlides).
-- Only the committed revision is copied, so a replace cannot mix generations.

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
  v_rev integer;
  v_n integer;
begin
  if v_name is null or char_length(v_name) < 1 then
    return null;
  end if;
  if v_mode not in ('auto', 'manual') then
    return null;
  end if;

  select group_revision into v_rev
  from public.media
  where id = p_source_media_id
    and account_id = p_account_id
    and kind = 'presentation';
  if not found then
    return null;
  end if;

  select count(*) into v_n
  from public.media m
  where m.account_id = p_account_id
    and m.source_media_id = p_source_media_id
    and (m.kind is null or m.kind = 'image')
    and (
      (v_rev = 0 and m.slide_revision is null)
      or m.slide_revision = v_rev
    );
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
    and (
      (v_rev = 0 and m.slide_revision is null)
      or m.slide_revision = v_rev
    )
  order by m.slide_index, k.kind;

  return v_id;
end $$;

-- ---------------------------------------------------------------- atomic publish of a new revision
-- Slides for the new revision are already stored. This swaps the pointer,
-- then bumps playlist revision and display content_version for screens that
-- publish the group. Players keep the previous payload until that version
-- changes, so they never paint a mix of old and new slides.

create or replace function public.presentation_commit_group(
  p_account_id uuid,
  p_media_id uuid,
  p_expected_revision integer,
  p_slide_count integer,
  p_width integer,
  p_height integer,
  p_size_bytes integer,
  p_file_name text,
  p_mime_type text,
  p_storage_path text
) returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_rev integer;
  v_kind text;
  v_next integer;
begin
  select group_revision, kind into v_rev, v_kind
  from public.media
  where id = p_media_id and account_id = p_account_id
  for update;
  if not found or v_kind <> 'presentation' then
    return null;
  end if;
  if v_rev is distinct from p_expected_revision then
    return null;
  end if;
  if p_slide_count is null or p_slide_count < 1 or p_slide_count > 40 then
    return null;
  end if;
  v_next := p_expected_revision + 1;
  if (
    select count(*)
    from public.media
    where account_id = p_account_id
      and source_media_id = p_media_id
      and slide_revision = v_next
  ) <> p_slide_count then
    return null;
  end if;

  update public.media
  set group_revision = v_next,
      processing_status = 'ready',
      processing_error = null,
      processing_done = p_slide_count,
      slide_count = p_slide_count,
      width = p_width,
      height = p_height,
      size_bytes = p_size_bytes,
      file_name = left(p_file_name, 200),
      mime_type = p_mime_type,
      storage_path = p_storage_path,
      group_duration_ms = coalesce(group_duration_ms, 10000),
      updated_at = now()
  where id = p_media_id and account_id = p_account_id;

  update public.playlists pl
  set revision = revision + 1,
      updated_at = now()
  where pl.account_id = p_account_id
    and exists (
      select 1 from public.playlist_items pi
      where pi.playlist_id = pl.id
        and pi.kind = 'published'
        and pi.media_id = p_media_id
    );

  update public.displays d
  set content_version = content_version + 1
  where d.account_id = p_account_id
    and d.status = 'active'
    and d.assigned_playlist_id in (
      select pi.playlist_id
      from public.playlist_items pi
      where pi.account_id = p_account_id
        and pi.kind = 'published'
        and pi.media_id = p_media_id
    );

  return v_next;
end $$;

-- ---------------------------------------------------------------- delete
-- Removes playlist references to the group and its slides, renumbers positions,
-- bumps versions, then deletes the rows. Returns storage paths for the route
-- to remove. Does not delete unrelated media.

create or replace function public.delete_presentation_group(
  p_account_id uuid,
  p_media_id uuid
) returns text[]
language plpgsql
set search_path = ''
as $$
declare
  v_kind text;
  v_ids uuid[];
  v_paths text[];
  v_lists uuid[];
  v_published uuid[];
begin
  select kind into v_kind
  from public.media
  where id = p_media_id and account_id = p_account_id
  for update;
  if not found or v_kind <> 'presentation' then
    return null;
  end if;

  select coalesce(array_agg(id), array[]::uuid[])
    into v_ids
  from public.media
  where account_id = p_account_id
    and (id = p_media_id or source_media_id = p_media_id);

  select coalesce(array_agg(distinct path), array[]::text[])
    into v_paths
  from (
    select storage_path as path
    from public.media
    where id = any(v_ids) and storage_path is not null
    union
    select thumbnail_path as path
    from public.media
    where id = any(v_ids) and thumbnail_path is not null
  ) paths;

  select coalesce(array_agg(distinct playlist_id), array[]::uuid[])
    into v_lists
  from public.playlist_items
  where account_id = p_account_id
    and media_id = any(v_ids);

  select coalesce(array_agg(distinct playlist_id), array[]::uuid[])
    into v_published
  from public.playlist_items
  where account_id = p_account_id
    and kind = 'published'
    and media_id = any(v_ids);

  delete from public.playlist_items
  where account_id = p_account_id
    and media_id = any(v_ids);

  -- One statement, so the unique (playlist, kind, position) check sees the final numbers.
  update public.playlist_items pi
  set position = numbered.pos
  from (
    select i.id,
           row_number() over (partition by i.playlist_id, i.kind order by i.position, i.id) - 1 as pos
    from public.playlist_items i
    where i.account_id = p_account_id
      and i.playlist_id = any(v_lists)
  ) numbered
  where pi.id = numbered.id
    and pi.position is distinct from numbered.pos;

  update public.playlists pl
  set revision = revision + 1,
      updated_at = now()
  where pl.account_id = p_account_id
    and pl.id = any(v_published);

  update public.displays d
  set assigned_media_id = case when d.assigned_media_id = any(v_ids) then null else d.assigned_media_id end,
      content_version = d.content_version + 1
  where d.account_id = p_account_id
    and (
      d.assigned_media_id = any(v_ids)
      or (d.status = 'active' and d.assigned_playlist_id = any(v_published))
    );

  delete from public.media
  where account_id = p_account_id
    and id = any(v_ids);

  return v_paths;
end $$;

revoke all on function public.presentation_commit_group(uuid, uuid, integer, integer, integer, integer, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.presentation_commit_group(uuid, uuid, integer, integer, integer, integer, integer, text, text, text) to service_role;

revoke all on function public.delete_presentation_group(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_presentation_group(uuid, uuid) to service_role;
