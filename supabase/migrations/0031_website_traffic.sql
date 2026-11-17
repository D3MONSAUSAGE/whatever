-- 0031 Website traffic (developer console "Website traffic" tab).
-- Cookieless, first-party, aggregate page-view counting for the PUBLIC MARKETING PAGES only
-- (/, /features, /pricing, /faq, /support, /contact and their /es versions). Additive; touches no
-- existing table, account, subscription or billing row. Safe to re-run.
--
-- Privacy design:
--   * No IP address, user agent, cookie, account or user id is ever stored.
--   * Unique visitors: the server hashes (daily random salt + IP + user agent) in memory. Only the hash is
--     sent here, and it is kept only for the day it was made: finished days are rolled up into a plain count
--     and their hashes deleted. Salts are random (not derived from any secret) and deleted after two days, so
--     a stored hash can never be recomputed or linked across days.
--   * Everything else is a daily counter per page and traffic source (channel, referring host, utm_source).
--   * Rows older than 400 days are deleted.
-- Only the service role can read or write (RLS on, no policies, no grants to anon/authenticated).
-- Rollback: supabase/rollback/0031_website_traffic.sql

begin;

create table if not exists public.traffic_salts (
  day date primary key,
  salt text not null check (char_length(salt) >= 32)
);

create table if not exists public.traffic_visitors (
  day date not null,
  visitor_hash text not null check (visitor_hash ~ '^[0-9a-f]{32,64}$'),
  primary key (day, visitor_hash)
);

create table if not exists public.traffic_unique_daily (
  day date primary key,
  visitors integer not null check (visitors >= 0)
);

-- One counter row per day, page and source. channel/referrer_host/utm_source are '' for in-site navigation
-- (only a landing, the first page of a visit, has a source).
create table if not exists public.traffic_daily (
  day date not null,
  path text not null check (path ~ '^/(es(/(features|pricing|faq|support|contact))?|(features|pricing|faq|support|contact))?$'),
  channel text not null default '' check (channel in ('', 'meta', 'google_ads', 'google_organic', 'referral', 'campaign_other', 'direct')),
  referrer_host text not null default '' check (referrer_host ~ '^[a-z0-9.-]{0,100}$'),
  utm_source text not null default '' check (utm_source ~ '^[a-z0-9._-]{0,60}$'),
  page_views integer not null default 0 check (page_views >= 0),
  landings integer not null default 0 check (landings >= 0),
  primary key (day, path, channel, referrer_host, utm_source)
);

alter table public.traffic_salts enable row level security;
alter table public.traffic_visitors enable row level security;
alter table public.traffic_unique_daily enable row level security;
alter table public.traffic_daily enable row level security;
revoke all on public.traffic_salts from public, anon, authenticated;
revoke all on public.traffic_visitors from public, anon, authenticated;
revoke all on public.traffic_unique_daily from public, anon, authenticated;
revoke all on public.traffic_daily from public, anon, authenticated;

-- Same backstop as dev_analytics_snapshot: only the service-role key (or a direct owner SQL session).
create or replace function public.traffic_caller_is_service()
returns boolean
language plpgsql stable
set search_path = ''
as $$
declare
  v_claims text := nullif(current_setting('request.jwt.claims', true), '');
  v_role text := coalesce(v_claims::jsonb->>'role', nullif(current_setting('request.jwt.claim.role', true), ''));
begin
  return coalesce(v_role = 'service_role' or (v_role is null and session_user in ('postgres', 'supabase_admin')), false);
end $$;

