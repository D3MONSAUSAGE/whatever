-- DA-1 seed TEMPLATE for 0029_dev_analytics.sql. NOT a migration and NOT applied automatically.
-- Real ids are never committed. Run by hand with psql variables after approval, e.g.:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -v dev_user_id=<auth user uuid> \
--     -v reviewer_account_id=<reviewer account uuid> \
--     -v internal_account_id=<internal account uuid> \
--     -f supabase/manual/0029_dev_analytics_seed.template.sql
-- Inserts only; re-runnable (on conflict do nothing). Writes no customer data.
-- Never add real customer accounts here: developer access and customer exclusion are separate.

begin;

-- 1) Developer allowlist (dashboard access only; it does not exclude that user's own account).
insert into public.developer_users (user_id, role, note)
select u.id, 'admin', 'developer' from auth.users u
where u.id = :'dev_user_id'::uuid
on conflict (user_id) do nothing;

-- 2) Exclusions from customer metrics.
insert into public.analytics_exclusions (account_id, reason, note)
select a.id, 'reviewer', 'store reviewer (comp)' from public.accounts a
where a.id = :'reviewer_account_id'::uuid
on conflict (account_id) do nothing;

insert into public.analytics_exclusions (account_id, reason, note)
select a.id, 'internal', 'internal account' from public.accounts a
where a.id = :'internal_account_id'::uuid
on conflict (account_id) do nothing;

-- Every account owned by an @mail.grokbot.com address (QA personas and +aliases).
insert into public.analytics_exclusions (account_id, reason, note)
select a.id, 'qa', 'mail.grokbot.com owner'
from public.accounts a join auth.users u on u.id = a.owner_user_id
where lower(split_part(u.email, '@', 2)) = 'mail.grokbot.com'
on conflict (account_id) do nothing;

-- example.com test accounts.
insert into public.analytics_exclusions (account_id, reason, note)
select a.id, 'test', 'example.com owner'
from public.accounts a join auth.users u on u.id = a.owner_user_id
where lower(split_part(u.email, '@', 2)) = 'example.com'
on conflict (account_id) do nothing;

-- Any complimentary account.
insert into public.analytics_exclusions (account_id, reason, note)
select a.id, 'reviewer', 'comp plan'
from public.accounts a
where a.plan = 'comp' or a.comp_note is not null
on conflict (account_id) do nothing;

commit;

-- To exclude another internal account later (copy the id from the dashboard's review list):
--   insert into public.analytics_exclusions (account_id, reason) values ('<account-id>', 'internal') on conflict do nothing;
-- To un-exclude:
--   delete from public.analytics_exclusions where account_id = '<account-id>';
