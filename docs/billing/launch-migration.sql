-- PEKKO commercial launch data migration. PREPARED, NOT RUN. Needs Francisco's approval.
-- Non-destructive: no rows deleted; displays, media, playlists untouched. Run in one transaction.
begin;
-- 0) Backup of every billing column (kept until launch is confirmed).
create table if not exists public.billing_backup_20261111 as
  select id, name, plan, trial_started_at, trial_ends_at, stripe_customer_id, stripe_subscription_id,
         subscription_status, current_period_end, cancel_at_period_end, grace_ends_at, billing_event_created, comp_note,
         now() as backed_up_at
  from public.accounts;
alter table public.billing_backup_20261111 enable row level security;
revoke all on public.billing_backup_20261111 from public, anon, authenticated;
create table if not exists public.displays_billing_backup_20261111 as
  select id, account_id, billing_active from public.displays;
alter table public.displays_billing_backup_20261111 enable row level security;
revoke all on public.displays_billing_backup_20261111 from public, anon, authenticated;

-- 1) QA orgs: drop sandbox (test-mode) Stripe ids so they follow the trial rules from their creation date
--    (most are past 14 days -> expired). Matches only the agent QA mailbox prefix.
update public.accounts set
  plan = 'trial', stripe_customer_id = null, stripe_subscription_id = null, subscription_status = null,
  current_period_end = null, cancel_at_period_end = false, grace_ends_at = null, billing_event_created = null,
  trial_started_at = coalesce(trial_started_at, created_at), trial_ends_at = coalesce(trial_started_at, created_at) + interval '14 days'
where name like 'vivalopez06-wh5rwz+%' and plan <> 'trial';

-- 2) Legacy free plans (grandfathered, comp): a normal 14-day trial starting at activation (the notice window).
--    Alternative (Francisco's call): trial_ends_at = now() to restrict immediately.
update public.accounts set
  plan = 'trial', comp_note = null, trial_started_at = now(), trial_ends_at = now() + interval '14 days'
where plan in ('grandfathered', 'comp');

-- 3) Teamtegrate (b2116f5b, Francisco's live Multi subscription) is NOT changed: it follows the paid rules
--    (5 of its 6 screens play; owner picks in Billing; restricted after Dec 11 unless the cancellation is undone).

-- Check before commit: expect 0 rows.
select id, plan from public.accounts where plan not in ('trial','starter','business','multi');
commit;
