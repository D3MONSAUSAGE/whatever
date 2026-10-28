-- Pantalla: schema, RLS, private storage bucket, server-only functions.
-- Run once in the Supabase SQL editor. It is not idempotent (see RECOVERY.md).

-- ---------------------------------------------------------------- tables

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_user_id uuid not null unique references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Not exposed in the UI yet; exists so multi-location can be added later.
create table public.locations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);
create index locations_account_id_idx on public.locations(account_id);

create table public.media (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  file_name text not null,
  storage_path text not null unique,
  mime_type text not null,
  size_bytes integer not null,
  created_at timestamptz not null default now()
);
create index media_account_created_idx on public.media(account_id, created_at desc);

create table public.displays (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  name text not null check (char_length(name) between 1 and 60),
  assigned_media_id uuid references public.media(id) on delete set null,
  content_version integer not null default 0,
  token_hash text unique,
  status text not null default 'active' check (status in ('active', 'revoked')),
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);
create index displays_account_id_idx on public.displays(account_id);
create index displays_location_id_idx on public.displays(location_id);
create index displays_assigned_media_id_idx on public.displays(assigned_media_id);

-- pending -> claimed (admin entered code) -> completed (TV collected its token)
create table public.pairing_sessions (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null,
  session_secret_hash text not null,
  expires_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'claimed', 'completed', 'expired')),
  display_id uuid references public.displays(id) on delete cascade,
  created_at timestamptz not null default now(),
  claimed_at timestamptz
);
-- A code can only be live once at a time.
create unique index pairing_sessions_pending_code_idx
  on public.pairing_sessions(code_hash) where status = 'pending';
create index pairing_sessions_status_expires_idx on public.pairing_sessions(status, expires_at);
create index pairing_sessions_display_id_idx on public.pairing_sessions(display_id);

create table public.rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  count integer not null default 0
);

-- ---------------------------------------------------------------- RLS
-- All writes go through server routes (service role). Admins can only read
-- their own account's rows. pairing_sessions and rate_limits have no
-- policies, so only the service role can touch them.

alter table public.accounts enable row level security;
alter table public.locations enable row level security;
alter table public.media enable row level security;
alter table public.displays enable row level security;
alter table public.pairing_sessions enable row level security;
alter table public.rate_limits enable row level security;

create policy accounts_owner_read on public.accounts
  for select to authenticated using (owner_user_id = auth.uid());

create policy locations_owner_read on public.locations
  for select to authenticated using (
    account_id in (select id from public.accounts where owner_user_id = auth.uid()));

create policy media_owner_read on public.media
  for select to authenticated using (
    account_id in (select id from public.accounts where owner_user_id = auth.uid()));

create policy displays_owner_read on public.displays
  for select to authenticated using (
    account_id in (select id from public.accounts where owner_user_id = auth.uid()));

-- Default privileges in Supabase grant tables to anon and authenticated.
-- Take those grants back, then re-grant only the reads the dashboard needs.
-- pairing_sessions and rate_limits stay service-role only, even if RLS is
-- later disabled by mistake. token_hash is not in the displays grant.
revoke all on public.accounts from public, anon, authenticated;
revoke all on public.locations from public, anon, authenticated;
revoke all on public.media from public, anon, authenticated;
revoke all on public.displays from public, anon, authenticated;
revoke all on public.pairing_sessions from public, anon, authenticated;
revoke all on public.rate_limits from public, anon, authenticated;

grant select on public.accounts to authenticated;
grant select on public.locations to authenticated;
grant select on public.media to authenticated;
grant select (id, account_id, location_id, name, assigned_media_id, content_version,
              status, last_seen_at, created_at)
  on public.displays to authenticated;

-- ---------------------------------------------------------------- storage
-- Private bucket. Objects live at <account_id>/<media_id>.<ext> and are only
-- reachable through signed URLs issued by the server.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', false, 15728640, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------- functions
-- All are called by the server with the service role only.

create or replace function public.ensure_account(p_user_id uuid, p_name text)
returns uuid
language plpgsql
set search_path = ''
as $$
declare v_id uuid;
begin
  select id into v_id from public.accounts where owner_user_id = p_user_id;
  if found then return v_id; end if;

  insert into public.accounts (name, owner_user_id) values (p_name, p_user_id)
  on conflict (owner_user_id) do nothing
  returning id into v_id;

  if v_id is null then  -- created concurrently
    select id into v_id from public.accounts where owner_user_id = p_user_id;
    return v_id;
  end if;

  insert into public.locations (account_id, name) values (v_id, 'Main location');
  return v_id;
