-- M13: dated promos follow their menu. Additive only: two functions and one trigger.
-- A screen showing a menu gets one all-day promo rule per dated ("scheduled") promo on that menu;
-- a screen moved off the menu loses those rules. Other schedules are never touched.

create or replace function public.promo_sync_display(p_display_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  d record;
  added integer := 0;
  room integer;
begin
  select id, account_id, assigned_playlist_id into d from displays where id = p_display_id;
  if not found then return 0; end if;

  -- Drop promo rules on this screen whose menu it no longer shows.
  delete from schedules s
  using promos p, menus m
  where s.display_id = d.id
    and p.account_id = d.account_id
    and s.playlist_id = p.combo_playlist_id
    and m.id = p.menu_id
    and m.playlist_id is distinct from d.assigned_playlist_id;

  if d.assigned_playlist_id is null then return 0; end if;

  select 200 - count(*) into room from schedules where account_id = d.account_id;

  with wanted as (
    select p.id, p.name, p.combo_playlist_id, p.starts_on, p.ends_on
    from promos p join menus m on m.id = p.menu_id
    where p.account_id = d.account_id
      and p.placement = 'scheduled'
      and p.combo_playlist_id is not null
      and m.playlist_id = d.assigned_playlist_id
      and not exists (select 1 from schedules s where s.display_id = d.id and s.playlist_id = p.combo_playlist_id)
    order by p.created_at
    limit greatest(room, 0)
  ), ins as (
    insert into schedules (account_id, name, playlist_id, display_id, weekdays, start_minute, end_minute, starts_on, ends_on, priority, enabled)
    select d.account_id, left('Promo: ' || w.name, 80), w.combo_playlist_id, d.id, array[1,2,3,4,5,6,7]::smallint[], 0, 1440, w.starts_on, w.ends_on, 5, true
    from wanted w
    returning 1
  )
  select count(*) into added from ins;
  return added;
end;
$$;

create or replace function public.promo_sync_account(p_account_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  total integer := 0;
begin
  for r in select id from displays where account_id = p_account_id order by created_at loop
    total := total + public.promo_sync_display(r.id);
  end loop;
  return total;
end;
$$;

create or replace function public.promo_display_assigned()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.promo_sync_display(new.id);
  return new;
end;
$$;

drop trigger if exists displays_promo_follow_menu on public.displays;
create trigger displays_promo_follow_menu
  after update of assigned_playlist_id on public.displays
  for each row
  when (old.assigned_playlist_id is distinct from new.assigned_playlist_id)
  execute function public.promo_display_assigned();

drop trigger if exists displays_promo_follow_menu_new on public.displays;
create trigger displays_promo_follow_menu_new
  after insert on public.displays
  for each row
  when (new.assigned_playlist_id is not null)
  execute function public.promo_display_assigned();

revoke all on function public.promo_sync_display(uuid) from public, anon, authenticated;
revoke all on function public.promo_sync_account(uuid) from public, anon, authenticated;
revoke all on function public.promo_display_assigned() from public, anon, authenticated;
grant execute on function public.promo_sync_display(uuid) to service_role;
grant execute on function public.promo_sync_account(uuid) to service_role;
