import { requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/supabase";
import { isUuid } from "@/lib/server/crypto";
import { enforceLimit, fail, json, readJson } from "@/lib/server/http";
import { BRAND_UNAVAILABLE, checkArtMedia, getBrand } from "@/lib/server/brand";
import { isMissingSchema } from "@/lib/server/schema";
import { normalizeHex } from "@/lib/menu-templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const brand = await getBrand(admin.accountId);
  if (brand === "error") return fail("Couldn't load your brand.", 500);
  return json(brand);
}

/** Save the account's logo and colours. Existing menus change when "Apply to all menus" runs. */
export async function PUT(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const body = await readJson(req);
  const primary = normalizeHex(body.primaryColor);
  const accent = normalizeHex(body.accentColor);
  if (!primary || !accent) return fail("Choose colours like #0066ff.", 400);
  const logo = body.logoMediaId ?? null;
  if (logo !== null && (typeof logo !== "string" || !isUuid(logo))) return fail("Choose a logo from your media.", 400);
  const limited = await enforceLimit(`brand:${admin.userId}`, 60, 30, "Too many changes. Wait a minute.");
  if (limited) return limited;
  if (logo) {
    const bad = await checkArtMedia(admin.accountId, logo, "logo");
    if (bad) return fail(bad.error, bad.status);
  }
  const saved = await db().from("brand_kits").upsert({
    account_id: admin.accountId, primary_color: primary, accent_color: accent, logo_media_id: logo, updated_at: new Date().toISOString(),
  });
  if (saved.error) return isMissingSchema(saved.error) ? fail(BRAND_UNAVAILABLE, 503) : fail("Couldn't save your brand.", 500);
  return json({ primaryColor: primary, accentColor: accent, logoMediaId: logo, available: true, custom: true });
}
