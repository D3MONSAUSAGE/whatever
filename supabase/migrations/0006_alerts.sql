-- M9: offline alerts. Additive only: new columns with defaults, a new table, functions, and a pg_cron job.
-- Rollback: select cron.unschedule('seemple-offline-alerts'); (tables/columns can stay; old code ignores them)

alter table public.accounts add column if not exists alerts_enabled boolean not null default true;
alter table public.accounts add column if not exists alert_threshold_minutes integer not null default 10;
alter table public.accounts add column if not exists alert_email_enabled boolean not null default true;
do $$ begin
  alter table public.accounts add constraint accounts_alert_threshold_check check (alert_threshold_minutes between 2 and 1440);
exception when duplicate_object then null; end $$;

-- Set when an "offline" alert fires; cleared when the screen recovers. Prevents duplicates.
alter table public.displays add column if not exists offline_alerted_at timestamptz;
alter table public.displays add column if not exists offline_alert_since timestamptz;

create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  display_id uuid references public.displays(id) on delete set null,
  display_name text not null,
  kind text not null check (kind in ('screen.offline', 'screen.recovered')),
  at timestamptz not null default now(),
  offline_since timestamptz not null,
  offline_seconds integer,
  read_at timestamptz,
  email_status text not null default 'off' check (email_status in ('off', 'pending', 'sent', 'skipped', 'failed')),
  email_attempts integer not null default 0,
  emailed_at timestamptz
);
create unique index if not exists alerts_once on public.alerts (display_id, kind, offline_since);
create index if not exists alerts_account_at on public.alerts (account_id, at desc);
create index if not exists alerts_email_pending on public.alerts (at) where email_status = 'pending';
alter table public.alerts enable row level security;
revoke all on public.alerts from anon, authenticated;

-- Runs every minute (pg_cron). Rows are locked (skip locked) and flagged in the same statement as the
-- insert, and the unique index backs it up, so overlapping runs never send duplicates.
create or replace function public.check_offline_alerts()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare n_off int := 0; n_back int := 0;
begin
  with cand as (
    select d.id, d.account_id, d.name, d.last_seen_at, a.alert_email_enabled
      from public.displays d join public.accounts a on a.id = d.account_id
     where a.alerts_enabled and d.status = 'active'
       and d.last_seen_at is not null and d.offline_alerted_at is null
       and d.last_seen_at < now() - make_interval(mins => a.alert_threshold_minutes)
       -- Only outages that started in the last day: no alert storm for long-dead screens on first run.
       and d.last_seen_at > now() - interval '1 day'
       for update of d skip locked
  ), upd as (
    update public.displays d
       set offline_alerted_at = now(), offline_alert_since = cand.last_seen_at + interval '90 seconds'
      from cand where d.id = cand.id
    returning cand.*
  ), ins as (
    insert into public.alerts (account_id, display_id, display_name, kind, offline_since, email_status)
    select account_id, id, name, 'screen.offline', last_seen_at + interval '90 seconds',
           case when alert_email_enabled then 'pending' else 'off' end
      from upd
    on conflict do nothing returning 1
  ) select count(*) into n_off from ins;

  with cand as (
    select d.id, d.account_id, d.name, d.status, d.last_seen_at, d.offline_alert_since,
           a.alerts_enabled, a.alert_email_enabled
      from public.displays d join public.accounts a on a.id = d.account_id
     where d.offline_alerted_at is not null
       and (d.status <> 'active' or d.last_seen_at > d.offline_alert_since)
       for update of d skip locked
  ), upd as (
    update public.displays d set offline_alerted_at = null, offline_alert_since = null
      from cand where d.id = cand.id
    returning cand.*
  ), ins as (
    -- A removed screen, or an account that turned alerts off, is cleared without a recovery alert.
    insert into public.alerts (account_id, display_id, display_name, kind, offline_since, offline_seconds, email_status)
    select account_id, id, name, 'screen.recovered', offline_alert_since,
           greatest(0, extract(epoch from (last_seen_at - offline_alert_since)))::int,
           case when alert_email_enabled then 'pending' else 'off' end
      from upd where status = 'active' and alerts_enabled
    on conflict do nothing returning 1
  ) select count(*) into n_back from ins;

  return jsonb_build_object('offline', n_off, 'recovered', n_back);
end $$;

create or replace function public.alerts_purge(p_days integer default 90, p_dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare cutoff timestamptz := now() - make_interval(days => greatest(coalesce(p_days, 90), 7)); n int;
begin
  if coalesce(p_dry_run, true) then
    select count(*) into n from public.alerts where at < cutoff;
  else
    delete from public.alerts where at < cutoff;
    get diagnostics n = row_count;
  end if;
  return jsonb_build_object('alerts', n);
end $$;

revoke all on function public.check_offline_alerts() from public, anon, authenticated;
revoke all on function public.alerts_purge(integer, boolean) from public, anon, authenticated;
grant execute on function public.check_offline_alerts() to service_role;
grant execute on function public.alerts_purge(integer, boolean) to service_role;

-- Every minute. Vercel Hobby only allows daily crons, so the check runs inside Postgres (pg_cron, free).
-- Email is sent by the app (POST /api/cron/alert-emails); see docs/ALERTS.md for turning that on.
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('seemple-offline-alerts', '* * * * *', 'select public.check_offline_alerts()');
exception when others then
  raise notice 'pg_cron unavailable (%); offline alerts will only be checked by the app cron', sqlerrm;
end $$;
