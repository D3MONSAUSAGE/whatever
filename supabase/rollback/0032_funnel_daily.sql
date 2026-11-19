-- Rollback for 0032_funnel_daily.sql. Removes only the signup funnel counters it added. No account,
-- subscription, billing or traffic data is touched. The app keeps working without these objects: funnel
-- events become a no-op and the console panel says the funnel isn't being collected.
begin;
drop function if exists public.dev_funnel_snapshot(uuid, date, date);
drop function if exists public.funnel_record(date, text, text);
drop table if exists public.funnel_daily;
commit;
