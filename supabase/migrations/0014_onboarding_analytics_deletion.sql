-- M17.5/M17.6: commercial lifecycle events (in activity_events, no new vendor) and
-- self-service account deletion requests. Additive and re-runnable. Nothing existing
-- is altered or removed; no data is backfilled.

-- ---------------------------------------------------------------- commercial events
-- Kinds are prefixed "commercial." and never shown in the customer activity feed.
-- Details hold plan names and counts only: no emails, names, IPs or content.
create or replace function public.log_commercial_once(p_account uuid, p_kind text, p_detail jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.activity_events where account_id = p_account and kind = p_kind) then
    perform public.log_activity(p_account, p_kind, null, null, coalesce(p_detail, '{}'::jsonb));
  end if;
exception when others then null; -- analytics never blocks the change that triggered it
end $$;

create or replace function public.trg_accounts_commercial()
returns trigger language plpgsql security definer set search_path = '' as $$
declare paid text[] := array['starter', 'business', 'multi'];
begin
  if tg_op = 'INSERT' then
    if new.plan = 'trial' then
      perform public.log_commercial_once(new.id, 'commercial.trial_started', jsonb_build_object('trial_days', 14));
    end if;
    return new;
  end if;
  if new.plan is distinct from old.plan and new.plan = any(paid) then
    if old.plan = 'trial' or old.plan is null or old.plan = 'grandfathered' then
      perform public.log_commercial_once(new.id, 'commercial.converted',
        jsonb_build_object('from', old.plan, 'plan', new.plan,
          'screens', (select count(*) from public.displays d where d.account_id = new.id and d.status = 'active')));
    elsif old.plan = any(paid) then
      perform public.log_activity(new.id, 'commercial.plan_changed', null, null, jsonb_build_object('from', old.plan, 'plan', new.plan));
    end if;
  end if;
  if new.subscription_status = 'canceled' and old.subscription_status is distinct from 'canceled' then
    perform public.log_activity(new.id, 'commercial.canceled', null, null, jsonb_build_object('plan', new.plan));
  end if;
  return new;
exception when others then return new;
end $$;

drop trigger if exists accounts_commercial on public.accounts;
create trigger accounts_commercial after insert or update of plan, subscription_status on public.accounts
  for each row execute function public.trg_accounts_commercial();

create or replace function public.trg_displays_commercial()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.log_commercial_once(new.account_id, 'commercial.first_screen_paired',
    jsonb_build_object('plan', (select a.plan from public.accounts a where a.id = new.account_id)));
  return new;
exception when others then return new;
end $$;
drop trigger if exists displays_commercial on public.displays;
create trigger displays_commercial after insert on public.displays
  for each row execute function public.trg_displays_commercial();

create or replace function public.trg_playlists_commercial()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.published_at is not null and old.published_at is null then
    perform public.log_commercial_once(new.account_id, 'commercial.first_publish', '{}'::jsonb);
  end if;
  return new;
exception when others then return new;
end $$;
drop trigger if exists playlists_commercial on public.playlists;
create trigger playlists_commercial after update of published_at on public.playlists
  for each row execute function public.trg_playlists_commercial();

-- Time-based events (no row changes when a trial runs out). Run daily by the cron.
-- trial_expired fires once the 3-day grace is over; screens_during_trial records the
-- screen count at the end of the trial for accounts that ended it (expired or converted).
create or replace function public.record_commercial_events(p_now timestamptz default now())
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0;
begin
  for r in
    select a.id, a.plan, a.trial_ends_at from public.accounts a
    where a.trial_ends_at is not null and a.trial_ends_at <= p_now
      and not exists (select 1 from public.activity_events e where e.account_id = a.id and e.kind = 'commercial.screens_during_trial')
    limit 5000
  loop
    perform public.log_commercial_once(r.id, 'commercial.screens_during_trial', jsonb_build_object(
      'screens', (select count(*) from public.displays d where d.account_id = r.id and d.status = 'active' and d.created_at < r.trial_ends_at)));
    n := n + 1;
  end loop;
  for r in
    select a.id from public.accounts a
    where a.plan = 'trial' and a.trial_ends_at + interval '3 days' <= p_now
      and not exists (select 1 from public.activity_events e where e.account_id = a.id and e.kind = 'commercial.trial_expired')
    limit 5000
  loop
    perform public.log_commercial_once(r.id, 'commercial.trial_expired', '{}'::jsonb);
    n := n + 1;
  end loop;
  return jsonb_build_object('logged', n);
