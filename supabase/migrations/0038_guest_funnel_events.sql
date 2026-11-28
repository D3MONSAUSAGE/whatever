-- 0038 Guest-editor funnel steps in the cookieless daily counters (docs/GUEST_EDITOR_PLAN.md §6).
-- Additive: widens the allowed (event) list of public.funnel_daily. No new data, no change to any other table.
-- Still no identifier of any kind: one counter per (day, event, detail). Safe to re-run.
-- Rollback: supabase/rollback/0038_guest_funnel_events.sql

begin;

alter table public.funnel_daily drop constraint if exists funnel_daily_event_check;
alter table public.funnel_daily add constraint funnel_daily_event_check check (event in (
  'cta_click', 'signup_view', 'signup_submit', 'signup_error', 'template_try',
  'guest_open', 'guest_edit', 'guest_preview', 'guest_action', 'signup_prompt'
));

commit;
