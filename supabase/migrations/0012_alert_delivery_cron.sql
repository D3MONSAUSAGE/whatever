-- M16: deliver offline/recovery alerts automatically (no dashboard open).
-- Detection already runs every minute (cron job 'seemple-offline-alerts' -> check_offline_alerts()).
-- This adds the delivery trigger: every minute, if any alert is pending email or push, pg_net calls
-- the app's cron endpoints with CRON_SECRET read from Supabase Vault.
-- Additive only: pg_net extension, one function, one cron job. No table, column or row changes.
-- Inert until the Vault secret 'seemple_cron_secret' exists (returns status 'no_secret').
-- No duplicates: the app claims each alert by id with a compare-and-set
-- (status = 'pending' and attempts = n -> n+1), so overlapping runs can't send the same alert twice.
-- Rollback: select cron.unschedule('pekko-alert-delivery'); drop function public.dispatch_alert_delivery();

create extension if not exists pg_net;

create or replace function public.dispatch_alert_delivery()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  secret text;
  origin text;
  email_pending boolean;
  push_pending boolean;
  hdrs jsonb;
  out jsonb := '{}'::jsonb;
begin
  select exists (select 1 from public.alerts where email_status = 'pending') into email_pending;
  select exists (select 1 from public.alerts where push_status = 'pending') into push_pending;
  if not (email_pending or push_pending) then return jsonb_build_object('status', 'idle'); end if;

  select decrypted_secret into secret from vault.decrypted_secrets where name = 'seemple_cron_secret' limit 1;
  if coalesce(secret, '') = '' then return jsonb_build_object('status', 'no_secret'); end if;
  select nullif(decrypted_secret, '') into origin from vault.decrypted_secrets where name = 'pekko_app_origin' limit 1;
  origin := coalesce(origin, 'https://pantalla-chi.vercel.app');

  hdrs := jsonb_build_object('Authorization', 'Bearer ' || secret);
  if email_pending then
    out := out || jsonb_build_object('email', net.http_get(url := origin || '/api/cron/alert-emails', headers := hdrs, timeout_milliseconds := 55000));
  end if;
  if push_pending then
    out := out || jsonb_build_object('push', net.http_get(url := origin || '/api/cron/alert-push', headers := hdrs, timeout_milliseconds := 55000));
  end if;
  return out || jsonb_build_object('status', 'dispatched');
end $$;
revoke all on function public.dispatch_alert_delivery() from public, anon, authenticated;
grant execute on function public.dispatch_alert_delivery() to service_role;

do $$ begin perform cron.unschedule('pekko-alert-delivery'); exception when others then null; end $$;
select cron.schedule('pekko-alert-delivery', '* * * * *', 'select public.dispatch_alert_delivery()');
