-- Rollback for 0030_dev_accounts.sql. Removes only the function 0030 added. No data is touched.
begin;
drop function if exists public.dev_accounts_list(uuid);
commit;
