-- Rollback 0033. Restores player_playlist and player_state to the 0016 / 0001 bodies (no processing filter).
-- Does not touch media rows, accounts, or November 11 backup tables.

begin;

drop function if exists public.reserve_video_conversion(uuid, uuid, date, integer, text, text, integer, integer, integer, text, text, text);
drop function if exists public.mark_video_conversion_submitted(uuid, text);
drop function if exists public.complete_video_conversion(uuid, text, integer, text);
drop function if exists public._video_conversion_require_service();
drop table if exists public.video_conversion_jobs;
drop table if exists public.video_conversion_months;

create or replace function public.player_playlist(p_token_hash text)
returns table (
  playlist_id uuid,
  transition text,
  playback_mode text,
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
         coalesce(pl.published_playback_mode, 'auto'),
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

revoke execute on function public.player_playlist(text) from public, anon, authenticated;
grant execute on function public.player_playlist(text) to service_role;

create or replace function public.player_state(p_token_hash text)
returns table (display_id uuid, content_version integer, media_id uuid, storage_path text)
language sql
set search_path = ''
as $$
  with beat as (
    update public.displays set last_seen_at = now()
    where token_hash = p_token_hash and status = 'active'
      and (last_seen_at is null or last_seen_at < now() - interval '30 seconds')
    returning id
  )
  select d.id, d.content_version, m.id, m.storage_path
  from public.displays d
  left join public.media m on m.id = d.assigned_media_id
  left join beat on true
  where d.token_hash = p_token_hash and d.status = 'active';
$$;

revoke execute on function public.player_state(text) from public, anon, authenticated;
grant execute on function public.player_state(text) to service_role;

commit;
