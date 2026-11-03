-- M17.1/M17.2: plan, trial and screen entitlements on the existing accounts table.
-- Additive only: new nullable/defaulted columns, one idempotency table for later Stripe
-- webhooks, and new/replaced functions. Existing accounts are grandfathered (5 screens,
-- no expiry). Enforcement in the app is gated by the BILLING_ENFORCE env flag (default off).
-- Safe to re-run.

-- ---------------------------------------------------------------- columns
alter table public.accounts add column if not exists plan text;
alter table public.accounts add column if not exists trial_started_at timestamptz;
alter table public.accounts add column if not exists trial_ends_at timestamptz;
alter table public.accounts add column if not exists stripe_customer_id text;
alter table public.accounts add column if not exists stripe_subscription_id text;
alter table public.accounts add column if not exists subscription_status text;
alter table public.accounts add column if not exists current_period_end timestamptz;
alter table public.accounts add column if not exists cancel_at_period_end boolean not null default false;
alter table public.accounts add column if not exists grace_ends_at timestamptz;

-- Grandfather every account that exists before this migration. Runs before the
-- trial defaults are set, so no existing account can ever be put on a trial clock.
update public.accounts set plan = 'grandfathered' where plan is null;

-- New accounts: a 14-day trial from the server clock at creation.
alter table public.accounts alter column plan set default 'trial';
alter table public.accounts alter column plan set not null;
alter table public.accounts alter column trial_started_at set default now();
alter table public.accounts alter column trial_ends_at set default now() + interval '14 days';

do $$ begin
  alter table public.accounts add constraint accounts_plan_check
    check (plan in ('trial', 'starter', 'business', 'multi', 'grandfathered'));
exception when duplicate_object then null; end $$;

create unique index if not exists accounts_stripe_customer_idx
  on public.accounts(stripe_customer_id) where stripe_customer_id is not null;
create unique index if not exists accounts_stripe_subscription_idx
  on public.accounts(stripe_subscription_id) where stripe_subscription_id is not null;

-- Screen selection: a screen over the plan limit is paused, never deleted.
alter table public.displays add column if not exists billing_active boolean not null default true;

-- Stripe webhook idempotency (used from M17.3). Server-only.
create table if not exists public.stripe_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);
alter table public.stripe_events enable row level security;
revoke all on public.stripe_events from public, anon, authenticated;

-- Billing columns are server-written only. Owners may read their own row (existing policy);
-- the existing grant is table-wide select, which now includes these columns. Writes stay revoked.

-- ---------------------------------------------------------------- functions
create or replace function public.plan_screen_limit(p_plan text)
returns integer
language sql immutable
set search_path = ''
as $$
  select case p_plan
    when 'starter' then 1
    when 'business' then 3
    when 'multi' then 5
    when 'trial' then 5
    when 'grandfathered' then 5
    else 0 end;
$$;

-- The one canonical entitlement rule. p_now exists for tests; callers omit it.
-- States: trial, trial_grace (3 days after trial end, playback on, no new screens),
-- active, past_due (playback on until grace_ends_at), grandfathered, canceled (paid plan,
-- subscription ended or grace over), expired (trial over). Closed set.
create or replace function public.account_entitlement(p_account uuid, p_now timestamptz default now())
returns table (
  state text,
  plan text,
  screen_limit integer,
  active_screens integer,
  total_screens integer,
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  playback_ends_at timestamptz,
  subscription_status text,
  current_period_end timestamptz,
  cancel_at_period_end boolean,
  grace_ends_at timestamptz,
  playback_allowed boolean,
  can_add_screen boolean,
  server_time timestamptz
)
language plpgsql stable
set search_path = ''
as $$
declare
  a public.accounts%rowtype;
  v_state text;
  v_limit integer;
  v_active integer;
  v_total integer;
  v_trial_end timestamptz;
  v_playback_end timestamptz;
begin
  select * into a from public.accounts where id = p_account;
  if not found then return; end if;

  select count(*) filter (where d.billing_active), count(*)
    into v_active, v_total
    from public.displays d where d.account_id = p_account and d.status = 'active';

  v_trial_end := coalesce(a.trial_ends_at, coalesce(a.trial_started_at, a.created_at) + interval '14 days');

  if a.plan = 'grandfathered' then
    v_state := 'grandfathered';
  elsif a.plan = 'trial' then
    v_playback_end := v_trial_end + interval '3 days';
    if p_now < v_trial_end then v_state := 'trial';
    elsif p_now < v_playback_end then v_state := 'trial_grace';
    else v_state := 'expired'; end if;
  else
    if a.subscription_status in ('active', 'trialing') then
      v_state := 'active';
    elsif a.subscription_status = 'past_due' then
      v_playback_end := a.grace_ends_at;
      v_state := case when a.grace_ends_at is null or p_now < a.grace_ends_at then 'past_due' else 'canceled' end;
    elsif a.current_period_end is not null and p_now < a.current_period_end then
      v_state := 'active';  -- canceled/unpaid but the paid period has not ended
      v_playback_end := a.current_period_end;
    else
      v_state := 'canceled';  -- a paid plan with no live subscription
    end if;
  end if;

  v_limit := case when v_state in ('expired', 'canceled') then 0 else public.plan_screen_limit(a.plan) end;

  return query select
    v_state, a.plan, v_limit, v_active, v_total,
    case when a.plan = 'trial' then coalesce(a.trial_started_at, a.created_at) end,
    case when a.plan = 'trial' then v_trial_end end,
    v_playback_end,
    a.subscription_status, a.current_period_end, a.cancel_at_period_end, a.grace_ends_at,
    v_state not in ('expired', 'canceled'),
    v_state in ('trial', 'active', 'grandfathered') and v_active < v_limit,
    p_now;
