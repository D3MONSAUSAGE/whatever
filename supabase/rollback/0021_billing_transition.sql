-- Forward rollback for 0021. Drops only the transition timestamp.
-- Plans, screens, content, grace, and stripe_events stay.
drop table if exists public.billing_notices;
alter table public.accounts drop column if exists billing_transition_started_at;
