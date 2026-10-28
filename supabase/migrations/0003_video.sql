-- Pantalla phase 2B: H.264 video in the library and in playlists.
-- Additive and not idempotent. Apply once, after 0002_playlists.sql.
-- Does not change accounts, pairing, tokens, or ownership.

-- ---------------------------------------------------------------- columns
-- Existing rows stay images: kind is null and the app treats that as an image.

alter table public.media
  add column kind text check (kind is null or kind in ('image', 'video')),
  add column duration_ms integer check (duration_ms is null or (duration_ms > 0 and duration_ms <= 180000)),
  add column width integer check (width is null or width > 0),
  add column height integer check (height is null or height > 0),
  add column thumbnail_path text;

alter table public.displays
  add column player_error text check (player_error is null or char_length(player_error) <= 180),
  add column player_error_at timestamptz;

-- The dashboard reads displays through the API (service role). Grant the new
-- columns so a direct authenticated select that lists them still works.
-- token_hash stays excluded.
grant select (player_error, player_error_at) on public.displays to authenticated;

-- ---------------------------------------------------------------- storage
-- Images are still rejected above 15 MB by the app. The bucket limit is the
-- video cap, which matches the Free plan global upload limit (50 MB).

update storage.buckets
set file_size_limit = 52428800,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'video/mp4']
where id = 'media';

-- ---------------------------------------------------------------- functions

-- Same signature as 0002. A single-image assignment cannot be a video.
create or replace function public.assign_media(p_account_id uuid, p_display_id uuid, p_media_id uuid)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  if p_media_id is not null and not exists (
    select 1 from public.media
    where id = p_media_id
      and account_id = p_account_id
      and (kind is null or kind = 'image')
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

-- Return type gains kind and the file's own duration. Drop is required;
-- CREATE OR REPLACE cannot change a function's return columns.
drop function if exists public.player_playlist(text);

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

-- TV reports a clip it could not play. Empty text clears the dashboard note.
create function public.report_player_error(p_token_hash text, p_error text)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_error text;
begin
  if p_error is null or char_length(btrim(p_error)) = 0 then
    update public.displays
      set player_error = null, player_error_at = null
      where token_hash = p_token_hash and status = 'active';
    return found;
  end if;

  v_error := substring(btrim(p_error) from 1 for 180);
  update public.displays
    set player_error = v_error, player_error_at = now()
    where token_hash = p_token_hash and status = 'active';
  return found;
end $$;

revoke execute on function public.player_playlist(text) from public, anon, authenticated;
revoke execute on function public.report_player_error(text, text) from public, anon, authenticated;

grant execute on function public.player_playlist(text) to service_role;
grant execute on function public.report_player_error(text, text) to service_role;
