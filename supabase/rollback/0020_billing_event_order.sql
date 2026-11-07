-- Forward rollback for 0020. Drops only the ordering column. Plans, Stripe ids,
-- grace, and stripe_events stay so a redeploy of this branch can resume.
alter table public.accounts drop column if exists billing_event_created;
