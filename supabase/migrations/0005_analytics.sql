-- M8: onboarding flags, proof of play, uptime buckets, offline periods, activity log.
-- Additive only: new nullable columns, new tables, new functions and triggers.
-- Nothing existing is altered or removed. Retention: 90 days (analytics_purge, run by the daily cron).

alter table public.accounts add column if not exists onboarding_dismissed_at timestamptz;
alter table public.accounts add column if not exists business_confirmed_at timestamptz;
alter table public.displays add column if not exists confirmed_version bigint;
alter table public.displays add column if not exists confirmed_at timestamptz;

-- One row per screen per hour. online_seconds = sum of heartbeat gaps of at most 90 s.
create table if not exists public.display_uptime_hourly (
  display_id uuid not null references public.displays(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  hour timestamptz not null,
  online_seconds integer not null default 0 check (online_seconds between 0 and 7200),
  primary key (display_id, hour)
);
create index if not exists display_uptime_hourly_account_idx on public.display_uptime_hourly(account_id, hour);

-- A heartbeat after a gap of more than 90 s closes an offline period.
create table if not exists public.display_offline_periods (
  id bigint generated always as identity primary key,
  display_id uuid not null references public.displays(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz not null
);
create index if not exists display_offline_periods_display_idx on public.display_offline_periods(display_id, ended_at desc);
create index if not exists display_offline_periods_account_idx on public.display_offline_periods(account_id, ended_at desc);

-- TV-confirmed playback: one row per content change the TV actually painted.
create table if not exists public.playback_events (
  id bigint generated always as identity primary key,
  display_id uuid not null references public.displays(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  version bigint not null,
  at timestamptz not null default now()
);
create index if not exists playback_events_display_idx on public.playback_events(display_id, at desc);
create index if not exists playback_events_account_idx on public.playback_events(account_id, at desc);

create table if not exists public.activity_events (
  id bigint generated always as identity primary key,
  account_id uuid not null references public.accounts(id) on delete cascade,
  at timestamptz not null default now(),
  kind text not null,
  subject_id uuid,
  subject_name text,
  detail jsonb not null default '{}'::jsonb
);
create index if not exists activity_events_account_idx on public.activity_events(account_id, at desc);

alter table public.display_uptime_hourly enable row level security;
alter table public.display_offline_periods enable row level security;
alter table public.playback_events enable row level security;
alter table public.activity_events enable row level security;
-- No policies: only the server (service role) reads and writes these.
revoke all on public.display_uptime_hourly, public.display_offline_periods, public.playback_events, public.activity_events from anon, authenticated;

create or replace function public.log_activity(p_account uuid, p_kind text, p_subject uuid, p_name text, p_detail jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.activity_events (account_id, kind, subject_id, subject_name, detail)
  values (p_account, p_kind, p_subject, left(p_name, 120), coalesce(p_detail, '{}'::jsonb));
exception when others then
  null; -- analytics must never block the change that triggered it
end $$;

create or replace function public.trg_displays_analytics()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  gap double precision;
begin
  if tg_op = 'INSERT' then
    perform public.log_activity(new.account_id, 'screen.paired', new.id, new.name, '{}'::jsonb);
    return new;
  end if;

  if new.last_seen_at is distinct from old.last_seen_at and new.last_seen_at is not null then
    if old.last_seen_at is not null and new.last_seen_at > old.last_seen_at then
      begin
      gap := extract(epoch from new.last_seen_at - old.last_seen_at);
      if gap <= 90 then
        insert into public.display_uptime_hourly as u (display_id, account_id, hour, online_seconds)
        values (new.id, new.account_id, date_trunc('hour', new.last_seen_at), round(gap)::int)
        on conflict (display_id, hour)
        do update set online_seconds = least(3600, u.online_seconds + excluded.online_seconds);
      else
        insert into public.display_offline_periods (display_id, account_id, started_at, ended_at)
        values (new.id, new.account_id, old.last_seen_at + interval '90 seconds', new.last_seen_at);
      end if;
      exception when others then
        null; -- a heartbeat must never fail because of analytics
      end;
    end if;
  end if;

  if new.content_version is distinct from old.content_version then
    perform public.log_activity(new.account_id, 'screen.content_changed', new.id, new.name,
      jsonb_build_object('mediaId', new.assigned_media_id, 'playlistId', new.assigned_playlist_id));
  end if;

  if new.status is distinct from old.status and new.status = 'revoked' then
    perform public.log_activity(new.account_id, 'screen.removed', new.id, new.name, '{}'::jsonb);
  end if;
  return new;
end $$;

drop trigger if exists displays_analytics on public.displays;
create trigger displays_analytics after insert or update on public.displays
  for each row execute function public.trg_displays_analytics();

create or replace function public.trg_playlists_analytics()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.published_at is distinct from old.published_at and new.published_at is not null then
    perform public.log_activity(new.account_id, 'playlist.published', new.id, new.name,
      jsonb_build_object('revision', new.revision));
  end if;
  return new;
end $$;
drop trigger if exists playlists_analytics on public.playlists;
create trigger playlists_analytics after update on public.playlists
  for each row execute function public.trg_playlists_analytics();

create or replace function public.trg_schedules_analytics()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_activity(new.account_id, 'schedule.created', new.id, new.name, '{}'::jsonb);
  elsif tg_op = 'UPDATE' then
    perform public.log_activity(new.account_id, 'schedule.updated', new.id, new.name,
      jsonb_build_object('enabled', new.enabled));
  elsif exists (select 1 from public.accounts where id = old.account_id) then
    perform public.log_activity(old.account_id, 'schedule.deleted', old.id, old.name, '{}'::jsonb);
  end if;
  return null;
end $$;
drop trigger if exists schedules_analytics on public.schedules;
create trigger schedules_analytics after insert or update or delete on public.schedules
  for each row execute function public.trg_schedules_analytics();

create or replace function public.trg_media_analytics()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_activity(new.account_id, 'media.uploaded', new.id, new.file_name,
      jsonb_build_object('kind', coalesce(new.kind, 'image'), 'bytes', new.size_bytes));
    return null;
  end if;
  -- Skip when the whole account is being deleted (cascade).
  if exists (select 1 from public.accounts where id = old.account_id) then
    perform public.log_activity(old.account_id, 'media.deleted', old.id, old.file_name, '{}'::jsonb);
  end if;
  return null;
end $$;
drop trigger if exists media_analytics on public.media;
create trigger media_analytics after insert or delete on public.media
  for each row execute function public.trg_media_analytics();

-- TV says it painted content version p_version. Writes only when the version changes
-- (or once an hour as a refresh), so this is about one row per content change.
create or replace function public.report_playing(p_token_hash text, p_version bigint)
returns boolean language plpgsql set search_path = '' as $$
declare d record;
begin
  select id, account_id, confirmed_version, confirmed_at into d
    from public.displays where token_hash = p_token_hash and status = 'active';
  if not found then return false; end if;
  if d.confirmed_version is distinct from p_version or d.confirmed_at is null
     or d.confirmed_at < now() - interval '1 hour' then
    update public.displays set confirmed_version = p_version, confirmed_at = now() where id = d.id;
    if d.confirmed_version is distinct from p_version then
      insert into public.playback_events (display_id, account_id, version) values (d.id, d.account_id, p_version);
    end if;
  end if;
  return true;
end $$;

create or replace function public.analytics_purge(p_days integer default 90, p_dry_run boolean default true)
returns jsonb language plpgsql set search_path = '' as $$
declare
  cutoff timestamptz := now() - make_interval(days => greatest(p_days, 7));
  r jsonb;
begin
  r := jsonb_build_object(
    'uptime', (select count(*) from public.display_uptime_hourly where hour < cutoff),
    'offline', (select count(*) from public.display_offline_periods where ended_at < cutoff),
    'playback', (select count(*) from public.playback_events where at < cutoff),
    'activity', (select count(*) from public.activity_events where at < cutoff));
  if not p_dry_run then
    delete from public.display_uptime_hourly where hour < cutoff;
    delete from public.display_offline_periods where ended_at < cutoff;
    delete from public.playback_events where at < cutoff;
    delete from public.activity_events where at < cutoff;
  end if;
  return r;
end $$;

revoke execute on function public.log_activity(uuid, text, uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.report_playing(text, bigint) from public, anon, authenticated;
revoke execute on function public.analytics_purge(integer, boolean) from public, anon, authenticated;
revoke execute on function public.trg_displays_analytics() from public, anon, authenticated;
revoke execute on function public.trg_playlists_analytics() from public, anon, authenticated;
revoke execute on function public.trg_schedules_analytics() from public, anon, authenticated;
revoke execute on function public.trg_media_analytics() from public, anon, authenticated;
grant execute on function public.report_playing(text, bigint) to service_role;
grant execute on function public.analytics_purge(integer, boolean) to service_role;

-- Online seconds per screen per local day (the screen's location time zone, UTC when none).
create or replace function public.analytics_uptime_daily(p_account uuid, p_since timestamptz)
returns table (display_id uuid, day date, online_seconds bigint)
language sql stable set search_path = '' as $$
  select u.display_id,
         (u.hour at time zone coalesce(l.timezone, 'UTC'))::date as day,
         sum(u.online_seconds)::bigint
  from public.display_uptime_hourly u
  join public.displays d on d.id = u.display_id
  left join public.locations l on l.id = d.location_id
  where u.account_id = p_account and u.hour >= date_trunc('hour', p_since)
  group by 1, 2;
$$;

-- Earliest analytics data anywhere: uptime numbers before this are unknown, not zero.
create or replace function public.analytics_coverage_start()
returns timestamptz language sql stable set search_path = '' as $$
  select least((select min(hour) from public.display_uptime_hourly),
               (select min(started_at) from public.display_offline_periods));
$$;
revoke execute on function public.analytics_uptime_daily(uuid, timestamptz) from public, anon, authenticated;
revoke execute on function public.analytics_coverage_start() from public, anon, authenticated;
grant execute on function public.analytics_uptime_daily(uuid, timestamptz) to service_role;
grant execute on function public.analytics_coverage_start() to service_role;
