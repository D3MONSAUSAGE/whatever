-- 0036 (t409u): menu-first onboarding v2. Additive and re-runnable.
--   * accounts gains three columns: onboarding_milestones (jsonb, one ISO time per earned step),
--     onboarding_completed_at, first_menu_celebrated_at. Nothing existing is altered or removed.
--   * onboarding_mark(): stamps a step once (never moves or clears a time) and logs onboarding.<step> once.
--   * commercial.first_publish now also fires for playlists inserted already published (menu_create_playlist),
--     which the 0014 update-only trigger missed.
--   * Backfill: existing accounts get credit from the content they already have. onboarding_dismissed_at is never
--     touched; accounts already finished stay finished; pre-rollout content is marked celebrated so no account
--     sees a retroactive "Your first menu is ready!".
-- Privacy: milestones and onboarding.* events hold step names, times, and {source, kind} only. No menu text,
-- file names, emails or names. onboarding.* is kept out of the customer activity feed by the API.
-- Rollback: supabase/rollback/0036_onboarding_milestones.sql.

begin;

alter table public.accounts add column if not exists onboarding_milestones jsonb not null default '{}'::jsonb;
alter table public.accounts add column if not exists onboarding_completed_at timestamptz;
alter table public.accounts add column if not exists first_menu_celebrated_at timestamptz;
do $$ begin
  alter table public.accounts add constraint accounts_onboarding_milestones_object
    check (jsonb_typeof(onboarding_milestones) = 'object');
exception when duplicate_object then null;
end $$;