-- Today's random salt (created on first use). Salts older than yesterday are deleted on every call.
create or replace function public.traffic_salt(p_day date)
returns text
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_salt text;
begin
  if not public.traffic_caller_is_service() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  delete from public.traffic_salts where day < p_day - 1;
  insert into public.traffic_salts (day, salt)
  values (p_day, replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
  on conflict (day) do nothing;
  select salt into v_salt from public.traffic_salts where day = p_day;
  return v_salt;
end $$;

-- Records one page view. p_landing = first page of a visit (only then are the source fields kept).
create or replace function public.traffic_record(
  p_day date, p_visitor_hash text, p_path text, p_landing boolean,
  p_channel text, p_referrer_host text, p_utm_source text
)
returns void
language plpgsql volatile security definer
set search_path = ''
as $$
begin
  if not public.traffic_caller_is_service() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  -- Close finished days: roll their hashes into a plain count and delete them. A day with a
  -- traffic_unique_daily row is closed for good. DELETE ... RETURNING is atomic, so two concurrent
  -- rollups can never count the same hash twice. The exclusive lock waits for any visitor write
  -- still in progress (they hold the shared lock below), so a hash being written as its day closes is
  -- rolled up exactly once.
  if exists (select 1 from public.traffic_visitors where day < p_day) then
    perform pg_advisory_xact_lock(31, 1);
    with gone as (
      delete from public.traffic_visitors where day < p_day returning day
    )
    insert into public.traffic_unique_daily (day, visitors)
    select day, count(*)::int from gone group by day
    on conflict (day) do update set visitors = public.traffic_unique_daily.visitors + excluded.visitors;
  end if;

  -- Count the visitor only while the day is open. A late request for a day that is already closed (sent
  -- just before midnight Pacific, or from a server whose clock is slightly behind) still counts as a page
  -- view below, but not as a visitor: its day's hashes are gone, so a repeat visitor could not be told
  -- apart and would be counted twice. No hash is stored for a closed day.
  perform pg_advisory_xact_lock_shared(31, 1);
  if not exists (select 1 from public.traffic_unique_daily where day = p_day) then
    insert into public.traffic_visitors (day, visitor_hash) values (p_day, p_visitor_hash)
    on conflict do nothing;
  end if;

  insert into public.traffic_daily (day, path, channel, referrer_host, utm_source, page_views, landings)
  values (
    p_day, p_path,
    case when p_landing then coalesce(p_channel, 'direct') else '' end,
    case when p_landing then coalesce(p_referrer_host, '') else '' end,
    case when p_landing then coalesce(p_utm_source, '') else '' end,
    1, case when p_landing then 1 else 0 end
  )
  on conflict (day, path, channel, referrer_host, utm_source)
  do update set page_views = public.traffic_daily.page_views + 1,
                landings = public.traffic_daily.landings + excluded.landings;

  -- Retention: 400 days.
  delete from public.traffic_daily where day < p_day - 400;
  delete from public.traffic_unique_daily where day < p_day - 400;
end $$;

-- Aggregates for the developer console. Raises unless the caller is the service role AND p_actor is an
-- allowlisted developer (developer_users), like dev_analytics_snapshot.
create or replace function public.dev_traffic_snapshot(p_actor uuid, p_from date, p_to date)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_to date := coalesce(p_to, current_date);
  v_from date := greatest(coalesce(p_from, v_to - 30), v_to - 400);
begin
  if not public.traffic_caller_is_service() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if not public.is_developer(p_actor) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'generated_at', now(),
    'from', v_from,
    'to', v_to,
    'first_day', (select min(day) from public.traffic_daily),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object('day', d.day, 'visitors', d.visitors, 'page_views', d.page_views, 'landings', d.landings) order by d.day)
      from (
        select g.day,
               coalesce((select u.visitors from public.traffic_unique_daily u where u.day = g.day), 0)
                 + (select count(*)::int from public.traffic_visitors v where v.day = g.day) as visitors,
               coalesce((select sum(t.page_views)::int from public.traffic_daily t where t.day = g.day), 0) as page_views,
               coalesce((select sum(t.landings)::int from public.traffic_daily t where t.day = g.day), 0) as landings
        from (select gs::date as day from generate_series(v_from::timestamp, v_to::timestamp, interval '1 day') as gs) g
      ) d
    ), '[]'::jsonb),
    'pages', coalesce((
      select jsonb_agg(jsonb_build_object('path', path, 'page_views', page_views, 'landings', landings) order by landings desc, page_views desc, path)
      from (
        select path, sum(page_views)::int as page_views, sum(landings)::int as landings
        from public.traffic_daily where day between v_from and v_to group by path
      ) p
    ), '[]'::jsonb),
    'sources', coalesce((
      select jsonb_agg(jsonb_build_object('channel', channel, 'referrer_host', referrer_host, 'utm_source', utm_source, 'landings', landings) order by landings desc)
      from (
        select channel, referrer_host, utm_source, sum(landings)::int as landings
        from public.traffic_daily where day between v_from and v_to and channel <> '' group by channel, referrer_host, utm_source
      ) s
    ), '[]'::jsonb)
  );
end $$;

revoke execute on function public.traffic_caller_is_service() from public, anon, authenticated;
revoke execute on function public.traffic_salt(date) from public, anon, authenticated;
revoke execute on function public.traffic_record(date, text, text, boolean, text, text, text) from public, anon, authenticated;
revoke execute on function public.dev_traffic_snapshot(uuid, date, date) from public, anon, authenticated;
grant execute on function public.traffic_caller_is_service() to service_role;
grant execute on function public.traffic_salt(date) to service_role;
grant execute on function public.traffic_record(date, text, text, boolean, text, text, text) to service_role;
grant execute on function public.dev_traffic_snapshot(uuid, date, date) to service_role;

commit;
