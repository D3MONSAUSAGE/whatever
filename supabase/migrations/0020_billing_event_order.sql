-- Remembers the newest Stripe event applied to an account so an older webhook
-- cannot overwrite a renewal or a cancellation. Additive. Safe to re-run.
alter table public.accounts add column if not exists billing_event_created bigint;
