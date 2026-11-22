-- Read-only dry run of the 0036 backfill. Returns counts only (no ids, names, emails or content).
-- Run before applying 0036; it reads the same facts as the migration and changes nothing.
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
      'first_menu', to_char(d.first_menu_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'preview_menu', to_char(d.first_menu_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'customize_menu', to_char(d.customize_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'screen', to_char(d.screen_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'show_on_tv', to_char(d.show_on_tv_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'first_update', to_char(d.first_update_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'playlists', to_char(d.playlists_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'schedules', to_char(d.schedules_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))) as m,
    d.first_menu_at,
    ((d.v1_business and d.v1_location and d.v1_screen and d.v1_media and d.v1_playlist and d.v1_publish and d.v1_playing)
      or d.v1_legacy) as v1_finished
  from derived d
)
select
  (select count(*) from public.accounts) as accounts,
  count(*) filter (where p.m <> '{}'::jsonb or p.v1_finished) as accounts_updated,
  count(*) filter (where p.m ? 'first_menu') as first_menu_credit,
  count(*) filter (where p.first_menu_at is not null) as celebrated_set_no_popup,
  count(*) filter (where p.m ? 'customize_menu') as customize_menu,
  count(*) filter (where p.m ? 'screen') as screen,
  count(*) filter (where p.m ? 'show_on_tv') as show_on_tv,
  count(*) filter (where p.m ? 'first_update') as first_update,
  count(*) filter (where p.m ? 'playlists') as playlists,
  count(*) filter (where p.m ? 'schedules') as schedules,
  count(*) filter (where p.v1_finished) as completed_via_v1_rules,
  count(*) filter (where p.m ?& array['first_menu','preview_menu','screen','show_on_tv','first_update']) as completed_via_required_steps,
  count(*) filter (where p.v1_finished or p.m ?& array['first_menu','preview_menu','screen','show_on_tv','first_update']) as completed_at_stamped,
  (select count(*) from public.accounts where onboarding_dismissed_at is not null) as dismissed_preserved,
  (select count(distinct pl.account_id) from public.playlists pl where pl.published_at is not null
     and not exists (select 1 from public.activity_events e where e.account_id = pl.account_id and e.kind = 'commercial.first_publish')) as first_publish_backfill_rows
from planned p;
