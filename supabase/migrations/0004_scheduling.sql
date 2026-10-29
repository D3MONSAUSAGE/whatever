-- Pantalla phase 2D: location timezones, screen groups, and schedules.
-- Additive and not idempotent. Apply once, after 0003_video.sql.
-- Does not drop, rename, or rewrite accounts, displays, media, playlists,
-- assignments, tokens, or pairing. Existing locations gain a timezone of UTC
-- until someone sets one. Rollback is supabase/rollback/0004_scheduling.sql
-- and is not a migration.

-- ---------------------------------------------------------------- locations

alter table public.locations
  add column timezone text not null default 'UTC';

alter table public.locations
  add constraint locations_timezone_len check (char_length(timezone) between 1 and 80);

-- ---------------------------------------------------------------- screen groups

create table public.screen_groups (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index screen_groups_account_id_idx on public.screen_groups(account_id);
create unique index screen_groups_account_name_idx on public.screen_groups(account_id, lower(name));

create table public.screen_group_members (
  group_id uuid not null references public.screen_groups(id) on delete cascade,
  display_id uuid not null references public.displays(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, display_id)
);
create index screen_group_members_display_idx on public.screen_group_members(display_id);
create index screen_group_members_account_idx on public.screen_group_members(account_id);

-- ---------------------------------------------------------------- schedules
-- Weekdays are ISO numbers, 1 Monday through 7 Sunday. start_minute and
-- end_minute are local clock minutes. end_minute 1440 is 24:00. A smaller
-- end_minute crosses midnight. Resolution, time zones, and conflicts live in
-- the API (lib/server/schedule.ts), not in a trigger.

create table public.schedules (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  playlist_id uuid not null references public.playlists(id) on delete cascade,
  display_id uuid references public.displays(id) on delete cascade,
  group_id uuid references public.screen_groups(id) on delete cascade,
  weekdays smallint[] not null,
  start_minute smallint not null check (start_minute between 0 and 1439),
  end_minute smallint not null check (end_minute between 0 and 1440),
  starts_on date,
  ends_on date,
  priority integer not null default 0 check (priority between -1000 and 1000),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schedules_one_target check (
    (display_id is not null and group_id is null)
    or (display_id is null and group_id is not null)
  ),
  constraint schedules_window check (start_minute <> end_minute),
  constraint schedules_dates check (starts_on is null or ends_on is null or ends_on >= starts_on),
  constraint schedules_weekdays check (
    cardinality(weekdays) between 1 and 7
    and weekdays <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]
  )
);
create index schedules_account_id_idx on public.schedules(account_id);
create index schedules_display_id_idx on public.schedules(display_id);
create index schedules_group_id_idx on public.schedules(group_id);
create index schedules_playlist_id_idx on public.schedules(playlist_id);

-- ---------------------------------------------------------------- snapshot
-- Copies the draft into the published slides without assigning or clearing
-- screens. Displays already showing this playlist as their everyday assignment
-- get a content_version bump so they reload. Scheduling reads this snapshot.

create function public.snapshot_playlist(p_account_id uuid, p_playlist_id uuid)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_default integer;
  v_transition text;
begin
  select default_duration_ms, transition into v_default, v_transition
    from public.playlists
    where id = p_playlist_id and account_id = p_account_id
    for update;
  if not found then
    return false;
  end if;

  if not exists (
    select 1 from public.playlist_items
    where playlist_id = p_playlist_id and kind = 'draft'
  ) then
    return false;
  end if;

  delete from public.playlist_items
    where playlist_id = p_playlist_id and kind = 'published';

  insert into public.playlist_items (
    playlist_id, account_id, media_id, kind, position, duration_ms
  )
  select playlist_id, account_id, media_id, 'published', position,
         coalesce(duration_ms, v_default)
  from public.playlist_items
  where playlist_id = p_playlist_id and kind = 'draft'
  order by position;

  update public.playlists
    set published_at = now(),
        published_transition = v_transition,
        revision = revision + 1,
        updated_at = now()
    where id = p_playlist_id and account_id = p_account_id;

  update public.displays
    set content_version = content_version + 1
    where account_id = p_account_id
      and status = 'active'
      and assigned_playlist_id = p_playlist_id;

  return true;
end $$;

-- ---------------------------------------------------------------- RLS
-- Same owner-SELECT pattern as playlists. No insert, update, or delete
-- policies. Writes go through service-role routes scoped by account_id.

alter table public.screen_groups enable row level security;
alter table public.screen_group_members enable row level security;
alter table public.schedules enable row level security;

create policy screen_groups_owner_read on public.screen_groups
  for select to authenticated using (
    account_id in (
      select id from public.accounts where owner_user_id = (select auth.uid())
    )
  );

create policy screen_group_members_owner_read on public.screen_group_members
  for select to authenticated using (
    account_id in (
      select id from public.accounts where owner_user_id = (select auth.uid())
    )
  );

create policy schedules_owner_read on public.schedules
  for select to authenticated using (
    account_id in (
      select id from public.accounts where owner_user_id = (select auth.uid())
    )
  );

revoke all on public.screen_groups from public, anon, authenticated;
revoke all on public.screen_group_members from public, anon, authenticated;
revoke all on public.schedules from public, anon, authenticated;

grant select on public.screen_groups to authenticated;
grant select on public.screen_group_members to authenticated;
grant select on public.schedules to authenticated;

revoke execute on function public.snapshot_playlist(uuid, uuid) from public, anon, authenticated;
grant execute on function public.snapshot_playlist(uuid, uuid) to service_role;
