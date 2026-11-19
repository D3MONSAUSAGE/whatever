-- 0032 Signup funnel counters (developer console "Website traffic" tab, "Signup funnel" panel).
-- Additive; touches no existing table, account, subscription or billing row. Safe to re-run.
-- Requires 0031 (traffic_caller_is_service) and 0029 (is_developer).
--
-- Privacy design: one plain daily counter per (event, detail). Events and details are a fixed allow-list
-- (trial CTA clicks by page position, signup page views, submits, reduced error codes, template previews
-- used). No email, account or user id, IP address, user agent, cookie or visitor hash is stored.
-- Rows older than 400 days are deleted. Only the service role can read or write.
-- Rollback: supabase/rollback/0032_funnel_daily.sql

begin;

create table if not exists public.funnel_daily (
  day date not null,
  event text not null check (event in ('cta_click', 'signup_view', 'signup_submit', 'signup_error', 'template_try')),
  detail text not null default '' check (detail ~ '^[a-z_]{0,30}$'),
  count integer not null default 0 check (count >= 0),
  primary key (day, event, detail)
);

alter table public.funnel_daily enable row level security;
revoke all on public.funnel_daily from public, anon, authenticated;

create or replace function public.funnel_record(p_day date, p_event text, p_detail text)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not public.traffic_caller_is_service() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  insert into public.funnel_daily (day, event, detail, count)
  values (p_day, p_event, coalesce(p_detail, ''), 1)
  on conflict (day, event, detail) do update set count = public.funnel_daily.count + 1;
  delete from public.funnel_daily where day < p_day - 400;
end $$;

create or replace function public.dev_funnel_snapshot(p_actor uuid, p_from date, p_to date)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_to date := coalesce(p_to, current_date);
  v_from date := greatest(coalesce(p_from, v_to - 30), v_to - 400);
begin
  if not public.traffic_caller_is_service() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if not public.is_developer(p_actor) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'first_day', (select min(day) from public.funnel_daily),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object('event', event, 'detail', detail, 'count', n) order by event, detail)
      from (
        select event, detail, sum(count)::int as n
        from public.funnel_daily where day between v_from and v_to group by event, detail
      ) r
    ), '[]'::jsonb)
  );
end $$;

revoke execute on function public.funnel_record(date, text, text) from public, anon, authenticated;
revoke execute on function public.dev_funnel_snapshot(uuid, date, date) from public, anon, authenticated;
grant execute on function public.funnel_record(date, text, text) to service_role;
grant execute on function public.dev_funnel_snapshot(uuid, date, date) to service_role;

commit;
