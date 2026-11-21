-- Rollback 0035. Restores account_entitlement() from 0015 and drops trial_canceled_before_charge.
-- Non-destructive to customer accounts, subscriptions, media, displays, or November 11 backup tables.

begin;

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
  elsif a.plan = 'comp' then
    v_state := 'active';
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
      v_state := 'active';
      v_playback_end := a.current_period_end;
    else
      v_state := 'canceled';
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

revoke execute on function public.account_entitlement(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.account_entitlement(uuid, timestamptz) to service_role;

alter table public.accounts
  drop column if exists trial_canceled_before_charge;

commit;
