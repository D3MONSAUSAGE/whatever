-- M16: push notifications (FCM) for the existing offline/recovery alerts. Additive only:
-- one new table, new columns with defaults, two functions. check_offline_alerts() is unchanged.
-- Rollback: nothing to undo for old code (it ignores the new table and columns). Push stays off
-- until FCM_SERVICE_ACCOUNT is set on the server.

-- Per-account switch, next to alert_email_enabled.
alter table public.accounts add column if not exists alert_push_enabled boolean not null default true;

-- Push state per alert, same pattern as email. Existing alerts get 'off' (never pushed);
-- alerts created after this migration start as 'pending'.
alter table public.alerts add column if not exists push_status text not null default 'off';
alter table public.alerts alter column push_status set default 'pending';
alter table public.alerts add column if not exists push_attempts integer not null default 0;
alter table public.alerts add column if not exists pushed_at timestamptz;
do $$ begin
  alter table public.alerts add constraint alerts_push_status_check check (push_status in ('off', 'pending', 'sent', 'skipped', 'failed'));
exception when duplicate_object then null; end $$;
create index if not exists alerts_push_pending on public.alerts (at) where push_status = 'pending';

-- One row per app install. A token belongs to exactly one user/account at a time:
-- registering it again under another login moves it (no cross-account delivery).
create table if not exists public.push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  token text not null unique check (char_length(token) between 20 and 4096),
  platform text not null check (platform in ('android', 'ios')),
  app_version text check (app_version is null or char_length(app_version) <= 40),
  notify_offline boolean not null default true,
  notify_recovery boolean not null default true,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_error text
);
create index if not exists push_devices_account on public.push_devices (account_id);
create index if not exists push_devices_user on public.push_devices (user_id);
create index if not exists push_devices_seen on public.push_devices (last_seen_at);
alter table public.push_devices enable row level security;
-- Server-only (service role), like public.alerts. The app talks to /api/devices.
revoke all on public.push_devices from anon, authenticated;

-- Tokens not refreshed by the app for p_days (default 60, min 14) are deleted.
create or replace function public.push_devices_purge(p_days integer default 60, p_dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare cutoff timestamptz := now() - make_interval(days => greatest(coalesce(p_days, 60), 14)); n int;
begin
  if coalesce(p_dry_run, true) then
    select count(*) into n from public.push_devices where last_seen_at < cutoff;
  else
    delete from public.push_devices where last_seen_at < cutoff;
    get diagnostics n = row_count;
  end if;
  return jsonb_build_object('devices', n);
end $$;
revoke all on function public.push_devices_purge(integer, boolean) from public, anon, authenticated;
grant execute on function public.push_devices_purge(integer, boolean) to service_role;
