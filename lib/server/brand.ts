import { BUCKET, db } from "./supabase";
import { isMissingSchema } from "./schema";
import { type MenuContent } from "@/lib/menu-templates";
import type { MenuArt } from "./menu-render";
import {
  brandFromRecord,
  brandFromRow,
  defaultBrandResponse,
  mergeBrandRecord,
  parseBrandPut,
  patchWritesIdentity,
  type Brand,
  type BrandRecord,
} from "@/lib/brand-kit";

export type { Brand };

export const BRAND_UNAVAILABLE = "Branding isn't available yet. Try again after the next update.";
export const BRAND_IDENTITY_UNAVAILABLE =
  "Business details, fonts, and extra colours aren't available yet. Try again after the next update.";

const ART_MAX_BYTES = 15 * 1024 * 1024;
const ART_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

const BRAND_FULL_COLUMNS =
  "primary_color, accent_color, logo_media_id, display_name, text_color, background_color, heading_font, body_font, phone, website";
const BRAND_LEGACY_COLUMNS = "primary_color, accent_color, logo_media_id";

export async function getBrand(accountId: string): Promise<Brand | "error"> {
  const full = await db().from("brand_kits").select(BRAND_FULL_COLUMNS).eq("account_id", accountId).maybeSingle();
  if (full.error) {
    if (isMissingSchema(full.error)) {
      const legacy = await db().from("brand_kits").select(BRAND_LEGACY_COLUMNS).eq("account_id", accountId).maybeSingle();
      if (legacy.error) {
        if (isMissingSchema(legacy.error)) return defaultBrandResponse(false);
        return "error";
      }
      if (!legacy.data) return defaultBrandResponse(true);
      return brandFromRow(legacy.data, { available: true, custom: true });
    }
    return "error";
  }
  if (!full.data) return defaultBrandResponse(true);
  return brandFromRow(full.data, { available: true, custom: true });
}

async function loadBrandRecord(accountId: string): Promise<
  { ok: true; record: BrandRecord | null; identityColumns: boolean } | { ok: false; status: number; error: string }
> {
  const full = await db().from("brand_kits").select(BRAND_FULL_COLUMNS).eq("account_id", accountId).maybeSingle();
  if (full.error) {
    if (isMissingSchema(full.error)) {
      const legacy = await db().from("brand_kits").select(BRAND_LEGACY_COLUMNS).eq("account_id", accountId).maybeSingle();
      if (legacy.error) {
        if (isMissingSchema(legacy.error)) return { ok: false, status: 503, error: BRAND_UNAVAILABLE };
        return { ok: false, status: 500, error: "Couldn't load your brand." };
      }
      if (!legacy.data) return { ok: true, record: null, identityColumns: false };
      return {
        ok: true,
        record: {
          primaryColor: String(legacy.data.primary_color),
          accentColor: String(legacy.data.accent_color),
          logoMediaId: legacy.data.logo_media_id ? String(legacy.data.logo_media_id) : null,
          displayName: null,
          textColor: null,
          backgroundColor: null,
          headingFont: null,
          bodyFont: null,
          phone: null,
          website: null,
        },
        identityColumns: false,
      };
    }
    return { ok: false, status: 500, error: "Couldn't load your brand." };
  }
  if (!full.data) return { ok: true, record: null, identityColumns: true };
  const brand = brandFromRow(full.data, { available: true, custom: true });
  const { available: _a, custom: _c, ...record } = brand;
  return { ok: true, record, identityColumns: true };
}

function recordToRow(accountId: string, record: BrandRecord, includeIdentity: boolean) {
  const row: Record<string, unknown> = {
    account_id: accountId,
    primary_color: record.primaryColor,
    accent_color: record.accentColor,
    logo_media_id: record.logoMediaId,
    updated_at: new Date().toISOString(),
  };
  if (includeIdentity) {
    row.display_name = record.displayName;
    row.text_color = record.textColor;
    row.background_color = record.backgroundColor;
    row.heading_font = record.headingFont;
    row.body_font = record.bodyFont;
    row.phone = record.phone;
    row.website = record.website;
  }
  return row;
}

/**
 * Merge a PUT body onto the stored brand. A present key with null clears that
 * field. An absent key is left untouched, so an Android-shaped
 * {primaryColor, accentColor, logoMediaId} payload cannot wipe identity fields.
 */
