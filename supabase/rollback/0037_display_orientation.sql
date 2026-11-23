-- Rollback for 0037_display_orientation.sql. Removes only what 0037 added. The app keeps working without these
-- columns: GET /api/displays reports every screen as landscape, PATCH { orientation } returns 503 "not available yet",
-- and player viewport heartbeats are ignored. Board orientation (menus.content) is not touched.
begin;
alter table public.displays drop constraint if exists displays_player_viewport_check;
alter table public.displays drop column if exists player_viewport_at;
alter table public.displays drop column if exists player_viewport_height;
alter table public.displays drop column if exists player_viewport_width;
alter table public.displays drop constraint if exists displays_orientation_check;
alter table public.displays drop column if exists orientation;
commit;
