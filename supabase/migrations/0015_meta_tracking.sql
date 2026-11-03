-- Meta Pixel + Conversions API (development only). Additive: two new tables + one purge function.
-- Nothing on profiles/accounts is changed. Both tables are service-role only (RLS on, no policies).
-- Rollback: drop table public.meta_event_log, public.marketing_consent; drop function public.marketing_purge.
-- Stays inert until META_PIXEL_ENABLED / META_CAPI_ENABLED are set to "true" (default off).

-- One row per browser (visitor_id = first-party httpOnly cookie). Attribution identifiers live ONLY here,
-- and only while status = 'granted'. Withdrawal nulls them in the same statement.
create table if not exists public.marketing_consent (
  visitor_id uuid primary key,
  user_id uuid references auth.users(id) on delete cascade,      -- account deletion removes the row
  status text not null check (status in ('granted', 'withdrawn')),
  consent_version text not null check (char_length(consent_version) <= 20),
  granted_at timestamptz,
  withdrawn_at timestamptz,
  last_activity_at timestamptz not null default now(),
  fbp text check (fbp is null or char_length(fbp) <= 200),
  fbc text check (fbc is null or char_length(fbc) <= 300),
  fbclid text check (fbclid is null or char_length(fbclid) <= 500),
  created_at timestamptz not null default now(),
  constraint marketing_consent_ids_only_when_granted
    check (status = 'granted' or (fbp is null and fbc is null and fbclid is null))
);
create index if not exists marketing_consent_user on public.marketing_consent (user_id);
create index if not exists marketing_consent_activity on public.marketing_consent (last_activity_at);
alter table public.marketing_consent enable row level security;
revoke all on public.marketing_consent from anon, authenticated;

-- Idempotency / dedupe log: one row per (event_name, event_id). Insert-first claims the send, so
-- webhook retries and repeat page views can't resend. No personal data is stored here.
create table if not exists public.meta_event_log (
  id bigint generated always as identity primary key,
  event_name text not null check (char_length(event_name) <= 40),
  event_id text not null check (char_length(event_id) between 8 and 100),
  action_source text not null check (action_source in ('website', 'system_generated')),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0,
  last_error text check (last_error is null or char_length(last_error) <= 500),
  test_mode boolean not null default false,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (event_name, event_id)
);
create index if not exists meta_event_log_created on public.meta_event_log (created_at);
alter table public.meta_event_log enable row level security;
revoke all on public.meta_event_log from anon, authenticated;

-- Retention: consent rows inactive > p_months (default 13) are deleted; send-log rows older than 13 months too.
create or replace function public.marketing_purge(p_months integer default 13, p_dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare cutoff timestamptz := now() - make_interval(months => greatest(coalesce(p_months, 13), 1)); c int; l int;
begin
  if coalesce(p_dry_run, true) then
    select count(*) into c from public.marketing_consent where last_activity_at < cutoff;
    select count(*) into l from public.meta_event_log where created_at < cutoff;
  else
    delete from public.marketing_consent where last_activity_at < cutoff; get diagnostics c = row_count;
    delete from public.meta_event_log where created_at < cutoff; get diagnostics l = row_count;
  end if;
  return jsonb_build_object('consent_rows', c, 'log_rows', l);
end $$;
revoke all on function public.marketing_purge(integer, boolean) from public, anon, authenticated;
grant execute on function public.marketing_purge(integer, boolean) to service_role;
