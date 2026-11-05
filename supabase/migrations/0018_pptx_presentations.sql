-- PowerPoint (.pptx) uploads: store the original file, link converted slide images,
-- and create a playlist from those slides. Additive and backward-compatible.
-- Does not touch billing, Stripe, Meta, accounts, pairing, tokens, or player RPCs.

-- ---------------------------------------------------------------- media columns
-- Existing image/video rows keep working. kind null still means image.

alter table public.media drop constraint if exists media_kind_check;
alter table public.media
  add constraint media_kind_check
  check (kind is null or kind in ('image', 'video', 'presentation'));

alter table public.media
  add column if not exists source_media_id uuid references public.media(id) on delete set null;

alter table public.media
  add column if not exists slide_index integer;

alter table public.media drop constraint if exists media_slide_link_check;
alter table public.media
  add constraint media_slide_link_check
  check (
    (source_media_id is null and slide_index is null)
    or (source_media_id is not null and slide_index is not null and slide_index >= 0)
  );

create index if not exists media_source_slide_idx
  on public.media(account_id, source_media_id, slide_index)
  where source_media_id is not null;

-- ---------------------------------------------------------------- storage
-- Keep the 50 MB bucket cap (video). Allow the Open XML PowerPoint MIME type.
-- Legacy .ppt and macro-enabled .pptm stay rejected by the app.

update storage.buckets
set allowed_mime_types = array[
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation'
]
where id = 'media';

-- ---------------------------------------------------------------- playlist from slides
-- Builds a draft+published playlist in slide_index order. Default Manual mode
-- so the deck is ready for on-screen / phone remote control (PR #38 / #39).

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

revoke all on function public.presentation_create_playlist(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.presentation_create_playlist(uuid, uuid, text, text) to service_role;
