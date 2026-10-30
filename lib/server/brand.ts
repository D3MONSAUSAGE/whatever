import { BUCKET, db } from "./supabase";
import { isMissingSchema } from "./schema";
import { DEFAULT_BRAND, type MenuContent } from "@/lib/menu-templates";
import type { MenuArt } from "./menu-render";

export const BRAND_UNAVAILABLE = "Branding isn't available yet. Try again after the next update.";
const ART_MAX_BYTES = 15 * 1024 * 1024;
const ART_TYPES = new Set(["image/png", "image/jpeg"]);

export type Brand = { primaryColor: string; accentColor: string; logoMediaId: string | null; available: boolean; custom: boolean };

export async function getBrand(accountId: string): Promise<Brand | "error"> {
  const row = await db().from("brand_kits").select("primary_color, accent_color, logo_media_id").eq("account_id", accountId).maybeSingle();
  if (row.error) {
    if (isMissingSchema(row.error)) return { ...DEFAULT_BRAND, logoMediaId: null, available: false, custom: false };
    return "error";
  }
  if (!row.data) return { ...DEFAULT_BRAND, logoMediaId: null, available: true, custom: false };
  return {
    primaryColor: String(row.data.primary_color),
    accentColor: String(row.data.accent_color),
    logoMediaId: row.data.logo_media_id ? String(row.data.logo_media_id) : null,
    available: true,
    custom: true,
  };
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

/** Read an image from storage as a data URI for the renderer. Missing or unsupported files are skipped. */
export async function imageDataUri(accountId: string, mediaId: string | null | undefined) {
  if (!mediaId) return null;
  const row = await db().from("media").select("storage_path, mime_type, size_bytes").eq("id", mediaId).eq("account_id", accountId).maybeSingle();
  if (row.error || !row.data) return null;
  const mime = String(row.data.mime_type);
  if (!ART_TYPES.has(mime) || Number(row.data.size_bytes) > ART_MAX_BYTES) return null;
  const path = String(row.data.storage_path);
  if (!path.startsWith(`${accountId}/`)) return null;
  const file = await db().storage.from(BUCKET).download(path);
  if (file.error || !file.data) return null;
  const bytes = Buffer.from(await file.data.arrayBuffer());
  return `data:${mime};base64,${bytes.toString("base64")}`;
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
