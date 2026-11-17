-- Rollback for 0031_website_traffic.sql. Removes only what 0031 added (aggregate traffic counters, same-day
-- visitor hashes and daily salts). No account, subscription, billing or other analytics data is touched.
-- The app keeps working without these objects: collection becomes a no-op and the console tab says that
-- traffic collection isn't set up.
begin;
drop function if exists public.dev_traffic_snapshot(uuid, date, date);
drop function if exists public.traffic_record(date, text, text, boolean, text, text, text);
drop function if exists public.traffic_salt(date);
drop function if exists public.traffic_caller_is_service();
drop table if exists public.traffic_daily;
drop table if exists public.traffic_unique_daily;
drop table if exists public.traffic_visitors;
drop table if exists public.traffic_salts;
commit;
