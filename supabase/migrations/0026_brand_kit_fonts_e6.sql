-- E6: widen the Brand Kit font checks to the bundled faces in lib/board-fonts.ts.
-- Non-destructive: every existing value ('inter', 'noto-serif', null) stays valid; no rows change.
-- Rollback (only if no row uses a new face): re-add the 0025 checks with ('inter', 'noto-serif').
alter table public.brand_kits drop constraint if exists brand_kits_heading_font;
alter table public.brand_kits
  add constraint brand_kits_heading_font
  check (heading_font is null or heading_font in ('inter', 'noto-serif', 'oswald', 'montserrat', 'bebas-neue', 'lobster'));

alter table public.brand_kits drop constraint if exists brand_kits_body_font;
alter table public.brand_kits
  add constraint brand_kits_body_font
  check (body_font is null or body_font in ('inter', 'noto-serif', 'oswald', 'montserrat', 'bebas-neue', 'lobster'));

comment on column public.brand_kits.heading_font is 'Heading face: one of the bundled faces in lib/board-fonts.ts (inter, noto-serif, oswald, montserrat, bebas-neue, lobster).';
comment on column public.brand_kits.body_font is 'Body face: one of the bundled faces in lib/board-fonts.ts.';
