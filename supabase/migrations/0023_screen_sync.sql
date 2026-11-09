-- When the TV accepts a new version, before it has painted it.
-- Playing stays on confirmed_version / confirmed_at from report_playing.
alter table public.displays
  add column if not exists acknowledged_version integer,
  add column if not exists acknowledged_at timestamptz;
