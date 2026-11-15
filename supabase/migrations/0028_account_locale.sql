-- I18N-1: the account's web/app language. Additive; existing accounts stay English.
-- NULL = never chosen (treated as English). Lets a visitor who picked Español before signing up
-- keep it: the dashboard saves the cookie's choice once when the account has none.
-- accounts has exactly one owner (owner_user_id unique), so the preference lives here.
-- Read and written only through the service-role API (/api/me); no RLS or grant changes.
alter table public.accounts
  add column if not exists locale text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'accounts_locale_check' and conrelid = 'public.accounts'::regclass
  ) then
    alter table public.accounts
      add constraint accounts_locale_check check (locale is null or locale in ('en', 'es'));
  end if;
end $$;

comment on column public.accounts.locale is 'UI language: en or es; null = not chosen (English). Customer content is never translated.';

-- Rollback (only if needed; the app treats a missing column as English):
--   alter table public.accounts drop constraint if exists accounts_locale_check;
--   alter table public.accounts drop column if exists locale;
