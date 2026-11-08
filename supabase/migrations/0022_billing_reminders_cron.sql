-- Schedules the unattended billing-reminder call. Additive: one unexposed schema,
-- one private table of request ids, two functions, and one cron job.
-- No account rows change. No Vault secret is written or returned.
-- Inert until Vault secret 'seemple_cron_secret' already exists (returns status 'no_secret').
-- The app route also returns without sending or stamping unless BILLING_REMINDERS is exactly 1.
-- Once a day stays inside Resend's free quota. Do not change this to every minute.
-- The function reads Vault and calls pg_net itself. It takes no URL and no secret argument.
-- Its return value is status metadata only, so cron.job_run_details cannot store the bearer token.
-- Do not query vault.decrypted_secrets or net.http_request_queue: those hold the secret.
-- Do not add schema private to the Data API exposed schemas.
-- Rollback: supabase/rollback/0022_billing_reminders_cron.sql

create schema if not exists private;
comment on schema private is 'Unexposed helper schema. Not for the Data API.';

revoke all on schema private from public;
revoke all on schema private from anon, authenticated, service_role;
alter default privileges in schema private revoke all on functions from public, anon, authenticated, service_role;
alter default privileges in schema private revoke all on tables from public, anon, authenticated, service_role;

-- Request ids this dispatcher created. Lets the auth check refuse every other pg_net response.
create table if not exists private.billing_reminder_dispatches (
  request_id bigint primary key,
  dry_run boolean not null,
  created_at timestamptz not null default pg_catalog.now()
);
alter table private.billing_reminder_dispatches enable row level security;
revoke all on table private.billing_reminder_dispatches from public;
revoke all on table private.billing_reminder_dispatches from anon, authenticated, service_role;

-- Removes a draft that lived in public. Production never installed it.
drop function if exists public.dispatch_billing_reminders();

create or replace function private.dispatch_billing_reminders(p_dry_run boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  secret text;
  origin text;
  request_id bigint;
  path text;
begin
  select decrypted_secret into secret
  from vault.decrypted_secrets
  where name = 'seemple_cron_secret'
  limit 1;
  if coalesce(secret, ''::text) = '' then
    return pg_catalog.jsonb_build_object('status', 'no_secret');
  end if;

  select nullif(decrypted_secret, ''::text) into origin
  from vault.decrypted_secrets
  where name = 'pekko_app_origin'
  limit 1;
  -- Host only. A path, query, or userinfo would put the bearer token in a URL.
  if origin is null or origin !~ '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?$' then
    origin := 'https://pantalla-chi.vercel.app';
  end if;

  path := '/api/cron/billing-reminders';
  if coalesce(p_dry_run, false::boolean) then
    path := path || '?dryRun=1';
  end if;

  request_id := net.http_get(
    url := origin || path,
    headers := pg_catalog.jsonb_build_object('Authorization', 'Bearer ' || secret),
    timeout_milliseconds := 55000
  );
  secret := null;

  delete from private.billing_reminder_dispatches
  where created_at < pg_catalog.now() - interval '2 days';
  insert into private.billing_reminder_dispatches (request_id, dry_run)
  values (request_id, coalesce(p_dry_run, false::boolean));

  return pg_catalog.jsonb_build_object(
    'status', 'dispatched',
    'request_id', request_id,
    'dry_run', coalesce(p_dry_run, false::boolean)
  );
exception
  when others then
    return pg_catalog.jsonb_build_object('status', 'dispatch_failed');
end
$$;

comment on function private.dispatch_billing_reminders(boolean) is
  'Server-side billing reminder dispatch. Returns status, request_id, and dry_run only.';

-- Reads one response this dispatcher queued and returns auth metadata only.
-- http 200 + cronAuth accepted + enabled false => auth aligned, while reminders stay off.
create or replace function private.billing_reminders_auth_check(p_request_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  code integer;
  body text;
  timed_out boolean;
  parsed jsonb := '{}'::jsonb;
  ok_val jsonb;
  enabled_val jsonb;
  dry_run_val jsonb;
  cron_auth text;
  auth text;
begin
  if p_request_id is null or not exists (
    select 1 from private.billing_reminder_dispatches where request_id = p_request_id
  ) then
    return pg_catalog.jsonb_build_object('status', 'unknown_request');
  end if;

  select r.status_code, r.content, r.timed_out
    into code, body, timed_out
  from net._http_response r
  where r.id = p_request_id
  limit 1;
  if not found then
    return pg_catalog.jsonb_build_object('status', 'pending');
  end if;

  if body is not null then
    begin
      parsed := body::jsonb;
    exception
      when others then
        parsed := '{}'::jsonb;
    end;
  end if;

  ok_val := case when pg_catalog.jsonb_typeof(parsed -> 'ok') = 'boolean' then parsed -> 'ok' else 'null'::jsonb end;
  enabled_val := case when pg_catalog.jsonb_typeof(parsed -> 'enabled') = 'boolean' then parsed -> 'enabled' else 'null'::jsonb end;
  dry_run_val := case when pg_catalog.jsonb_typeof(parsed -> 'dryRun') = 'boolean' then parsed -> 'dryRun' else 'null'::jsonb end;
  cron_auth := parsed ->> 'cronAuth';
  if cron_auth is distinct from 'accepted' then
    cron_auth := null;
  end if;

  auth := case
    when code = 401 then 'rejected'
    when code = 503 then 'app_unconfigured'
    when code = 200 and cron_auth = 'accepted' and enabled_val = 'false'::jsonb then 'aligned'
    when code = 200 and cron_auth = 'accepted' and enabled_val = 'true'::jsonb then 'flag_on'
    else 'unexpected'
  end;

  return pg_catalog.jsonb_build_object(
    'status', 'checked',
    'http_status', code,
    'timed_out', coalesce(timed_out, false::boolean),
    'ok', ok_val,
    'enabled', enabled_val,
    'dry_run', dry_run_val,
    'cron_auth', cron_auth,
    'auth', auth
  );
exception
  when others then
    return pg_catalog.jsonb_build_object('status', 'check_failed');
end
$$;

comment on function private.billing_reminders_auth_check(bigint) is
  'Returns HTTP status and reminder flags for one dispatcher request. No headers, body, or secret.';

revoke all on function private.dispatch_billing_reminders(boolean) from public;
revoke all on function private.dispatch_billing_reminders(boolean) from anon, authenticated, service_role;
revoke all on function private.billing_reminders_auth_check(bigint) from public;
revoke all on function private.billing_reminders_auth_check(bigint) from anon, authenticated, service_role;

-- pg_cron runs as the user who schedules the job. On Supabase that user is postgres.
-- API roles stay revoked. Local Postgres images that have no postgres role skip this grant.
do $$
begin
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'postgres') then
    grant usage on schema private to postgres;
    grant execute on function private.dispatch_billing_reminders(boolean) to postgres;
    grant execute on function private.billing_reminders_auth_check(bigint) to postgres;
  end if;
end
$$;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    begin
      perform cron.unschedule('pekko-billing-reminders');
    exception when others then null;
    end;
    perform cron.schedule(
      'pekko-billing-reminders',
      '0 15 * * *',
      'select private.dispatch_billing_reminders(false)'
    );
  end if;
end
$$;
