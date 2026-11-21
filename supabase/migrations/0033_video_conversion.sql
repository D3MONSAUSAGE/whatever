-- 0033 Video conversion jobs and a monthly processing budget ledger.
-- Additive; does not alter accounts, subscriptions, billing, or the November 11 backup tables.
-- Reuses media.processing_status (null means ready, same as today). Existing customer videos stay playable.
-- player_playlist and player_state gain a processing_status filter so incomplete conversions never reach TVs.
-- Rollback: supabase/rollback/0033_video_conversion.sql
--
-- Budget is $15.00 per America/Los_Angeles calendar month, stored as thousandths of a US dollar (millis).
-- HD rate used for reserves: 15 millis per output minute ($0.015), Coconut pricing fetched 21 Nov 2026.
-- Jobs are reserved atomically (row lock on the month) before any provider API call.
-- The feature is still off until HEVC_CONVERSION_ENABLED=1 and a provider key are set; this schema is inert until then.

begin;

create table if not exists public.video_conversion_months (
  month date primary key,
  cap_millis integer not null default 15000 check (cap_millis >= 0),
  reserved_millis integer not null default 0 check (reserved_millis >= 0),
  spent_millis integer not null default 0 check (spent_millis >= 0),
  job_count integer not null default 0 check (job_count >= 0),
  failure_count integer not null default 0 check (failure_count >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.video_conversion_jobs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  media_id uuid not null references public.media(id) on delete cascade,
  month date not null references public.video_conversion_months(month),
  status text not null,
  provider text not null default 'coconut',
  provider_job_id text,
  webhook_token_hash text not null,
  reserved_millis integer not null check (reserved_millis > 0),
  actual_millis integer,
  input_codec text,
  input_duration_ms integer,
  input_width integer,
  input_height integer,
  input_path text not null,
  output_path text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint video_conversion_jobs_status_check
    check (status in ('reserved', 'submitted', 'processing', 'ready', 'failed', 'released')),
  constraint video_conversion_jobs_error_check
    check (error is null or char_length(error) <= 80),
  constraint video_conversion_jobs_actual_check
    check (actual_millis is null or actual_millis >= 0),
  constraint video_conversion_jobs_path_check
    check (input_path like account_id::text || '/%')
);

create unique index if not exists video_conversion_jobs_active_media
  on public.video_conversion_jobs (media_id)
  where status in ('reserved', 'submitted', 'processing');

create index if not exists video_conversion_jobs_provider_job
  on public.video_conversion_jobs (provider_job_id)
  where provider_job_id is not null;

create index if not exists video_conversion_jobs_month
  on public.video_conversion_jobs (month);

alter table public.video_conversion_months enable row level security;
alter table public.video_conversion_jobs enable row level security;
revoke all on public.video_conversion_months from public, anon, authenticated;
revoke all on public.video_conversion_jobs from public, anon, authenticated;
revoke all on public.video_conversion_months from service_role;
revoke all on public.video_conversion_jobs from service_role;
grant select, insert, update, delete on public.video_conversion_months to service_role;
grant select, insert, update, delete on public.video_conversion_jobs to service_role;

create or replace function public._video_conversion_require_service()
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_role text;
begin
  v_role := current_setting('request.jwt.claims', true)::jsonb ->> 'role';
  if not coalesce(v_role = 'service_role' or (v_role is null and session_user in ('postgres', 'supabase_admin')), false) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
end $$;

-- Reserve worst-case cost on the month row, then insert the job. Returns the job id, or raises budget_exhausted.
create or replace function public.reserve_video_conversion(
  p_account_id uuid,
  p_media_id uuid,
  p_month date,
  p_reserved_millis integer,
  p_webhook_token_hash text,
  p_input_codec text,
  p_input_duration_ms integer,
  p_input_width integer,
  p_input_height integer,
  p_input_path text,
  p_output_path text,
  p_provider text default 'coconut'
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cap integer;
  v_reserved integer;
  v_spent integer;
  v_id uuid;
begin
  perform public._video_conversion_require_service();
  if p_reserved_millis is null or p_reserved_millis <= 0 or p_reserved_millis > 15000 then
    raise exception 'invalid_reserve' using errcode = '22023';
  end if;
  if p_month is null or p_webhook_token_hash is null or char_length(p_webhook_token_hash) < 32 then
    raise exception 'invalid_reserve' using errcode = '22023';
  end if;
  if p_input_path is null or p_input_path not like p_account_id::text || '/%' then
    raise exception 'invalid_path' using errcode = '22023';
  end if;
  if p_output_path is not null and p_output_path not like p_account_id::text || '/%' then
    raise exception 'invalid_path' using errcode = '22023';
  end if;
  if not exists (select 1 from public.media where id = p_media_id and account_id = p_account_id) then
    raise exception 'media_not_found' using errcode = 'P0002';
  end if;

  insert into public.video_conversion_months (month)
    values (p_month)
    on conflict (month) do nothing;

  select cap_millis, reserved_millis, spent_millis
    into v_cap, v_reserved, v_spent
    from public.video_conversion_months
    where month = p_month
    for update;

  if v_reserved + v_spent + p_reserved_millis > v_cap then
    raise exception 'budget_exhausted' using errcode = 'P0001';
  end if;

  update public.video_conversion_months
    set reserved_millis = reserved_millis + p_reserved_millis,
        job_count = job_count + 1,
        updated_at = now()
    where month = p_month;

  insert into public.video_conversion_jobs (
    account_id, media_id, month, status, provider, webhook_token_hash,
    reserved_millis, input_codec, input_duration_ms, input_width, input_height,
    input_path, output_path
  ) values (
    p_account_id, p_media_id, p_month, 'reserved', coalesce(nullif(p_provider, ''), 'coconut'),
    p_webhook_token_hash, p_reserved_millis, p_input_codec, p_input_duration_ms,
    p_input_width, p_input_height, p_input_path, p_output_path
  ) returning id into v_id;

  return v_id;
end $$;

create or replace function public.mark_video_conversion_submitted(
  p_job_id uuid,
  p_provider_job_id text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public._video_conversion_require_service();
  update public.video_conversion_jobs
    set status = 'submitted',
        provider_job_id = p_provider_job_id,
        updated_at = now()
    where id = p_job_id
      and status in ('reserved', 'submitted');
  return found;
end $$;

-- Idempotent completion. Failed provider jobs should pass p_actual_millis = 0 (Coconut does not charge failures).
-- Invalid output after a successful provider job should pass the reserved amount so the ledger still tracks spend.
create or replace function public.complete_video_conversion(
  p_job_id uuid,
  p_status text,
  p_actual_millis integer,
  p_error text default null
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_reserved integer;
  v_month date;
  v_actual integer;
begin
  perform public._video_conversion_require_service();
  if p_status not in ('ready', 'failed') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  if p_actual_millis is null or p_actual_millis < 0 then
    raise exception 'invalid_actual' using errcode = '22023';
  end if;

  select status, reserved_millis, month
    into v_status, v_reserved, v_month
    from public.video_conversion_jobs
    where id = p_job_id
    for update;
  if not found then
    return false;
  end if;

  -- Replay of a finished job is a no-op.
  if v_status in ('ready', 'failed', 'released') then
    return true;
  end if;

  v_actual := least(p_actual_millis, v_reserved);

  update public.video_conversion_months
    set reserved_millis = reserved_millis - v_reserved,
        spent_millis = spent_millis + v_actual,
        failure_count = failure_count + case when p_status = 'failed' then 1 else 0 end,
        updated_at = now()
    where month = v_month;

  update public.video_conversion_jobs
    set status = p_status,
        actual_millis = v_actual,
        error = nullif(p_error, ''),
        completed_at = now(),
        updated_at = now()
    where id = p_job_id;

  return true;
end $$;

revoke all on function public._video_conversion_require_service() from public, anon, authenticated;
revoke all on function public.reserve_video_conversion(uuid, uuid, date, integer, text, text, integer, integer, integer, text, text, text) from public, anon, authenticated;
revoke all on function public.mark_video_conversion_submitted(uuid, text) from public, anon, authenticated;
revoke all on function public.complete_video_conversion(uuid, text, integer, text) from public, anon, authenticated;
grant execute on function public._video_conversion_require_service() to service_role;
grant execute on function public.reserve_video_conversion(uuid, uuid, date, integer, text, text, integer, integer, integer, text, text, text) to service_role;
grant execute on function public.mark_video_conversion_submitted(uuid, text) to service_role;
grant execute on function public.complete_video_conversion(uuid, text, integer, text) to service_role;

-- TV playlist: skip media that is still processing or has failed. Existing rows (null) stay included.
create or replace function public.player_playlist(p_token_hash text)
returns table (
  playlist_id uuid,
  transition text,
  playback_mode text,
  "position" integer,
  media_id uuid,
  storage_path text,
  duration_ms integer,
  kind text,
  width integer,
  height integer,
  media_duration_ms integer
)
language sql
set search_path = ''
as $$
  select pl.id,
         pl.published_transition,
         coalesce(pl.published_playback_mode, 'auto'),
         pi.position,
         pi.media_id,
         m.storage_path,
         pi.duration_ms,
         coalesce(m.kind, 'image'),
         m.width,
         m.height,
         m.duration_ms
  from public.displays d
  join public.playlists pl on pl.id = d.assigned_playlist_id
  join public.playlist_items pi on pi.playlist_id = pl.id and pi.kind = 'published'
  join public.media m on m.id = pi.media_id and m.account_id = d.account_id
  where d.token_hash = p_token_hash
    and d.status = 'active'
    and d.assigned_media_id is null
    and (m.processing_status is null or m.processing_status = 'ready')
  order by pi.position;
$$;

revoke execute on function public.player_playlist(text) from public, anon, authenticated;
grant execute on function public.player_playlist(text) to service_role;

-- Single assigned image: do not sign or return a file that is still processing.
create or replace function public.player_state(p_token_hash text)
returns table (display_id uuid, content_version integer, media_id uuid, storage_path text)
language sql
set search_path = ''
as $$
  with beat as (
    update public.displays set last_seen_at = now()
    where token_hash = p_token_hash and status = 'active'
      and (last_seen_at is null or last_seen_at < now() - interval '30 seconds')
    returning id
  )
  select d.id, d.content_version, m.id, m.storage_path
  from public.displays d
  left join public.media m on m.id = d.assigned_media_id
    and (m.processing_status is null or m.processing_status = 'ready')
  left join beat on true
  where d.token_hash = p_token_hash and d.status = 'active';
$$;

revoke execute on function public.player_state(text) from public, anon, authenticated;
grant execute on function public.player_state(text) to service_role;

commit;
