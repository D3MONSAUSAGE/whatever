-- Rollback 0017_remote_control. Drops remote-control RPCs and tables.
-- Does not touch playlists, displays content, or 0016 playback_mode columns.

drop function if exists public.enqueue_display_command(uuid, uuid, uuid, text);
drop function if exists public.set_display_playlist_mode(uuid, uuid, uuid, text);
drop function if exists public.player_pending_commands(text);
drop function if exists public.player_report_playback(text, uuid, text, integer, integer, bigint, bigint);

drop table if exists public.display_commands;
drop table if exists public.display_playback;
