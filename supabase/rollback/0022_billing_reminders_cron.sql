-- Forward rollback for 0022. Removes only the billing-reminder scheduler.
-- Does not change Vault secrets, the alert job, account rows, notices, or grace.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    begin
      perform cron.unschedule('pekko-billing-reminders');
    exception when others then null;
    end;
  end if;
end
$$;

drop function if exists private.billing_reminders_auth_check(bigint);
drop function if exists private.dispatch_billing_reminders(boolean);
drop function if exists public.dispatch_billing_reminders();
drop table if exists private.billing_reminder_dispatches;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'private')
     and not exists (
       select 1 from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'private' and c.relkind in ('r', 'p', 'v', 'm', 'f')
     )
     and not exists (
       select 1 from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'private'
     )
  then
    drop schema private;
  end if;
end
$$;