end $$;

-- Fixed-window counter. Returns true if the call is allowed.
create or replace function public.rate_limit_hit(p_key text, p_window_seconds integer, p_max integer)
returns boolean
language plpgsql
set search_path = ''
as $$
declare v_count integer;
begin
  insert into public.rate_limits as r (key, window_start, count)
  values (p_key, now(), 1)
  on conflict (key) do update set
    count = case when r.window_start < now() - make_interval(secs => p_window_seconds)
                 then 1 else r.count + 1 end,
    window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds)
                        then now() else r.window_start end
  returning count into v_count;
  return v_count <= p_max;
end $$;

create or replace function public.cleanup_stale()
returns void
language sql
set search_path = ''
as $$
  update public.pairing_sessions set status = 'expired'
    where status = 'pending' and expires_at < now();
  delete from public.pairing_sessions where created_at < now() - interval '1 day';
  delete from public.rate_limits where window_start < now() - interval '1 day';
$$;

-- Admin enters a code: atomically claim the session and create the display.
create or replace function public.claim_pairing(p_code_hash text, p_account_id uuid, p_name text)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_session_id uuid;
  v_location_id uuid;
  v_display_id uuid;
begin
  select id into v_session_id from public.pairing_sessions
    where code_hash = p_code_hash and status = 'pending' and expires_at > now()
    for update skip locked
    limit 1;
  if v_session_id is null then return null; end if;

  select id into v_location_id from public.locations
    where account_id = p_account_id order by created_at limit 1;

  insert into public.displays (account_id, location_id, name)
    values (p_account_id, v_location_id, p_name)
    returning id into v_display_id;

  update public.pairing_sessions
    set status = 'claimed', display_id = v_display_id, claimed_at = now()
    where id = v_session_id;

  return v_display_id;
end $$;

-- Player poll: heartbeat (throttled to one write per 30s) + current state.
create or replace function public.player_state(p_token_hash text)
returns table (display_id uuid, content_version integer, media_id uuid, storage_path text)
language sql
set search_path = ''
as $$
  -- `beat` is referenced so the heartbeat update cannot be optimized away.
  with beat as (
    update public.displays set last_seen_at = now()
    where token_hash = p_token_hash and status = 'active'
      and (last_seen_at is null or last_seen_at < now() - interval '30 seconds')
    returning id
  )
  select d.id, d.content_version, m.id, m.storage_path
  from public.displays d
  left join public.media m on m.id = d.assigned_media_id
  left join beat on true
  where d.token_hash = p_token_hash and d.status = 'active';
$$;

-- Assign (or clear, with null) the image on a display. Both must belong to the account.
create or replace function public.assign_media(p_account_id uuid, p_display_id uuid, p_media_id uuid)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  if p_media_id is not null and not exists (
    select 1 from public.media where id = p_media_id and account_id = p_account_id
  ) then
    return false;
  end if;

  update public.displays
    set assigned_media_id = p_media_id, content_version = content_version + 1
    where id = p_display_id and account_id = p_account_id and status = 'active';
  return found;
end $$;

-- Delete media: clear it from displays (bumping their version so TVs react),
-- delete the row, return the storage path for the server to remove.
create or replace function public.delete_media(p_account_id uuid, p_media_id uuid)
returns text
language plpgsql
set search_path = ''
as $$
declare v_path text;
begin
  update public.displays
    set assigned_media_id = null, content_version = content_version + 1
    where assigned_media_id = p_media_id and account_id = p_account_id;

  delete from public.media where id = p_media_id and account_id = p_account_id
    returning storage_path into v_path;
  return v_path;
end $$;

revoke execute on function public.ensure_account(uuid, text) from public, anon, authenticated;
revoke execute on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
revoke execute on function public.cleanup_stale() from public, anon, authenticated;
revoke execute on function public.claim_pairing(text, uuid, text) from public, anon, authenticated;
revoke execute on function public.player_state(text) from public, anon, authenticated;
revoke execute on function public.assign_media(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.delete_media(uuid, uuid) from public, anon, authenticated;

grant execute on function public.ensure_account(uuid, text) to service_role;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;
grant execute on function public.cleanup_stale() to service_role;
grant execute on function public.claim_pairing(text, uuid, text) to service_role;
grant execute on function public.player_state(text) to service_role;
grant execute on function public.assign_media(uuid, uuid, uuid) to service_role;
grant execute on function public.delete_media(uuid, uuid) to service_role;
