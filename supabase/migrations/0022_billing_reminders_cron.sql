-- Schedules the unattended billing-reminder call. Additive: one function and one
-- cron job. No account rows change. Inert until Vault secret 'seemple_cron_secret'
-- exists. The app route also returns without sending or stamping unless
-- BILLING_REMINDERS is exactly 1, so installing this job does not email anyone.
-- Once a day stays inside Resend's free quota. Do not change this to every minute.
-- Rollback: select cron.unschedule('pekko-billing-reminders'); drop function public.dispatch_billing_reminders();

create or replace function public.dispatch_billing_reminders()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  secret text;
  origin text;
begin
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'seemple_cron_secret' limit 1;
  if coalesce(secret, '') = '' then return jsonb_build_object('status', 'no_secret'); end if;
  select nullif(decrypted_secret, '') into origin from vault.decrypted_secrets where name = 'pekko_app_origin' limit 1;
  origin := coalesce(origin, 'https://pantalla-chi.vercel.app');
  return jsonb_build_object(
    'status', 'dispatched',
    'request', net.http_get(
      url := origin || '/api/cron/billing-reminders',
      headers := jsonb_build_object('Authorization', 'Bearer ' || secret),
      timeout_milliseconds := 55000
    )
  );
end $$;
revoke all on function public.dispatch_billing_reminders() from public, anon, authenticated;
grant execute on function public.dispatch_billing_reminders() to service_role;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    begin
      perform cron.unschedule('pekko-billing-reminders');
    exception when others then null;
    end;
    perform cron.schedule('pekko-billing-reminders', '0 15 * * *', 'select public.dispatch_billing_reminders()');
  end if;
end $$;
