-- Rollback of 0039. Boards already claimed stay in their accounts as ordinary boards.
begin;
drop table if exists public.guest_claims;
commit;
