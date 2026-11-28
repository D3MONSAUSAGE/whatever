-- Rollback of 0038: drops the guest-editor counter rows and restores the original event list.
begin;
delete from public.funnel_daily where event in ('guest_open', 'guest_edit', 'guest_preview', 'guest_action', 'signup_prompt');
alter table public.funnel_daily drop constraint if exists funnel_daily_event_check;
alter table public.funnel_daily add constraint funnel_daily_event_check check (event in ('cta_click', 'signup_view', 'signup_submit', 'signup_error', 'template_try'));
commit;
