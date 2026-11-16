-- Parity Phase 1 item 3 / W6 (approved by Francisco, t353u): deleting a menu board also removes the
-- backing playlist and rendered image it created, but ONLY when nothing else uses them.
-- Additive: one new function. No table, column, policy, trigger or table-grant changes.
--
-- Before this, DELETE /api/menus/{id} removed only the menus row and left "<name>" (playlist) and
-- "<name> (menu).png" (media) in the library forever.
--
-- Rules (conservative: any doubt keeps the item, so no screen ever goes blank):
--   * The menu row is locked and deleted first. If it isn't in the caller's account: returns null.
--   * The backing playlist is deleted only if, after the menu row is gone, NOTHING references it:
--       - no display (any status) has it assigned, and no display_playback row points at it;
--       - no schedule uses it (schedules.playlist_id cascades, so a schedule would be lost);
--       - no promo uses it as playlist_id or combo_playlist_id, or mentions it in content;
--       - no other menu points at it or mentions it in its content (layouts);
--       - its draft and published items hold only the menu's own render (nothing the owner added).
--   * The rendered image is deleted only if, after that, NOTHING references it: no playlist item in
--     any playlist (so if the playlist was kept, the image is kept), no display assigned_media_id, no
--     promo, no other menu (column or content, e.g. a layout photo), no brand kit, and no media row
--     derived from it (source_media_id).
--   * Both rows are locked FOR UPDATE before their checks. A concurrent write that would start using
--     them (assign, publish, schedule, add to a playlist) takes a FOR KEY SHARE lock on the same row
--     through its foreign key, so it either commits first and is seen by the check (item kept), or
--     waits and then fails its FK check after this commits. No screen can be pointed at a deleted row.
-- The function never deletes a storage object; it returns the removed paths and the API removes them
-- after commit (same pattern as delete_media).
--
-- RLS: unchanged. SECURITY INVOKER, executable by service_role only, called from the API after
-- requireAdmin with the account id from the session. Rollback: supabase/rollback/0031_menu_delete_cleanup.sql.

begin;

create or replace function public.menu_delete_cleanup(p_account_id uuid, p_menu_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_playlist uuid;
  v_media uuid;
  v_playlist_kept text := null;
  v_media_kept text := null;
  v_playlist_deleted boolean := false;
  v_path text := null;
  v_thumb text := null;
  v_found boolean;
begin
  if p_account_id is null or p_menu_id is null then
    return null;
  end if;

  select m.playlist_id, m.media_id into v_playlist, v_media
    from public.menus m
    where m.id = p_menu_id and m.account_id = p_account_id
    for update;
  if not found then
    return null;
  end if;

  delete from public.menus where id = p_menu_id and account_id = p_account_id;

  -- Backing playlist.
  if v_playlist is not null then
    perform 1 from public.playlists p
      where p.id = v_playlist and p.account_id = p_account_id
      for update;
    v_found := found;
    if not v_found then
      v_playlist_kept := 'missing';
    elsif exists (select 1 from public.displays d where d.assigned_playlist_id = v_playlist) then
      v_playlist_kept := 'screen';
    elsif exists (select 1 from public.display_playback dp where dp.playlist_id = v_playlist) then
      v_playlist_kept := 'screen';
    elsif exists (select 1 from public.schedules s where s.playlist_id = v_playlist) then
      v_playlist_kept := 'schedule';
    elsif exists (
      select 1 from public.promos pr
      where pr.playlist_id = v_playlist or pr.combo_playlist_id = v_playlist
         or pr.content::text like '%' || v_playlist::text || '%'
    ) then
      v_playlist_kept := 'promo';
    elsif exists (
      select 1 from public.menus m
      where m.playlist_id = v_playlist or m.content::text like '%' || v_playlist::text || '%'
    ) then
      v_playlist_kept := 'menu';
    elsif exists (
      select 1 from public.playlist_items i
      where i.playlist_id = v_playlist and (v_media is null or i.media_id <> v_media)
    ) then
      v_playlist_kept := 'other_items';
    else
      delete from public.playlists where id = v_playlist and account_id = p_account_id;
      v_playlist_deleted := true;
    end if;
  end if;

  -- Rendered image.
  if v_media is not null then
    select md.storage_path, md.thumbnail_path into v_path, v_thumb
      from public.media md
      where md.id = v_media and md.account_id = p_account_id
      for update;
    v_found := found;
    if not v_found then
      v_media_kept := 'missing';
    elsif exists (select 1 from public.playlist_items i where i.media_id = v_media) then
      v_media_kept := 'playlist';
    elsif exists (select 1 from public.displays d where d.assigned_media_id = v_media) then
      v_media_kept := 'screen';
    elsif exists (
      select 1 from public.promos pr
      where pr.media_id = v_media or pr.content::text like '%' || v_media::text || '%'
    ) then
      v_media_kept := 'promo';
    elsif exists (
      select 1 from public.menus m
      where m.media_id = v_media or m.content::text like '%' || v_media::text || '%'
    ) then
      v_media_kept := 'menu';
    elsif exists (
      select 1 from public.brand_kits b where to_jsonb(b)::text like '%' || v_media::text || '%'
    ) then
      v_media_kept := 'brand_kit';
    elsif exists (select 1 from public.media c where c.source_media_id = v_media) then
      v_media_kept := 'media';
    else
      delete from public.media where id = v_media and account_id = p_account_id;
    end if;
    if v_media_kept is not null then
      v_path := null;
      v_thumb := null;
    end if;
  end if;

  return jsonb_build_object(
    'playlistDeleted', v_playlist_deleted,
    'playlistKept', v_playlist_kept,
    'mediaDeleted', v_media is not null and v_media_kept is null,
    'mediaKept', v_media_kept,
    'paths', to_jsonb(array_remove(array[v_path, nullif(v_thumb, v_path)], null))
  );
end $$;

revoke execute on function public.menu_delete_cleanup(uuid, uuid) from public, anon, authenticated;
grant execute on function public.menu_delete_cleanup(uuid, uuid) to service_role;

commit;