end $$;

-- Staff overview: aggregates only, never per-account rows.
create or replace function public.commercial_overview(p_days int default 30, p_now timestamptz default now())
returns jsonb language sql stable security definer set search_path = '' as $$
  with since as (select p_now - make_interval(days => greatest(1, least(p_days, 365))) as t),
  ev as (select kind, count(distinct account_id) as n from public.activity_events, since
         where kind like 'commercial.%' and at >= since.t group by kind),
  accts as (select plan, count(*) as n from public.accounts group by plan),
  trial_screens as (select (detail->>'screens')::int as s from public.activity_events, since
         where kind = 'commercial.screens_during_trial' and at >= since.t)
  select jsonb_build_object(
    'days', greatest(1, least(p_days, 365)),
    'generated_at', p_now,
    'accounts_by_plan', coalesce((select jsonb_object_agg(coalesce(plan, 'none'), n) from accts), '{}'::jsonb),
    'events', coalesce((select jsonb_object_agg(replace(kind, 'commercial.', ''), n) from ev), '{}'::jsonb),
    'screens_during_trial', jsonb_build_object(
      'accounts', (select count(*) from trial_screens),
      'avg', (select round(avg(s)::numeric, 2) from trial_screens),
      'zero', (select count(*) from trial_screens where s = 0)));
$$;

-- ---------------------------------------------------------------- account deletion
create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,         -- no FK: the record outlives the account it describes
  user_id uuid not null,
  requested_at timestamptz not null default now(),
  scheduled_for timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'canceled', 'processing', 'completed', 'failed')),
  completed_at timestamptz,
  error text
);
create unique index if not exists account_deletion_one_pending on public.account_deletion_requests(account_id) where status in ('pending', 'processing');
alter table public.account_deletion_requests enable row level security;
revoke all on public.account_deletion_requests from anon, authenticated;

-- Owner-only request. Raises unless p_user owns p_account.
create or replace function public.request_account_deletion(p_account uuid, p_user uuid, p_delay interval default interval '7 days')
returns uuid language plpgsql security definer set search_path = '' as $$
declare rid uuid;
begin
  if not exists (select 1 from public.accounts where id = p_account and owner_user_id = p_user) then
    raise exception 'not_owner';
  end if;
  select id into rid from public.account_deletion_requests where account_id = p_account and status = 'pending';
  if rid is not null then return rid; end if;
  insert into public.account_deletion_requests (account_id, user_id, scheduled_for)
  values (p_account, p_user, now() + p_delay) returning id into rid;
  return rid;
end $$;

-- Claims due requests for the job (status -> processing).
create or replace function public.claim_due_account_deletions(p_limit int default 10, p_now timestamptz default now())
returns table (id uuid, account_id uuid, user_id uuid) language sql security definer set search_path = '' as $$
  update public.account_deletion_requests r set status = 'processing'
  where r.id in (select x.id from public.account_deletion_requests x
                 where x.status = 'pending' and x.scheduled_for <= p_now
                 order by x.scheduled_for limit greatest(1, least(p_limit, 50)) for update skip locked)
  returning r.id, r.account_id, r.user_id;
$$;

do $$ declare f text; begin
  foreach f in array array[
    'public.log_commercial_once(uuid, text, jsonb)', 'public.record_commercial_events(timestamptz)',
    'public.commercial_overview(int, timestamptz)', 'public.request_account_deletion(uuid, uuid, interval)',
    'public.claim_due_account_deletions(int, timestamptz)',
    'public.trg_accounts_commercial()', 'public.trg_displays_commercial()', 'public.trg_playlists_commercial()'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
