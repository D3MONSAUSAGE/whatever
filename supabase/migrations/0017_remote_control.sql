-- Phone remote control for Manual slideshow (extends 0016).
-- Additive tables + RPCs. No billing/Stripe/Meta. Safe to re-run column/table creates.
-- Player remains X-Display-Token authenticated; commands delivered via fast poll
-- (no Realtime — player has no Supabase JWT).

create table if not exists public.display_playback (
  display_id uuid primary key references public.displays(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  playlist_id uuid references public.playlists(id) on delete set null,
  playback_mode text not null default 'auto'
    check (playback_mode in ('auto', 'manual')),
  item_index integer not null default 0 check (item_index >= 0),
  item_count integer not null default 0 check (item_count >= 0),
  content_version bigint not null default 0,
  last_applied_seq bigint not null default 0,
  last_issued_seq bigint not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists display_playback_account_idx
  on public.display_playback (account_id);

create table if not exists public.display_commands (
  id uuid primary key default gen_random_uuid(),
  display_id uuid not null references public.displays(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  command text not null check (command in ('next', 'prev')),
  seq bigint not null,
  issued_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  unique (display_id, seq)
);

create index if not exists display_commands_pending_idx
  on public.display_commands (display_id, seq)
  where applied_at is null;

alter table public.display_playback enable row level security;
alter table public.display_commands enable row level security;

drop policy if exists display_playback_owner_read on public.display_playback;
create policy display_playback_owner_read on public.display_playback
  for select using (
    account_id in (select id from public.accounts where owner_user_id = (select auth.uid()))
  );

drop policy if exists display_commands_owner_read on public.display_commands;
create policy display_commands_owner_read on public.display_commands
  for select using (
    account_id in (select id from public.accounts where owner_user_id = (select auth.uid()))
  );

revoke all on public.display_playback from public, anon, authenticated;
revoke all on public.display_commands from public, anon, authenticated;
grant select on public.display_playback to authenticated;
grant select on public.display_commands to authenticated;

-- ---------------------------------------------------------------- enqueue
create or replace function public.enqueue_display_command(
  p_account_id uuid,
  p_display_id uuid,
  p_user_id uuid,
  p_command text
) returns table (command_id uuid, seq bigint)
language plpgsql
set search_path = ''
as $$
declare
  v_seq bigint;
  v_id uuid;
begin
  if p_command is null or p_command not in ('next', 'prev') then
    return;
  end if;
  if not exists (
    select 1 from public.displays
    where id = p_display_id and account_id = p_account_id and status = 'active'
      and assigned_playlist_id is not null
  ) then
    return;
  end if;
  if not exists (
    select 1 from public.accounts where id = p_account_id and owner_user_id = p_user_id
  ) then
    return;
  end if;

  insert into public.display_playback (display_id, account_id)
  values (p_display_id, p_account_id)
  on conflict (display_id) do nothing;

  update public.display_playback
    set last_issued_seq = last_issued_seq + 1,
        updated_at = now()
    where display_id = p_display_id and account_id = p_account_id
    returning last_issued_seq into v_seq;

  insert into public.display_commands (
    display_id, account_id, command, seq, issued_by
  ) values (
    p_display_id, p_account_id, p_command, v_seq, p_user_id
  ) returning id into v_id;

  command_id := v_id;
  seq := v_seq;
  return next;
end $$;

-- ---------------------------------------------------------------- set playlist mode for a display's assigned playlist
create or replace function public.set_display_playlist_mode(
  p_account_id uuid,
  p_display_id uuid,
  p_user_id uuid,
  p_mode text
) returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_playlist uuid;
begin
  if p_mode is null or p_mode not in ('auto', 'manual') then
    return false;
  end if;
  if not exists (
    select 1 from public.accounts where id = p_account_id and owner_user_id = p_user_id
  ) then
    return false;
  end if;

  select assigned_playlist_id into v_playlist
    from public.displays
    where id = p_display_id and account_id = p_account_id and status = 'active'
    for update;
  if v_playlist is null then
    return false;
  end if;

  update public.playlists
    set playback_mode = p_mode,
        published_playback_mode = p_mode,
        revision = revision + 1,
        updated_at = now()
    where id = v_playlist and account_id = p_account_id
      and published_at is not null;
  if not found then
    return false;
  end if;

  -- Bump every screen on this playlist so players reload the new mode.
  update public.displays
    set content_version = content_version + 1
    where account_id = p_account_id
      and status = 'active'
      and assigned_playlist_id = v_playlist;

  insert into public.display_playback (display_id, account_id, playlist_id, playback_mode, updated_at)
  values (p_display_id, p_account_id, v_playlist, p_mode, now())
  on conflict (display_id) do update
    set playlist_id = excluded.playlist_id,
        playback_mode = excluded.playback_mode,
        updated_at = now();

  return true;
end $$;

-- ---------------------------------------------------------------- player: pending commands
create or replace function public.player_pending_commands(p_token_hash text)
returns table (seq bigint, command text)
language sql
set search_path = ''
as $$
  select c.seq, c.command
  from public.displays d
  join public.display_commands c
    on c.display_id = d.id and c.applied_at is null
  left join public.display_playback pb on pb.display_id = d.id
  where d.token_hash = p_token_hash
    and d.status = 'active'
    and c.seq > coalesce(pb.last_applied_seq, 0)
  order by c.seq;
$$;

-- ---------------------------------------------------------------- player: report playback + ack
create or replace function public.player_report_playback(
  p_token_hash text,
  p_playlist_id uuid,
  p_playback_mode text,
  p_item_index integer,
  p_item_count integer,
  p_content_version bigint,
  p_last_applied_seq bigint
) returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_display uuid;
  v_account uuid;
  v_mode text;
begin
  select id, account_id into v_display, v_account
    from public.displays
    where token_hash = p_token_hash and status = 'active';
  if v_display is null then
    return false;
  end if;

  v_mode := case when p_playback_mode = 'manual' then 'manual' else 'auto' end;

  insert into public.display_playback (
    display_id, account_id, playlist_id, playback_mode,
    item_index, item_count, content_version, last_applied_seq, updated_at
  ) values (
    v_display, v_account, p_playlist_id, v_mode,
    greatest(coalesce(p_item_index, 0), 0),
    greatest(coalesce(p_item_count, 0), 0),
    coalesce(p_content_version, 0),
    greatest(coalesce(p_last_applied_seq, 0), 0),
    now()
  )
  on conflict (display_id) do update
    set playlist_id = excluded.playlist_id,
        playback_mode = excluded.playback_mode,
        item_index = excluded.item_index,
        item_count = excluded.item_count,
        content_version = excluded.content_version,
        last_applied_seq = greatest(public.display_playback.last_applied_seq, excluded.last_applied_seq),
        updated_at = now();

  if p_last_applied_seq is not null and p_last_applied_seq > 0 then
    update public.display_commands
      set applied_at = coalesce(applied_at, now())
      where display_id = v_display
        and applied_at is null
        and seq <= p_last_applied_seq;
  end if;

  -- Heartbeat so remote UI sees the screen online while on fast poll.
  update public.displays
    set last_seen_at = now()
    where id = v_display
      and (last_seen_at is null or last_seen_at < now() - interval '15 seconds');

  return true;
end $$;

revoke execute on function public.enqueue_display_command(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.set_display_playlist_mode(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.player_pending_commands(text) from public, anon, authenticated;
revoke execute on function public.player_report_playback(text, uuid, text, integer, integer, bigint, bigint) from public, anon, authenticated;

grant execute on function public.enqueue_display_command(uuid, uuid, uuid, text) to service_role;
grant execute on function public.set_display_playlist_mode(uuid, uuid, uuid, text) to service_role;
grant execute on function public.player_pending_commands(text) to service_role;
grant execute on function public.player_report_playback(text, uuid, text, integer, integer, bigint, bigint) to service_role;
