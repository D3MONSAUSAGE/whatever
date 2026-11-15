-- B2-06: reconnect a re-opened TV to an EXISTING screen (approved by Francisco 2026-11-14 2:09 PM PT).
-- Additive and non-destructive: one new function, no table, column, policy or grant changes on tables.
-- The screen keeps its id, name, content, playlists, schedules and groups; only which TV holds its
-- token changes. Mirrors claim_pairing (0013) but attaches the code to an existing display instead of
-- inserting one, so no screen is added and the plan's screen limit is unaffected.
--
-- Rules:
--   * the screen must belong to the caller's account and still be active (else 'display_not_found');
--   * the code must be fresh: pending, unexpired, and it is claimed exactly once (row lock + status flip);
--   * the old pairing is cut off: the screen's current token is cleared (every player_* lookup is by
--     token_hash, so the old TV gets 401 and returns to its pairing screen), and any earlier hand-off
--     still waiting to be collected for this screen is expired.
-- The TV then collects a new token through the existing /api/player/pair/status hand-off.
--
-- RLS: pairing_sessions stays service-role only (0001), displays policies are unchanged, and this
-- function is SECURITY INVOKER and executable by service_role only. It is called from the API after
-- requireAdmin, with the account id taken from the session.

create or replace function public.reconnect_display(p_code_hash text, p_account_id uuid, p_display_id uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_display_id uuid;
  v_session_id uuid;
begin
  select id into v_display_id from public.displays
    where id = p_display_id and account_id = p_account_id and status = 'active'
    for update;
  if v_display_id is null then
    raise exception 'display_not_found' using errcode = 'P0001';
  end if;

  select id into v_session_id from public.pairing_sessions
    where code_hash = p_code_hash and status = 'pending' and expires_at > now()
    for update skip locked
    limit 1;
  if v_session_id is null then
    return null; -- wrong, expired or already used code: nothing is changed
  end if;

  update public.displays set token_hash = null where id = v_display_id;
  update public.pairing_sessions set status = 'expired'
    where display_id = v_display_id and status = 'claimed';

  update public.pairing_sessions
    set status = 'claimed', display_id = v_display_id, claimed_at = now()
    where id = v_session_id;

  return v_display_id;
end $$;

revoke execute on function public.reconnect_display(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.reconnect_display(text, uuid, uuid) to service_role;
