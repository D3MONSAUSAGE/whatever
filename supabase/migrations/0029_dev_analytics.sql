-- DA-1 (t337u Phase 1): private developer analytics, read-only over existing data.
-- Additive only: two new server-only tables and three new functions. No existing table, column,
-- trigger, policy, grant, purge or billing rule is changed. No data is written by this migration
-- (seeds live in supabase/manual/0029_dev_analytics_seed.sql and are applied by hand, if approved).
-- Safe to re-run. Rollback: supabase/rollback/0029_dev_analytics.sql.
--
-- Privacy: the snapshot function returns only ids, timestamps, plan/status values, counts, an
-- email DOMAIN (never the local part), a "+alias" flag and the first-touch UTM source/medium/campaign
-- and referrer HOST. No names, file names, menu/playlist content, subject_name/detail, IPs or tokens.
-- The server reduces it to aggregates before anything reaches a browser.

-- ---------------------------------------------------------------- tables
-- Who may open /developer/analytics. Keyed by user id (emails can change). Service role only.
create table if not exists public.developer_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'developer' check (role in ('developer', 'admin')),
  note text check (note is null or char_length(note) <= 200),
  added_at timestamptz not null default now()
);

-- Accounts left out of customer metrics by default (internal, QA, demo, reviewer, test).
-- Deleting the account removes its row (cascade).
create table if not exists public.analytics_exclusions (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  reason text not null check (reason in ('internal', 'qa', 'demo', 'reviewer', 'test')),
  note text check (note is null or char_length(note) <= 200),
  added_at timestamptz not null default now()
);

alter table public.developer_users enable row level security;
alter table public.analytics_exclusions enable row level security;
-- No policies: browsers (anon, authenticated) can never read or write these.
revoke all on public.developer_users from public, anon, authenticated;
revoke all on public.analytics_exclusions from public, anon, authenticated;
grant select on public.developer_users to service_role;
grant select on public.analytics_exclusions to service_role;

-- ---------------------------------------------------------------- functions
create or replace function public.is_developer(p_user uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select p_user is not null and exists (select 1 from public.developer_users d where d.user_id = p_user);
$$;

-- Referrer host only (scheme, path, query and fragment dropped). Null when it isn't an http(s) URL.
create or replace function public.dev_analytics_referrer_host(p_referrer text)
returns text
language sql immutable
set search_path = ''
as $$
  select lower(substring(p_referrer from '^[hH][tT][tT][pP][sS]?://([^/:?#@]+)'));
$$;

-- Minimal per-account rows for the developer dashboard. Raises unless p_actor is a developer, so a
-- route that forgot its own check still gets nothing. Activity and screen-days are bounded by p_since.
create or replace function public.dev_analytics_snapshot(p_actor uuid, p_since timestamptz)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_since timestamptz := greatest(coalesce(p_since, now() - interval '90 days'), now() - interval '400 days');
begin
  if not public.is_developer(p_actor) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'generated_at', now(),
    'since', v_since,
    'accounts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id,
        'created_at', a.created_at,
        'plan', a.plan,
        'trial_started_at', a.trial_started_at,
        'trial_ends_at', a.trial_ends_at,
        'subscription_status', a.subscription_status,
        'comp', (a.plan = 'comp' or a.comp_note is not null),
        'user_created_at', u.created_at,
        'user_confirmed', u.email_confirmed_at is not null,
        'email_domain', lower(split_part(coalesce(u.email, ''), '@', 2)),
        'plus_alias', position('+' in split_part(coalesce(u.email, ''), '@', 1)) > 0,
        'excluded_reason', x.reason,
        'utm_source', left(a.signup_attribution->>'utm_source', 80),
        'utm_medium', left(a.signup_attribution->>'utm_medium', 80),
        'utm_campaign', left(a.signup_attribution->>'utm_campaign', 80),
        'referrer_host', public.dev_analytics_referrer_host(a.signup_attribution->>'referrer'),
        'attribution_at', a.signup_attribution_at
      ) order by a.created_at)
      from public.accounts a
      join auth.users u on u.id = a.owner_user_id
      left join public.analytics_exclusions x on x.account_id = a.id
    ), '[]'::jsonb),
    -- Signed-up users who never reached an authenticated API call (no account row yet).
    'orphan_users', coalesce((
      select jsonb_agg(jsonb_build_object(
        'created_at', u.created_at,
        'confirmed', u.email_confirmed_at is not null,
        'email_domain', lower(split_part(coalesce(u.email, ''), '@', 2)),
        'plus_alias', position('+' in split_part(coalesce(u.email, ''), '@', 1)) > 0))
      from auth.users u
      where not exists (select 1 from public.accounts a where a.owner_user_id = u.id)
    ), '[]'::jsonb),
    'displays', coalesce((
      select jsonb_agg(jsonb_build_object(
        'account_id', d.account_id,
        'created_at', d.created_at,
        'status', d.status,
        'last_seen_at', d.last_seen_at,
        'ever_confirmed', d.confirmed_at is not null))
      from public.displays d
    ), '[]'::jsonb),
    'first_playback', coalesce((
      select jsonb_agg(jsonb_build_object('account_id', p.account_id, 'at', p.first_at))
      from (select account_id, min(at) as first_at from public.playback_events group by account_id) p
    ), '[]'::jsonb),
    'first_playlist', coalesce((
      select jsonb_agg(jsonb_build_object('account_id', p.account_id, 'at', p.first_at))
      from (select account_id, min(created_at) as first_at from public.playlists group by account_id) p
    ), '[]'::jsonb),
    -- Kinds only. subject_name and detail (customer names, ids of content) are never read.
    'activity', coalesce((
      select jsonb_agg(jsonb_build_object('account_id', e.account_id, 'at', e.at, 'kind', e.kind))
      from public.activity_events e
      where e.at >= v_since
        and e.kind in ('media.uploaded', 'playlist.published', 'screen.paired', 'screen.content_changed',
                       'schedule.created', 'schedule.updated', 'schedule.deleted')
    ), '[]'::jsonb),
    -- One row per account per Pacific day with any screen online.
    'screen_days', coalesce((
      select jsonb_agg(jsonb_build_object('account_id', s.account_id, 'day', s.day))
      from (select distinct u.account_id, (u.hour at time zone 'America/Los_Angeles')::date as day
            from public.display_uptime_hourly u
            where u.hour >= date_trunc('hour', v_since) and u.online_seconds > 0) s
    ), '[]'::jsonb),
    'coverage', jsonb_build_object(
      'activity_from', (select min(at) from public.activity_events),
      'uptime_from', (select min(hour) from public.display_uptime_hourly),
      'playback_from', (select min(at) from public.playback_events))
  );
end $$;

revoke execute on function public.is_developer(uuid) from public, anon, authenticated;
revoke execute on function public.dev_analytics_referrer_host(text) from public, anon, authenticated;
revoke execute on function public.dev_analytics_snapshot(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.is_developer(uuid) to service_role;
grant execute on function public.dev_analytics_referrer_host(text) to service_role;
grant execute on function public.dev_analytics_snapshot(uuid, timestamptz) to service_role;
