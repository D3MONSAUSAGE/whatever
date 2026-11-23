-- Read-only dry run for 0037. Returns counts only (no ids, names or content). Changes nothing.
select
  (select count(*) from public.displays) as displays_total,
  (select count(*) from public.displays where status = 'active') as displays_active,
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'displays'
     and column_name in ('orientation', 'player_viewport_width', 'player_viewport_height', 'player_viewport_at')) as new_columns_already_present,
  (select count(*) from public.menus) as menus_total,
  (select count(*) from public.menus where content ? 'orientation') as menus_with_orientation_key,
  (select count(*) from public.menus where content->>'layoutVersion' = '1') as layout_boards,
  (select count(*) from public.menus where coalesce(content->>'layoutVersion', '') <> '1') as classic_boards,
  (select count(*) from public.media where file_name like '% (menu).png') as board_renders,
  (select count(*) from public.media where file_name like '% (menu).png' and (width <> 1920 or height <> 1080)) as board_renders_not_1920x1080;
