-- Forward-safe rollback for 0019_presentation_groups.sql.
-- Run by hand. This is not a migration.
--
-- It keeps every column, row, duration, and storage object. It does not clamp
-- or delete data. The previous app can play again after the flatten step below.
--
-- Old deployment (player and API from before presentation groups):
--   1. Run this file on the database. It installs presentation_flatten_playlist_items()
--      and runs it once.
--   2. Confirm screens that had a grouped playlist now have one published item
--      per slide (image rows), and content_version moved so they reload.
--   3. Deploy the previous app. That player does not expand kind = presentation,
--      but the playlist no longer points at the presentation file.
--   4. Leave the 0019 columns in place. Shipping this branch again is safe:
--      the migration uses IF NOT EXISTS and CREATE OR REPLACE, and it does not
--      rewrite existing rows.
--
-- What stays in the database: processing status, durations, slide links,
-- group_revision, and the original files. A later deploy of this branch reads
-- them again. Flatten only rewrites playlist_items that point at a presentation
-- parent, replacing each of those items with the committed slide images.
--
-- Replace Presentation is not in this release. Do not delete older slide
-- generations; offline players may still be showing them until they poll.

create or replace function public.presentation_flatten_playlist_items()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_item record;
  v_rev integer;
  v_n integer;
  v_count integer := 0;
  v_playlists uuid[] := array[]::uuid[];
  v_skip uuid[] := array[]::uuid[];
begin
  loop
    select pi.id, pi.playlist_id, pi.account_id, pi.media_id, pi.kind, pi.position, pi.duration_ms,
           m.group_revision, m.group_duration_ms
      into v_item
    from public.playlist_items pi
    join public.media m on m.id = pi.media_id and m.account_id = pi.account_id
    where m.kind = 'presentation'
      and pi.id <> all(v_skip)
    order by pi.playlist_id, pi.kind, pi.position
    limit 1;
    exit when not found;
    v_rev := coalesce(v_item.group_revision, 0);
    select count(*) into v_n
    from public.media s
    where s.account_id = v_item.account_id
      and s.source_media_id = v_item.media_id
      and (s.kind is null or s.kind = 'image')
      and s.slide_index is not null
      and (
        (v_rev = 0 and s.slide_revision is null)
        or s.slide_revision = v_rev
      );
    -- No slides means flattening would remove the only thing on screen. Leave it.
    if v_n < 1 then
      v_skip := array_append(v_skip, v_item.id);
      continue;
    end if;

    delete from public.playlist_items where id = v_item.id;

    update public.playlist_items
    set position = position + (v_n - 1)
    where playlist_id = v_item.playlist_id
      and kind = v_item.kind
      and position > v_item.position;

    insert into public.playlist_items (
      playlist_id, account_id, media_id, kind, position, duration_ms
    )
    select v_item.playlist_id,
           v_item.account_id,
           s.id,
           v_item.kind,
           v_item.position + row_number() over (order by s.slide_index) - 1,
           coalesce(s.slide_duration_ms, v_item.duration_ms, v_item.group_duration_ms, 10000)
    from public.media s
    where s.account_id = v_item.account_id
      and s.source_media_id = v_item.media_id
      and (s.kind is null or s.kind = 'image')
      and s.slide_index is not null
      and (
        (v_rev = 0 and s.slide_revision is null)
        or s.slide_revision = v_rev
      );

    if v_item.kind = 'published' then
      v_playlists := array_append(v_playlists, v_item.playlist_id);
    end if;
    v_count := v_count + 1;
  end loop;

  update public.playlists
  set revision = revision + 1,
      updated_at = now()
  where id = any(v_playlists);

  update public.displays
  set content_version = content_version + 1
  where status = 'active'
    and assigned_playlist_id = any(v_playlists);

  return v_count;
end $$;

revoke all on function public.presentation_flatten_playlist_items() from public, anon, authenticated;
grant execute on function public.presentation_flatten_playlist_items() to service_role;

-- Apply the flatten now so an old player deployed next still has image slides.
select public.presentation_flatten_playlist_items();
