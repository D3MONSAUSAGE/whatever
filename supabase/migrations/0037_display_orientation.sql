-- 0037 (t413u): vertical (9:16) menu boards. Additive and re-runnable.
--   * displays.orientation: 'landscape' (default) or 'portrait'. The owner's description of how the TV is mounted and
--     set up. It drives warnings and setup guidance only: it never rotates a TV and never changes what a screen plays.
--     Every existing screen reads 'landscape'. claim_pairing inserts (account_id, location_id, name) only, so new
--     screens also start 'landscape'; reconnect and other updates never write this column.
--   * displays.player_viewport_width / player_viewport_height / player_viewport_at: the CSS viewport the TV browser
--     last reported in its heartbeat (null until a player that reports it runs). Used to tell the owner what the TV
--     is actually outputting; never used to block playback.
-- No existing column, row, function or policy is altered or removed. Board orientation lives in menus.content
-- (absent = landscape), so menus needs no change.
-- Rollback: supabase/rollback/0037_display_orientation.sql.

begin;

alter table public.displays add column if not exists orientation text not null default 'landscape';
do $$ begin
  alter table public.displays add constraint displays_orientation_check
    check (orientation in ('landscape', 'portrait'));
exception when duplicate_object then null;
end $$;

alter table public.displays add column if not exists player_viewport_width integer;
alter table public.displays add column if not exists player_viewport_height integer;
alter table public.displays add column if not exists player_viewport_at timestamptz;
do $$ begin
  alter table public.displays add constraint displays_player_viewport_check
    check ((player_viewport_width is null or player_viewport_width between 1 and 20000)
       and (player_viewport_height is null or player_viewport_height between 1 and 20000));
exception when duplicate_object then null;
end $$;

commit;
