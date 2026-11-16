-- Rollback for 0029_dev_analytics.sql. Removes only what 0029 added. No customer data is touched
-- (the two tables hold only the developer allowlist and the analytics exclusion list).
drop function if exists public.dev_analytics_snapshot(uuid, timestamptz);
drop function if exists public.dev_analytics_referrer_host(text);
drop function if exists public.is_developer(uuid);
drop table if exists public.analytics_exclusions;
drop table if exists public.developer_users;
