-- Roll back Phase 2D only. Run by hand. This is not a migration.
-- Drops the schedules, screen-group tables, the timezone column, and
-- snapshot_playlist. Does not update or delete rows in accounts, displays,
-- media, playlists, playlist_items, pairing_sessions, or rate_limits.
-- Location rows stay; only the timezone column added by 0004 is removed.
-- Display assignments, tokens, and published playlists are left as they are.
-- content_version values that snapshot_playlist incremented are not rewound.

drop function if exists public.snapshot_playlist(uuid, uuid);

drop table if exists public.schedules;
drop table if exists public.screen_group_members;
drop table if exists public.screen_groups;

alter table public.locations drop constraint if exists locations_timezone_len;
alter table public.locations drop column if exists timezone;
