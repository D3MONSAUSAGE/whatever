-- Restores the billing columns captured by prod-migration.sql. Content was never changed.
begin;
update public.accounts a set plan = b.plan, trial_started_at = b.trial_started_at, trial_ends_at = b.trial_ends_at,
  stripe_customer_id = b.stripe_customer_id, stripe_subscription_id = b.stripe_subscription_id,
  subscription_status = b.subscription_status, current_period_end = b.current_period_end,
  cancel_at_period_end = b.cancel_at_period_end, grace_ends_at = b.grace_ends_at,
  billing_event_created = b.billing_event_created, comp_note = b.comp_note
from public.billing_backup_20261111 b where b.id = a.id;
update public.displays d set billing_active = b.billing_active from public.displays_billing_backup_20261111 b where b.id = d.id;
commit;
