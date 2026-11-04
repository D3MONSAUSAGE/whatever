-- M17: complimentary ("comp") plan for designated orgs such as the Google Play reviewer.
-- Additive: widens the plan check, adds plan 'comp' (5 screens, never expires, reported as
-- state 'active' so the API's closed state set is unchanged). Settable only by service role
-- via set_account_comp(). Safe to re-run.

alter table public.accounts add column if not exists comp_note text;
alter table public.accounts drop constraint if exists accounts_plan_check;
alter table public.accounts add constraint accounts_plan_check
  check (plan in ('trial', 'starter', 'business', 'multi', 'grandfathered', 'comp'));

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
    when 'comp' then 5
    else 0 end;
$$;

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
    v_state := 'active';  -- complimentary (e.g. store reviewer), no expiry, no Stripe
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

-- Service role only. p_on=true comps the account; p_on=false ends the comp and starts a
-- fresh 14-day trial from now (content is never touched).
create or replace function public.set_account_comp(p_account uuid, p_on boolean, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_on then
    update public.accounts set plan = 'comp', comp_note = p_note where id = p_account;
  else
    update public.accounts set plan = 'trial', comp_note = null, trial_started_at = now(),
      trial_ends_at = now() + interval '14 days' where id = p_account and plan = 'comp';
  end if;
  if not found then raise exception 'not_found'; end if;
end $$;
revoke execute on function public.set_account_comp(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.set_account_comp(uuid, boolean, text) to service_role;
revoke execute on function public.account_entitlement(uuid, timestamptz) from public, anon, authenticated;
revoke execute on function public.plan_screen_limit(text) from public, anon, authenticated;
grant execute on function public.plan_screen_limit(text) to service_role;
grant execute on function public.account_entitlement(uuid, timestamptz) to service_role;
