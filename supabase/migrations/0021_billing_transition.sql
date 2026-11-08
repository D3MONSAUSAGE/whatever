-- Existing-customer transition window. The column stays null until application
-- code stamps it once, and only while BILLING_ENFORCE is on. No default, no
-- backfill, and no trigger, so applying this migration does not start a clock
-- and does not change who can play. Additive. Safe to re-run.
alter table public.accounts add column if not exists billing_transition_started_at timestamptz;

-- One row per reminder already handed to the email provider. Inserts only.
-- No deletes. Service role only, same posture as stripe_events.
create table if not exists public.billing_notices (
  id text primary key,
  account_id uuid,
  kind text not null,
  created_at timestamptz not null default now()
);
alter table public.billing_notices enable row level security;
revoke all on public.billing_notices from public, anon, authenticated;
grant all on public.billing_notices to service_role;
