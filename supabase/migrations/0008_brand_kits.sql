-- M11: customer branding for menu boards. Additive only: one new table.
create table if not exists public.brand_kits (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  logo_media_id uuid references public.media(id) on delete set null,
  primary_color text not null default '#0066ff' check (primary_color ~ '^#[0-9a-f]{6}$'),
  accent_color text not null default '#ffd34d' check (accent_color ~ '^#[0-9a-f]{6}$'),
  updated_at timestamptz not null default now()
);
-- Server-only (like menus and alerts): RLS on, no policies.
alter table public.brand_kits enable row level security;
revoke all on public.brand_kits from anon, authenticated;
