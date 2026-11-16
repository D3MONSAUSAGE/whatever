-- DA-2 (t348u): developer-only Customer Accounts list, read-only over existing data.
-- Additive only: one new function. No table, column, trigger, policy, grant, purge or billing rule is
-- changed, nothing is written, and no data is copied anywhere (the list is read live on every request,
-- so a deleted account or user disappears from it as soon as the deletion runs).
-- Depends on 0029 (developer_users, analytics_exclusions, is_developer, dev_analytics_referrer_host)
-- and on account_entitlement (0013/0015) for the trial state. Safe to re-run.
-- Rollback: supabase/rollback/0030_dev_accounts.sql.
--
-- Privacy: per person, the sign-up EMAIL (developers asked to see who registered), dates, plan/trial/
-- subscription status values, screen counts and timestamps, whether a TV confirmed content, the KIND of the
-- latest owner action (never subject_name/detail), last sign-in time, the first-touch UTM source/medium/
-- campaign and the referrer HOST, and whether a deletion is pending. Never: passwords or hashes, tokens,
-- Stripe customer/subscription ids, card data, names, file names, media, playlists, menus, messages, IPs,
-- user agents or locations.

begin;

create or replace function public.dev_accounts_list(p_actor uuid)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_claims text := nullif(current_setting('request.jwt.claims', true), '');
  v_role text;
begin
  -- Same backstop as dev_analytics_snapshot: only the service role (or a direct owner session), and only
  -- for an allowlisted developer. A route that forgot its own check still gets nothing.
  v_role := coalesce(v_claims::jsonb->>'role', nullif(current_setting('request.jwt.claim.role', true), ''));
  if not coalesce(v_role = 'service_role' or (v_role is null and session_user in ('postgres', 'supabase_admin')), false) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if not public.is_developer(p_actor) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'generated_at', now(),
    'accounts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id,
        'email', u.email,
        'user_created_at', u.created_at,
        'created_at', a.created_at,
        'user_confirmed', u.email_confirmed_at is not null,
        'last_sign_in_at', u.last_sign_in_at,
        'plan', a.plan,
        'state', e.state,
        'trial_started_at', e.trial_started_at,
        'trial_ends_at', e.trial_ends_at,
        'playback_ends_at', e.playback_ends_at,
        'subscription_status', a.subscription_status,
        'current_period_end', a.current_period_end,
        'cancel_at_period_end', coalesce(a.cancel_at_period_end, false),
        'comp', (a.plan = 'comp' or a.comp_note is not null),
        'email_domain', lower(split_part(coalesce(u.email, ''), '@', 2)),
        'plus_alias', position('+' in split_part(coalesce(u.email, ''), '@', 1)) > 0,
        'excluded_reason', x.reason,
        'screens_active', coalesce(d.active, 0),
        'screens_ever', coalesce(d.ever, 0),
        'first_paired_at', d.first_paired_at,
        'last_check_in_at', d.last_seen_at,
        'ever_confirmed', coalesce(d.ever_confirmed, false),
        'last_confirmed_at', d.last_confirmed_at,
        'first_playback_at', (select min(p.at) from public.playback_events p where p.account_id = a.id),
        'last_owner_action_at', o.at,
        'last_owner_action_kind', o.kind,
        'utm_source', left(a.signup_attribution->>'utm_source', 80),
        'utm_medium', left(a.signup_attribution->>'utm_medium', 80),
        'utm_campaign', left(a.signup_attribution->>'utm_campaign', 80),
        'referrer_host', public.dev_analytics_referrer_host(a.signup_attribution->>'referrer'),
        'deletion_pending', exists (select 1 from public.account_deletion_requests r
                                    where r.account_id = a.id and r.status in ('pending', 'processing'))
      ) order by u.created_at desc)
      from public.accounts a
      join auth.users u on u.id = a.owner_user_id
      left join public.analytics_exclusions x on x.account_id = a.id
      left join lateral public.account_entitlement(a.id) e on true
      left join lateral (
        select count(*) filter (where dd.status = 'active') as active,
               count(*) as ever,
               min(dd.created_at) as first_paired_at,
               max(dd.last_seen_at) as last_seen_at,
               bool_or(dd.confirmed_at is not null) as ever_confirmed,
               max(dd.confirmed_at) as last_confirmed_at
          from public.displays dd where dd.account_id = a.id
      ) d on true
      -- Latest meaningful owner action. Kind only; subject_name and detail are never read.
      left join lateral (
        select ev.at, ev.kind from public.activity_events ev
         where ev.account_id = a.id
           and ev.kind in ('media.uploaded', 'playlist.published', 'screen.paired', 'screen.content_changed',
                           'schedule.created', 'schedule.updated', 'schedule.deleted')
         order by ev.at desc limit 1
      ) o on true
    ), '[]'::jsonb),
    -- People who signed up but never reached an authenticated API call, so no account row exists yet.
    'users_without_account', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', u.id,
        'email', u.email,
        'user_created_at', u.created_at,
        'user_confirmed', u.email_confirmed_at is not null,
        'last_sign_in_at', u.last_sign_in_at,
        'email_domain', lower(split_part(coalesce(u.email, ''), '@', 2)),
        'plus_alias', position('+' in split_part(coalesce(u.email, ''), '@', 1)) > 0
      ) order by u.created_at desc)
      from auth.users u
      where not exists (select 1 from public.accounts a where a.owner_user_id = u.id)
    ), '[]'::jsonb),
    'coverage', jsonb_build_object(
      'activity_from', (select min(at) from public.activity_events),
      'playback_from', (select min(at) from public.playback_events))
  );
end $$;

revoke execute on function public.dev_accounts_list(uuid) from public, anon, authenticated;
grant execute on function public.dev_accounts_list(uuid) to service_role;

commit;
