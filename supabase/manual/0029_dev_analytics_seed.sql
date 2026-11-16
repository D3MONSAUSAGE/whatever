-- DA-1 seed for 0029_dev_analytics.sql. NOT a migration and NOT applied automatically.
-- Run by hand in the Supabase SQL editor only after Francisco approves it. Inserts only; re-runnable
-- (on conflict do nothing). Writes no customer data: only the allowlist and the exclusion list.

-- 1) Developer allowlist: Francisco Lopez (owner of the DreamDesigns account).
insert into public.developer_users (user_id, role, note)
select u.id, 'admin', 'Francisco Lopez' from auth.users u
where u.id = 'e00a7307-d3dd-4d9f-ae59-59b84963a392'
on conflict (user_id) do nothing;

-- 2) Exclusions from customer metrics.
-- Google Play reviewer (comp).
insert into public.analytics_exclusions (account_id, reason, note)
select a.id, 'reviewer', 'Google Play reviewer (comp)' from public.accounts a
where a.id = 'f49a1edf-cb36-44eb-a562-d908db50a14d'
on conflict (account_id) do nothing;

-- Teamtegrate internal account (holds the one live test subscription).
insert into public.analytics_exclusions (account_id, reason, note)
select a.id, 'internal', 'Teamtegrate internal' from public.accounts a
where a.id = 'b2116f5b-8648-4284-9f21-0615f1129e04'
on conflict (account_id) do nothing;

-- Every account owned by an @mail.grokbot.com address (QA personas, Harbor Street QA, +aliases).
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

-- The 7 gmail.com / hotmail.com / guanatostacos.com accounts (including DreamDesigns, Guanatos Tacos and
-- GCorp) are REAL CUSTOMER accounts (Francisco, t340u). Never add them here. Francisco's developer_users
-- row above only grants dashboard access; it does not exclude his DreamDesigns account from customer metrics.
--
-- To exclude another internal account later, one line (copy the id from the dashboard's review list):
--   insert into public.analytics_exclusions (account_id, reason) values ('<account-id>', 'internal') on conflict do nothing;
-- To un-exclude:
--   delete from public.analytics_exclusions where account_id = '<account-id>';
