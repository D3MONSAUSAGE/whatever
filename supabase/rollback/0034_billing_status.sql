-- Rollback 0034. Drops only the additive billing-status columns on accounts.
-- Does not touch subscriptions, media, or the November 11 backup tables.

begin;

alter table public.accounts
  drop column if exists payment_method_brand,
  drop column if exists payment_method_last4,
  drop column if exists payment_method_synced_at,
  drop column if exists checkout_session_id,
  drop column if exists checkout_session_price,
  drop column if exists checkout_session_expires_at;

commit;
