-- Rollback for 0031: removes only the new function. DELETE /api/menus/{id} falls back to deleting just
-- the menu row (the behaviour before 0031) when the function is missing.
begin;
drop function if exists public.menu_delete_cleanup(uuid, uuid);
commit;
