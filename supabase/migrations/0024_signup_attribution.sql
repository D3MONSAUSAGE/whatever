-- First-touch signup attribution (UTM parameters and document.referrer).
-- Additive. Nullable, no default, no backfill, no trigger. Safe to re-run.
-- Written only by the service role, on account creation. Existing RLS and
-- grants are unchanged: owners can still select their own account row.

alter table public.accounts
  add column if not exists signup_attribution jsonb;

alter table public.accounts
  add column if not exists signup_attribution_at timestamptz;

comment on column public.accounts.signup_attribution is
  'First-touch UTMs and referrer captured at signup. Written once, never overwritten.';
comment on column public.accounts.signup_attribution_at is
  'When signup_attribution was first written.';
