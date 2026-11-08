-- Forward rollback for 0022. Removes only the scheduler. Account rows, notices, and grace stay.
select cron.unschedule('pekko-billing-reminders');
drop function if exists public.dispatch_billing_reminders();