create or replace function public.onboarding_iso(p_at timestamptz)
returns text language sql stable set search_path = '' as $$
  select to_char(p_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
$$;

-- Stamp steps once. Unknown step names are ignored. When the five required steps are all stamped,
-- onboarding_completed_at is set once. Returns { milestones, completed_at }.
create or replace function public.onboarding_mark(p_account uuid, p_steps text[], p_source text default null, p_kind text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_allowed constant text[] := array['first_menu', 'preview_menu', 'customize_menu', 'screen', 'show_on_tv',
                                     'first_update', 'playlists', 'schedules'];
  v_required constant text[] := array['first_menu', 'preview_menu', 'screen', 'show_on_tv', 'first_update'];
  v_source text := case when p_source in ('web', 'android') then p_source end;
  v_kind text := case when p_kind in ('menu_board', 'upload') then p_kind end;
  v_before jsonb;
  v_after jsonb;
  v_completed timestamptz;
  v_now text := public.onboarding_iso(now());
  v_step text;
begin
  select onboarding_milestones, onboarding_completed_at into v_before, v_completed
    from public.accounts where id = p_account for update;
  if not found then return null; end if;
  v_after := coalesce(v_before, '{}'::jsonb);
  foreach v_step in array coalesce(p_steps, '{}'::text[]) loop
    if v_step = any(v_allowed) and not (v_after ? v_step) then
      v_after := v_after || jsonb_build_object(v_step, v_now);
      perform public.log_activity(p_account, 'onboarding.' || v_step, null, null, jsonb_strip_nulls(jsonb_build_object(
        'source', v_source, 'kind', case when v_step = 'first_menu' then v_kind end)));
    end if;
  end loop;
  if v_after is distinct from v_before then
    update public.accounts set onboarding_milestones = v_after where id = p_account;
  end if;
  if v_completed is null and v_after ?& v_required then
    v_completed := now();
    update public.accounts set onboarding_completed_at = v_completed where id = p_account and onboarding_completed_at is null;
    perform public.log_activity(p_account, 'onboarding.completed', null, null, jsonb_strip_nulls(jsonb_build_object('source', v_source)));
  end if;
  return jsonb_build_object('milestones', v_after, 'completed_at', public.onboarding_iso(v_completed));
end $$;

revoke execute on function public.onboarding_mark(uuid, text[], text, text) from public, anon, authenticated;
revoke execute on function public.onboarding_iso(timestamptz) from public, anon, authenticated;
grant execute on function public.onboarding_mark(uuid, text[], text, text) to service_role;
grant execute on function public.onboarding_iso(timestamptz) to service_role;

-- ---------------------------------------------------------------- first publish for inserted playlists
-- menu_create_playlist inserts the board's playlist with published_at already set, so the 0014 trigger
-- (after update of published_at) never saw it. Same once-only event, same detail shape.
create or replace function public.trg_playlists_commercial_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.published_at is not null then
    perform public.log_commercial_once(new.account_id, 'commercial.first_publish', '{}'::jsonb);
  end if;
  return new;
exception when others then return new;
end $$;
revoke execute on function public.trg_playlists_commercial_insert() from public, anon, authenticated;
drop trigger if exists playlists_commercial_insert on public.playlists;
create trigger playlists_commercial_insert after insert on public.playlists
  for each row execute function public.trg_playlists_commercial_insert();

-- Accounts that already published a board this way get the event at their first publish time (marked backfilled).
insert into public.activity_events (account_id, at, kind, subject_id, subject_name, detail)
select p.account_id, min(p.published_at), 'commercial.first_publish', null, null, '{"backfilled": true}'::jsonb
  from public.playlists p
 where p.published_at is not null
   and not exists (select 1 from public.activity_events e where e.account_id = p.account_id and e.kind = 'commercial.first_publish')
 group by p.account_id;

-- ---------------------------------------------------------------- backfill
-- Same rules as lib/onboarding.ts and lib/server/onboarding.ts. The dry run in docs/onboarding/0036_dry_run.sql
-- uses this exact facts query read-only.
with facts as (
  select a.id,
    -- Step 1: a board with a named item or featured media, or a finished upload that isn't a board/promo still.
    least(
      (select min(mn.created_at) from public.menus mn where mn.account_id = a.id and (
         jsonb_path_exists(mn.content, '$.sections[*].items[*].name ? (@ like_regex "[^ ]")')
         or coalesce(trim(mn.content->>'imageMediaId'), '') <> ''
         or coalesce(trim(mn.content->>'videoMediaId'), '') <> ''
         or coalesce(trim(mn.content->>'photoMediaId'), '') <> '')),
      (select min(m.created_at) from public.media m where m.account_id = a.id and m.source_media_id is null
         and m.file_name !~ ' \((menu|promo)\)\.png$' and (m.processing_status is null or m.processing_status = 'ready'))
    ) as first_menu_at,
    (select min(mn.updated_at) from public.menus mn where mn.account_id = a.id and (
       exists (select 1 from jsonb_object_keys(case when jsonb_typeof(mn.content->'custom') = 'object' then mn.content->'custom' else '{}'::jsonb end) k where k <> 'v')
       or coalesce(mn.content->>'primaryColor', '') <> '' or coalesce(mn.content->>'accentColor', '') <> ''
       or coalesce(mn.content->>'textColor', '') <> '' or coalesce(mn.content->>'backgroundColor', '') <> '')) as customize_at,
    (select min(d.created_at) from public.displays d where d.account_id = a.id) as screen_at,
    (select min(e.at) from public.activity_events e where e.account_id = a.id and e.kind = 'screen.content_changed') as first_change_at,
    (select min(x.at) from (
       select e.at, row_number() over (partition by e.subject_id order by e.at) as n
         from public.activity_events e
        where e.account_id = a.id and e.kind = 'screen.content_changed' and e.subject_id is not null) x
      where x.n = 2) as first_update_at,
    (select min(pl.created_at) from public.playlists pl where pl.account_id = a.id
       and exists (select 1 from public.playlist_items pi where pi.playlist_id = pl.id)
       and not exists (select 1 from public.menus mn where mn.playlist_id = pl.id)) as playlists_at,
    (select min(s.created_at) from public.schedules s where s.account_id = a.id) as schedules_at,
    -- The original eight steps (lib/server/onboarding.ts), to keep finished accounts finished.
    exists (select 1 from public.displays d where d.account_id = a.id and d.status = 'active') as v1_screen,
    exists (select 1 from public.media m where m.account_id = a.id) as v1_media,
    exists (select 1 from public.playlist_items pi where pi.account_id = a.id) as v1_playlist,
    (exists (select 1 from public.displays d left join public.playlists p on p.id = d.assigned_playlist_id
              where d.account_id = a.id and d.status = 'active'
                and (d.assigned_media_id is not null or (d.assigned_playlist_id is not null and p.published_at is not null)))
     or (exists (select 1 from public.displays d where d.account_id = a.id and d.status = 'active')
         and exists (select 1 from public.schedules s where s.account_id = a.id and s.enabled))) as v1_publish,
    exists (select 1 from public.displays d where d.account_id = a.id and d.status = 'active'
             and ((d.confirmed_at is not null and d.confirmed_version is not null)
                  or (d.last_seen_at > now() - interval '90 seconds' and (d.assigned_media_id is not null or d.assigned_playlist_id is not null)))) as v1_playing,
    (a.business_confirmed_at is not null or a.name is distinct from coalesce(nullif(left(trim(regexp_replace(
       split_part(coalesce(u.email, ''), '@', 1), '[\x01-\x1f\x7f]', '', 'g')), 80), ''), 'My business')) as v1_business,
    ((select count(*) from public.locations l where l.account_id = a.id) > 1
     or exists (select 1 from public.locations l where l.account_id = a.id
                 and (l.name <> 'Main location' or (l.timezone is not null and l.timezone <> 'UTC')))
     or exists (select 1 from public.displays d where d.account_id = a.id and d.status = 'active' and d.location_id is not null)) as v1_location,
    a.created_at
  from public.accounts a
  left join auth.users u on u.id = a.owner_user_id
),
derived as (
  select f.*,
    (f.v1_screen and f.v1_media and f.v1_publish and f.created_at < timestamptz '2026-10-30T12:00:00Z') as v1_legacy,
    case when f.v1_publish or f.first_change_at is not null then coalesce(f.first_change_at, now()) end as show_on_tv_at
  from facts f
),
planned as (
  select d.id,
    jsonb_strip_nulls(jsonb_build_object(
      'first_menu', public.onboarding_iso(d.first_menu_at),
      'preview_menu', public.onboarding_iso(d.first_menu_at),
      'customize_menu', public.onboarding_iso(d.customize_at),
      'screen', public.onboarding_iso(d.screen_at),
      'show_on_tv', public.onboarding_iso(d.show_on_tv_at),
      'first_update', public.onboarding_iso(d.first_update_at),
      'playlists', public.onboarding_iso(d.playlists_at),
      'schedules', public.onboarding_iso(d.schedules_at))) as m,
    d.first_menu_at,
    ((d.v1_business and d.v1_location and d.v1_screen and d.v1_media and d.v1_playlist and d.v1_publish and d.v1_playing)
      or d.v1_legacy) as v1_finished
  from derived d
)
update public.accounts a
   set onboarding_milestones = p.m || a.onboarding_milestones,
       onboarding_completed_at = coalesce(a.onboarding_completed_at,
         case when p.v1_finished or (p.m || a.onboarding_milestones) ?& array['first_menu', 'preview_menu', 'screen', 'show_on_tv', 'first_update']
              then now() end),
       first_menu_celebrated_at = coalesce(a.first_menu_celebrated_at, case when p.first_menu_at is not null then now() end)
  from planned p
 where p.id = a.id
   and (p.m <> '{}'::jsonb or p.v1_finished);

commit;