end $$;

-- All of an account's screens that may play now (same rule as display_entitled), for lists.
create or replace function public.entitled_display_ids(p_account uuid, p_now timestamptz default now())
returns table (display_id uuid)
language plpgsql stable
set search_path = ''
as $$
declare e record;
begin
  select * into e from public.account_entitlement(p_account, p_now);
  if not found or not e.playback_allowed then return; end if;
  return query
    select r.id from (
      select d.id, row_number() over (order by d.confirmed_at desc nulls last, d.created_at desc, d.id) as rn
      from public.displays d
      where d.account_id = p_account and d.status = 'active'
        and (e.state = 'grandfathered' or d.billing_active)
    ) r where e.state = 'grandfathered' or r.rn <= e.screen_limit;
  -- Grandfathered (pre-billing) accounts: every existing screen keeps playing, even
  -- above 5; the 5-screen limit only stops new pairings.
end $$;
revoke execute on function public.entitled_display_ids(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.entitled_display_ids(uuid, timestamptz) to service_role;

-- Whether one screen may play: account entitled, screen selected, and within the limit.
-- If more screens are selected than the plan allows (owner hasn't chosen yet), the most
-- recently active ones (latest confirmed playback, then newest) keep playing. A paused
-- screen never confirms playback, so the choice is stable and doesn't flap.
create or replace function public.display_entitled(p_display uuid, p_now timestamptz default now())
returns boolean
language sql stable
set search_path = ''
as $$
  select exists (
    select 1 from public.displays d
    join lateral public.entitled_display_ids(d.account_id, p_now) x on x.display_id = d.id
    where d.id = p_display
  );
$$;

-- Pairing. Same behaviour as 0001 when p_enforce is false (the default, so older
-- callers are unchanged). With p_enforce it serializes on the account row and raises
-- 'screen_limit' when the account cannot add a screen.
drop function if exists public.claim_pairing(text, uuid, text);
create or replace function public.claim_pairing(p_code_hash text, p_account_id uuid, p_name text, p_enforce boolean default false)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_session_id uuid;
  v_location_id uuid;
  v_display_id uuid;
  v_can boolean;
begin
  if p_enforce then
    perform 1 from public.accounts where id = p_account_id for update;
    select e.can_add_screen into v_can from public.account_entitlement(p_account_id) e;
    if not coalesce(v_can, false) then
      if exists (select 1 from public.account_entitlement(p_account_id) e where e.state in ('trial', 'active', 'grandfathered')) then
        raise exception 'screen_limit' using errcode = 'P0001';
      end if;
      raise exception 'subscription_inactive' using errcode = 'P0001';
    end if;
  end if;

  select id into v_session_id from public.pairing_sessions
    where code_hash = p_code_hash and status = 'pending' and expires_at > now()
    for update skip locked
    limit 1;
  if v_session_id is null then return null; end if;

  select id into v_location_id from public.locations
    where account_id = p_account_id order by created_at limit 1;

  insert into public.displays (account_id, location_id, name)
    values (p_account_id, v_location_id, p_name)
    returning id into v_display_id;

  update public.pairing_sessions
    set status = 'claimed', display_id = v_display_id, claimed_at = now()
    where id = v_session_id;

  return v_display_id;
end $$;

-- Screen selection: keep exactly these screens counted (must fit the plan limit).
-- Returns 'ok', 'too_many' (over the plan limit) or 'not_found' (an id that isn't one of this
-- account's screens). Never deletes.
drop function if exists public.select_billing_screens(uuid, uuid[]);
create or replace function public.select_billing_screens(p_account uuid, p_display_ids uuid[])
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_limit integer;
  v_owned integer;
  v_n integer := coalesce(cardinality(p_display_ids), 0);
begin
  perform 1 from public.accounts where id = p_account for update;
  select public.plan_screen_limit(plan) into v_limit from public.accounts where id = p_account;
  if v_limit is null or v_n > v_limit then return 'too_many'; end if;
  select count(*) into v_owned from public.displays
    where account_id = p_account and status = 'active' and id = any(p_display_ids);
  if v_owned <> (select count(distinct x) from unnest(p_display_ids) x) then return 'not_found'; end if;
  update public.displays set billing_active = (id = any(p_display_ids))
    where account_id = p_account and status = 'active';
  return 'ok';
end $$;

revoke execute on function public.plan_screen_limit(text) from public, anon, authenticated;
revoke execute on function public.account_entitlement(uuid, timestamptz) from public, anon, authenticated;
revoke execute on function public.display_entitled(uuid, timestamptz) from public, anon, authenticated;
revoke execute on function public.claim_pairing(text, uuid, text, boolean) from public, anon, authenticated;
revoke execute on function public.select_billing_screens(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.plan_screen_limit(text) to service_role;
grant execute on function public.account_entitlement(uuid, timestamptz) to service_role;
grant execute on function public.display_entitled(uuid, timestamptz) to service_role;
grant execute on function public.claim_pairing(text, uuid, text, boolean) to service_role;
grant execute on function public.select_billing_screens(uuid, uuid[]) to service_role;
grant all on public.stripe_events to service_role;
