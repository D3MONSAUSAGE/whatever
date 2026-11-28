-- 0039 Guest menu claims (docs/GUEST_EDITOR_PLAN.md §3.5).
-- A visitor builds a menu before having an account (kept in their browser). After sign-up or sign-in the browser
-- sends it once to POST /api/guest/claim, which saves it as a draft board. This table makes that idempotent: one row
-- per (account, browser draft id), so a retry, a reload or a second tab returns the same board instead of a copy.
-- Additive. RLS on with no policies: only the server (service role) reads or writes it. Rows go with the account.
-- Rollback: supabase/rollback/0039_guest_claims.sql

begin;

create table if not exists public.guest_claims (
  account_id uuid not null references public.accounts(id) on delete cascade,
  draft_id text not null check (draft_id ~ '^[A-Za-z0-9-]{8,64}$'),
  menu_id uuid references public.menus(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (account_id, draft_id)
);

alter table public.guest_claims enable row level security;
revoke all on public.guest_claims from public, anon, authenticated;
grant select, insert, update, delete on public.guest_claims to service_role;

commit;
