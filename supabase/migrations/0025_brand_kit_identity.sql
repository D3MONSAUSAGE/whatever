-- Additive identity fields on brand_kits. Nullable, no defaults, no backfill.
-- Existing rows stay unchanged. RLS and grants are left as they are
-- (server-only: RLS on, no policies, revoke from anon/authenticated — 0008).

alter table public.brand_kits
  add column if not exists display_name text,
  add column if not exists text_color text,
  add column if not exists background_color text,
  add column if not exists heading_font text,
  add column if not exists body_font text,
  add column if not exists phone text,
  add column if not exists website text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'brand_kits_display_name_len') then
    alter table public.brand_kits
      add constraint brand_kits_display_name_len
      check (display_name is null or char_length(display_name) between 1 and 80);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'brand_kits_text_color_hex') then
    alter table public.brand_kits
      add constraint brand_kits_text_color_hex
      check (text_color is null or text_color ~ '^#[0-9a-f]{6}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'brand_kits_background_color_hex') then
    alter table public.brand_kits
      add constraint brand_kits_background_color_hex
      check (background_color is null or background_color ~ '^#[0-9a-f]{6}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'brand_kits_heading_font') then
    alter table public.brand_kits
      add constraint brand_kits_heading_font
      check (heading_font is null or heading_font in ('inter', 'noto-serif'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'brand_kits_body_font') then
    alter table public.brand_kits
      add constraint brand_kits_body_font
      check (body_font is null or body_font in ('inter', 'noto-serif'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'brand_kits_phone_len') then
    alter table public.brand_kits
      add constraint brand_kits_phone_len
      check (phone is null or char_length(phone) between 1 and 32);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'brand_kits_website') then
    alter table public.brand_kits
      add constraint brand_kits_website
      check (website is null or (website ~ '^https?://' and char_length(website) between 1 and 200));
  end if;
end $$;

comment on column public.brand_kits.display_name is 'Business display name. Seeded onto the title slot of new boards only.';
comment on column public.brand_kits.text_color is 'Body text colour as #rrggbb. Nullable; no default.';
comment on column public.brand_kits.background_color is 'Board background colour as #rrggbb. Nullable; no default.';
comment on column public.brand_kits.heading_font is 'Heading face: inter or noto-serif, the fonts Layout documents already support.';
comment on column public.brand_kits.body_font is 'Body face: inter or noto-serif.';
comment on column public.brand_kits.phone is 'Short contact phone. Seeded onto the footer of new boards that have a footer slot.';
comment on column public.brand_kits.website is 'https?:// URL, at most 200 characters.';
