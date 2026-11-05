-- Rollback for 0018_pptx_presentations.sql. Run by hand only if needed.
-- Does not delete media rows or storage objects. Presentation rows and slide
-- links become unconstrained leftovers the app will stop creating.
-- Does not touch accounts, displays, playlists, pairing, billing, or tokens.

drop function if exists public.presentation_create_playlist(uuid, uuid, text, text);

drop index if exists public.media_source_slide_idx;

alter table public.media drop constraint if exists media_slide_link_check;

alter table public.media drop column if exists slide_index;
alter table public.media drop column if exists source_media_id;

alter table public.media drop constraint if exists media_kind_check;
alter table public.media
  add constraint media_kind_check
  check (kind is null or kind in ('image', 'video'));

-- Restore pre-0018 MIME allow-list (images + mp4). Existing .pptx objects stay
-- in storage but new uploads of that type will be rejected by the bucket.
update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'video/mp4']
where id = 'media';
