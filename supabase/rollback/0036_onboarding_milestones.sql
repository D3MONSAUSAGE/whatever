-- Rollback for 0036_onboarding_milestones.sql. Removes only what 0036 added: the three onboarding columns
-- (and the milestone times in them), onboarding_mark/onboarding_iso, and the insert-time first-publish trigger.
-- onboarding_dismissed_at and business_confirmed_at are untouched. The app keeps working without these objects:
-- GET /api/onboarding?v=2 falls back to live data and stamps nothing; v1 is unchanged.
-- Events already written (onboarding.* and backfilled commercial.first_publish) stay in activity_events, where
-- the 90-day purge removes them; delete them first if a clean slate is wanted:
--   delete from public.activity_events where kind like 'onboarding.%';
--   delete from public.activity_events where kind = 'commercial.first_publish' and detail->>'backfilled' = 'true';
begin;
drop trigger if exists playlists_commercial_insert on public.playlists;
drop function if exists public.trg_playlists_commercial_insert();
drop function if exists public.onboarding_mark(uuid, text[], text, text);
drop function if exists public.onboarding_iso(timestamptz);
alter table public.accounts drop constraint if exists accounts_onboarding_milestones_object;
alter table public.accounts drop column if exists first_menu_celebrated_at;
alter table public.accounts drop column if exists onboarding_completed_at;
alter table public.accounts drop column if exists onboarding_milestones;
commit;
