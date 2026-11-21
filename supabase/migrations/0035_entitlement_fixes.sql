-- 0035 Additive entitlement consistency & Option B pre-charge cancellation fixes.
-- 1. Database status lag: in account_entitlement(), canceled after failed payment caps
--    playback at least(grace_ends_at, current_period_end), matching commercialEntitlement().
--    Non-canceled restricted statuses (unpaid, incomplete, incomplete_expired, paused, null)
--    do not fall through to active playback even if current_period_end is in the future.
-- 2. Option B pre-charge cancellations: tracks trial_canceled_before_charge so a scheduled
--    Stripe trial canceled before its first charge keeps the original 14-day trial window
--    and 3-day playback-only grace (trial_grace), then expires.
-- Additive/non-destructive; keeps the 16-column account_entitlement signature and Nov 11 backup tables untouched.
-- Rollback: supabase/rollback/0035_entitlement_fixes.sql

begin;

alter table public.accounts
  add column if not exists trial_canceled_before_charge boolean not null default false;

comment on column public.accounts.trial_canceled_before_charge is
  'True when an Option B Stripe-trialing subscription was canceled before its first paid cycle, preserving the 3-day trial_grace window after trial_ends_at.';

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
  v_trial_start timestamptz;
  v_trial_end timestamptz;
  v_playback_end timestamptz;
  v_expose_trial boolean;
begin
  select * into a from public.accounts where id = p_account;
  if not found then return; end if;

  select count(*) filter (where d.billing_active), count(*)
    into v_active, v_total
    from public.displays d where d.account_id = p_account and d.status = 'active';

  v_trial_start := coalesce(a.trial_started_at, a.created_at);
  v_trial_end := case
    when a.trial_started_at is not null then least(coalesce(a.trial_ends_at, v_trial_start + interval '14 days'), v_trial_start + interval '14 days')
    else coalesce(a.trial_ends_at, a.created_at + interval '14 days')
  end;
  v_expose_trial := a.plan = 'trial' or (a.trial_canceled_before_charge and a.subscription_status = 'canceled');

  if a.plan = 'grandfathered' then
    v_state := 'grandfathered';
  elsif a.plan = 'comp' then
    v_state := 'active';  -- complimentary (e.g. store reviewer), no expiry, no Stripe
  elsif a.plan = 'trial' then
    v_playback_end := v_trial_end + interval '3 days';
    if p_now < v_trial_end then v_state := 'trial';
    elsif p_now < v_playback_end then v_state := 'trial_grace';
    else
      v_state := 'expired';
      v_playback_end := null;
    end if;
  else
    if a.subscription_status in ('active', 'trialing') then
      v_state := 'active';
    elsif a.subscription_status = 'past_due' then
      v_playback_end := a.grace_ends_at;
      v_state := case when a.grace_ends_at is null or p_now < a.grace_ends_at then 'past_due' else 'canceled' end;
    elsif a.subscription_status = 'canceled' and a.trial_canceled_before_charge then
      v_playback_end := v_trial_end + interval '3 days';
      if p_now < v_trial_end then v_state := 'trial';
      elsif p_now < v_playback_end then v_state := 'trial_grace';
      else
        v_state := 'expired';
        v_playback_end := null;
      end if;
    elsif a.subscription_status = 'canceled' then
      v_playback_end := case
        when a.grace_ends_at is null then a.current_period_end
        when a.current_period_end is null then a.grace_ends_at
        else least(a.grace_ends_at, a.current_period_end)
      end;
      if v_playback_end is not null and p_now < v_playback_end then
        v_state := 'active';
      else
        v_state := 'canceled';
        v_playback_end := null;
      end if;
    else
      v_state := 'canceled';  -- unpaid, incomplete, incomplete_expired, paused, or missing status
    end if;
  end if;

  v_limit := case
    when v_state in ('expired', 'canceled') then 0
    when v_state in ('trial', 'trial_grace') then 5
    else public.plan_screen_limit(a.plan)
  end;

  return query select
    v_state, a.plan, v_limit, v_active, v_total,
    case when v_expose_trial then v_trial_start end,
    case when v_expose_trial then v_trial_end end,
    v_playback_end,
    a.subscription_status, a.current_period_end, a.cancel_at_period_end, a.grace_ends_at,
    v_state not in ('expired', 'canceled'),
    v_state in ('trial', 'active', 'grandfathered') and v_active < v_limit,
    p_now;
end $$;

revoke execute on function public.account_entitlement(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.account_entitlement(uuid, timestamptz) to service_role;

commit;
