-- Manual rollback for supabase/migrations/0025_brand_kit_identity.sql.
-- Do not auto-run. This file is not a numbered migration and is not applied
-- by Vercel, CI, or the app. Run it by hand in the Supabase SQL editor only
-- if you need to undo 0025.
--
-- What it does:
--   Drops the seven additive identity columns and their CHECK constraints
--   on public.brand_kits. Existing primary_color, accent_color, and
--   logo_media_id values are left intact. No other tables are touched.
--   RLS and grants are left as they are (server-only, from 0008).
--
-- When to run:
--   Only after (or together with) rolling the app back to a revision that
--   does not require the identity columns. The current GET/PUT handlers
--   already fall back if those columns are missing, so a rolled-back app
--   against a still-applied 0025 is also safe (extra columns are ignored).
--
-- This is additive-undo only: it does not restore any identity values that
-- were written after 0025 was applied. Those values are discarded with the
-- columns.

alter table public.brand_kits
  drop constraint if exists brand_kits_display_name_len,
  drop constraint if exists brand_kits_text_color_hex,
  drop constraint if exists brand_kits_background_color_hex,
  drop constraint if exists brand_kits_heading_font,
  drop constraint if exists brand_kits_body_font,
  drop constraint if exists brand_kits_phone_len,
  drop constraint if exists brand_kits_website;

alter table public.brand_kits
  drop column if exists display_name,
  drop column if exists text_color,
  drop column if exists background_color,
  drop column if exists heading_font,
  drop column if exists body_font,
  drop column if exists phone,
  drop column if exists website;
