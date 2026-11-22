-- Accounts for the 0036 backfill test. a1..a9 are fixed ids so assertions read plainly.
insert into auth.users (id, email) select ('00000000-0000-4000-8000-00000000000' || n)::uuid, 'owner' || n || '@example.com' from generate_series(1, 9) n;
insert into public.accounts (id, name, owner_user_id, created_at)
select ('aaaaaaaa-0000-4000-8000-00000000000' || n)::uuid, 'owner' || n, ('00000000-0000-4000-8000-00000000000' || n)::uuid, now() - interval '2 days'
  from generate_series(1, 9) n;
-- a1: fresh, nothing saved.
-- a2: a draft board with one named item, no TV.
insert into public.menus (account_id, name, content) values ('aaaaaaaa-0000-4000-8000-000000000002', 'Lunch',
  '{"layoutVersion":1,"title":"Lunch","sections":[{"name":"Tacos","items":[{"name":"Al pastor","price":"3"}]}]}');
-- a3: a title-only board (no items, no featured media), plus its board still. Not a first menu.
insert into public.menus (account_id, name, content) values ('aaaaaaaa-0000-4000-8000-000000000003', 'Only a name',
  '{"layoutVersion":1,"title":"Taqueria","sections":[{"name":"","items":[{"name":"   ","price":""}]}]}');
insert into public.media (account_id, file_name, kind) values ('aaaaaaaa-0000-4000-8000-000000000003', 'Taqueria (menu).png', 'image');
-- a4: one finished photo upload.
insert into public.media (account_id, file_name, kind) values ('aaaaaaaa-0000-4000-8000-000000000004', 'my-menu.jpg', 'image');
-- a5: only a converting video and a failed deck, plus a promo still and a slide child. Not a first menu.
insert into public.media (account_id, file_name, kind, processing_status) values
  ('aaaaaaaa-0000-4000-8000-000000000005', 'clip.mov', 'video', 'processing'),
  ('aaaaaaaa-0000-4000-8000-000000000005', 'deck.pptx', 'presentation', 'failed'),
  ('aaaaaaaa-0000-4000-8000-000000000005', 'Sale (promo).png', 'image', null);
insert into public.media (account_id, file_name, kind, source_media_id) values
  ('aaaaaaaa-0000-4000-8000-000000000005', 'slide 1.png', 'image', gen_random_uuid());
-- a6: created before onboarding shipped, screen + media + an assigned image (v1 "existing customer").
update public.accounts set created_at = '2026-10-01T00:00:00Z' where id = 'aaaaaaaa-0000-4000-8000-000000000006';
insert into public.media (id, account_id, file_name, kind) values ('bbbbbbbb-0000-4000-8000-000000000006', 'aaaaaaaa-0000-4000-8000-000000000006', 'Board (menu).png', 'image');
insert into public.displays (account_id, name, assigned_media_id) values ('aaaaaaaa-0000-4000-8000-000000000006', 'Front', 'bbbbbbbb-0000-4000-8000-000000000006');
-- a7: dismissed the checklist, has an upload.
update public.accounts set onboarding_dismissed_at = '2026-11-20T10:00:00Z' where id = 'aaaaaaaa-0000-4000-8000-000000000007';
insert into public.media (account_id, file_name, kind, processing_status) values ('aaaaaaaa-0000-4000-8000-000000000007', 'promo.mp4', 'video', 'ready');
-- a8: every required step from data: board, paired TV showing its published playlist, a second change to that TV.
insert into public.playlists (id, account_id, name, published_at) values ('cccccccc-0000-4000-8000-000000000008', 'aaaaaaaa-0000-4000-8000-000000000008', 'Lunch', now() - interval '1 day');
insert into public.menus (account_id, name, content, playlist_id) values ('aaaaaaaa-0000-4000-8000-000000000008', 'Lunch',
  '{"title":"","sections":[{"name":"","items":[{"name":"Coffee","price":"2"}]}],"custom":{"v":1,"textScale":1.1}}', 'cccccccc-0000-4000-8000-000000000008');
insert into public.displays (id, account_id, name, assigned_playlist_id) values ('dddddddd-0000-4000-8000-000000000008', 'aaaaaaaa-0000-4000-8000-000000000008', 'Bar', 'cccccccc-0000-4000-8000-000000000008');
insert into public.activity_events (account_id, at, kind, subject_id) values
  ('aaaaaaaa-0000-4000-8000-000000000008', now() - interval '20 hours', 'screen.content_changed', 'dddddddd-0000-4000-8000-000000000008'),
  ('aaaaaaaa-0000-4000-8000-000000000008', now() - interval '2 hours', 'screen.content_changed', 'dddddddd-0000-4000-8000-000000000008');
-- a9: first publish to two TVs (one change each) is not an update; an own playlist with a slide; a schedule.
insert into public.playlists (id, account_id, name, published_at) values ('cccccccc-0000-4000-8000-000000000009', 'aaaaaaaa-0000-4000-8000-000000000009', 'Mine', now());
insert into public.media (id, account_id, file_name, kind) values ('bbbbbbbb-0000-4000-8000-000000000009', 'aaaaaaaa-0000-4000-8000-000000000009', 'photo.png', 'image');
insert into public.playlist_items (playlist_id, account_id, media_id) values ('cccccccc-0000-4000-8000-000000000009', 'aaaaaaaa-0000-4000-8000-000000000009', 'bbbbbbbb-0000-4000-8000-000000000009');
insert into public.displays (id, account_id, name, assigned_playlist_id) values
  ('dddddddd-0000-4000-8000-000000000091', 'aaaaaaaa-0000-4000-8000-000000000009', 'A', 'cccccccc-0000-4000-8000-000000000009'),
  ('dddddddd-0000-4000-8000-000000000092', 'aaaaaaaa-0000-4000-8000-000000000009', 'B', 'cccccccc-0000-4000-8000-000000000009');
insert into public.activity_events (account_id, kind, subject_id) values
  ('aaaaaaaa-0000-4000-8000-000000000009', 'screen.content_changed', 'dddddddd-0000-4000-8000-000000000091'),
  ('aaaaaaaa-0000-4000-8000-000000000009', 'screen.content_changed', 'dddddddd-0000-4000-8000-000000000092');
insert into public.schedules (account_id) values ('aaaaaaaa-0000-4000-8000-000000000009');