export async function putBrand(
  accountId: string,
  body: unknown,
): Promise<{ ok: true; brand: Brand } | { ok: false; status: number; error: string }> {
  const parsed = parseBrandPut(body);
  if (!parsed.ok) return { ok: false, status: 400, error: parsed.error };
  const loaded = await loadBrandRecord(accountId);
  if (!loaded.ok) return loaded;
  if (!loaded.identityColumns && patchWritesIdentity(parsed.patch)) {
    return { ok: false, status: 503, error: BRAND_IDENTITY_UNAVAILABLE };
  }
  const merged = mergeBrandRecord(loaded.record, parsed.patch);
  const saved = await db().from("brand_kits").upsert(recordToRow(accountId, merged, loaded.identityColumns));
  if (saved.error) {
    if (isMissingSchema(saved.error)) {
      if (patchWritesIdentity(parsed.patch)) {
        return { ok: false, status: 503, error: BRAND_IDENTITY_UNAVAILABLE };
      }
      const slim = await db().from("brand_kits").upsert(recordToRow(accountId, merged, false));
      if (slim.error) {
        return { ok: false, status: isMissingSchema(slim.error) ? 503 : 500, error: isMissingSchema(slim.error) ? BRAND_UNAVAILABLE : "Couldn't save your brand." };
      }
      return { ok: true, brand: brandFromRecord(merged, { available: true, custom: true }) };
    }
    return { ok: false, status: 500, error: "Couldn't save your brand." };
  }
  return { ok: true, brand: brandFromRecord(merged, { available: true, custom: true }) };
}

/** A logo or photo must be this account's PNG or JPEG image. Returns an error message or null. */
export async function checkArtMedia(accountId: string, mediaId: string, what: "logo" | "photo") {
  const row = await db().from("media").select("id, mime_type, size_bytes").eq("id", mediaId).eq("account_id", accountId).maybeSingle();
  if (row.error) return { status: 500, error: "Couldn't check that image." };
  if (!row.data) return { status: 404, error: `That ${what} isn't in your media library.` };
  if (!ART_TYPES.has(String(row.data.mime_type))) return { status: 400, error: `Use a JPG or PNG image for the ${what}.` };
  if (Number(row.data.size_bytes) > ART_MAX_BYTES) return { status: 400, error: `That ${what} is too large.` };
  return null;
}

/** Read an image from storage. Missing or unsupported files are skipped. */
export async function imageBytes(accountId: string, mediaId: string | null | undefined) {
  if (!mediaId) return null;
  const row = await db().from("media").select("storage_path, mime_type, size_bytes").eq("id", mediaId).eq("account_id", accountId).maybeSingle();
  if (row.error || !row.data) return null;
  const mime = String(row.data.mime_type);
  if (!ART_TYPES.has(mime) || Number(row.data.size_bytes) > ART_MAX_BYTES) return null;
  const path = String(row.data.storage_path);
  if (!path.startsWith(`${accountId}/`)) return null;
  const file = await db().storage.from(BUCKET).download(path);
  if (file.error || !file.data) return null;
  return { bytes: Buffer.from(await file.data.arrayBuffer()), mime };
}

/** Read an image from storage as a data URI for the renderer. Missing or unsupported files are skipped. */
export async function imageDataUri(accountId: string, mediaId: string | null | undefined) {
  const file = await imageBytes(accountId, mediaId);
  if (!file) return null;
  return `data:${file.mime};base64,${file.bytes.toString("base64")}`;
}

export async function artFor(accountId: string, content: Pick<MenuContent, "useBrand" | "photoMediaId">): Promise<MenuArt> {
  const useBrand = content.useBrand !== false;
  const brand = useBrand ? await getBrand(accountId) : null;
  const custom = brand && brand !== "error" && brand.custom ? brand : null;
  const [logo, photo] = await Promise.all([
    custom ? imageDataUri(accountId, custom.logoMediaId) : Promise.resolve(null),
    imageDataUri(accountId, content.photoMediaId),
  ]);
  return {
    brand: custom ? { primaryColor: custom.primaryColor, accentColor: custom.accentColor } : null,
    logo,
    photo,
  };
}
