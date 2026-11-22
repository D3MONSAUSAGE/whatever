-- Minimal production-shaped tables for the 0036 onboarding test (columns 0036 and the backfill read).
do $$ begin create role anon nologin; exception when duplicate_object or unique_violation then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object or unique_violation then null; end $$;
do $$ begin create role service_role nologin; exception when duplicate_object or unique_violation then null; end $$;
create schema if not exists auth;
create table auth.users (id uuid primary key, email text, created_at timestamptz default now());
create table public.accounts (id uuid primary key, name text not null, owner_user_id uuid references auth.users(id),
  created_at timestamptz not null default now(), onboarding_dismissed_at timestamptz, business_confirmed_at timestamptz, plan text default 'trial');
create table public.locations (id uuid primary key default gen_random_uuid(), account_id uuid references public.accounts(id) on delete cascade,
  name text, timezone text default 'UTC', created_at timestamptz default now());
create table public.media (id uuid primary key default gen_random_uuid(), account_id uuid references public.accounts(id) on delete cascade,
  file_name text, kind text, source_media_id uuid, processing_status text, created_at timestamptz default now());
create table public.playlists (id uuid primary key default gen_random_uuid(), account_id uuid references public.accounts(id) on delete cascade,
  name text, published_at timestamptz, created_at timestamptz default now());
create table public.playlist_items (id uuid primary key default gen_random_uuid(), playlist_id uuid references public.playlists(id) on delete cascade,
  account_id uuid, media_id uuid, kind text default 'published');
create table public.displays (id uuid primary key default gen_random_uuid(), account_id uuid references public.accounts(id) on delete cascade,
  name text, status text default 'active', location_id uuid, assigned_media_id uuid, assigned_playlist_id uuid,
  confirmed_at timestamptz, confirmed_version bigint, last_seen_at timestamptz, created_at timestamptz default now());
create table public.schedules (id uuid primary key default gen_random_uuid(), account_id uuid references public.accounts(id) on delete cascade,
  enabled boolean default true, created_at timestamptz default now());
create table public.menus (id uuid primary key default gen_random_uuid(), account_id uuid references public.accounts(id) on delete cascade,
  name text, content jsonb not null default '{}'::jsonb, playlist_id uuid, created_at timestamptz default now(), updated_at timestamptz default now());
create table public.activity_events (id bigserial primary key, account_id uuid references public.accounts(id) on delete cascade,
  at timestamptz not null default now(), kind text not null, subject_id uuid, subject_name text, detail jsonb not null default '{}'::jsonb);
create or replace function public.log_activity(p_account uuid, p_kind text, p_subject uuid, p_name text, p_detail jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.activity_events (account_id, kind, subject_id, subject_name, detail)
  values (p_account, p_kind, p_subject, left(p_name, 120), coalesce(p_detail, '{}'::jsonb));
exception when others then null;
end $$;
create or replace function public.log_commercial_once(p_account uuid, p_kind text, p_detail jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.activity_events where account_id = p_account and kind = p_kind) then
    perform public.log_activity(p_account, p_kind, null, null, coalesce(p_detail, '{}'::jsonb));
  end if;
exception when others then null;
end $$;
