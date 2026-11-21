-- 0034 Additive billing status cache and unfinished-checkout pointers on accounts.
-- Does not alter subscription timing, prices, trial rules, BILLING_ENFORCE, or the November 11 backup tables.
-- Existing rows stay null (no payment method cached, no unfinished checkout).
-- Rollback: supabase/rollback/0034_billing_status.sql

begin;

alter table public.accounts
  add column if not exists payment_method_brand text,
  add column if not exists payment_method_last4 text,
  add column if not exists payment_method_synced_at timestamptz,
  add column if not exists checkout_session_id text,
  add column if not exists checkout_session_price text,
  add column if not exists checkout_session_expires_at timestamptz;

comment on column public.accounts.payment_method_brand is 'Cached Stripe card brand (e.g. visa). Not a source of truth; refreshed from Stripe.';
comment on column public.accounts.payment_method_last4 is 'Cached Stripe card last four digits only.';
comment on column public.accounts.payment_method_synced_at is 'When the payment-method cache was last written from Stripe.';
comment on column public.accounts.checkout_session_id is 'Open Checkout session for this org, if any. Used to resume instead of creating a duplicate.';
comment on column public.accounts.checkout_session_price is 'Price id of the stored open Checkout session.';
comment on column public.accounts.checkout_session_expires_at is 'When the stored open Checkout session expires.';

commit;
