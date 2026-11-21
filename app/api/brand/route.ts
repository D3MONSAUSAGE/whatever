import { requireAdmin } from "@/lib/server/auth";
import { rejectSubscriptionWrite } from "@/lib/server/subscription-write";
import { isUuid } from "@/lib/server/crypto";
import { enforceLimit, fail, json, readJson } from "@/lib/server/http";
import { checkArtMedia, getBrand, putBrand } from "@/lib/server/brand";
import { parseBrandPut } from "@/lib/brand-kit";
import { withLocalizedErrors } from "@/lib/server/locale";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withLocalizedErrors(async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const brand = await getBrand(admin.accountId);
  if (brand === "error") return fail("Couldn't load your brand.", 500);
  return json(brand);
});

/** Save the account's brand. Column-only merge: a present null clears, an absent key is left untouched. An empty {} is 400 (Android +13 always sends {primaryColor, accentColor, logoMediaId}). Existing menus change when "Apply to all menus" runs. */
export const PUT = withLocalizedErrors(async function PUT(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const writeBlocked = await rejectSubscriptionWrite(admin.accountId, req);
  if (writeBlocked) return writeBlocked;
  const body = await readJson(req);
  const parsed = parseBrandPut(body);
  if (!parsed.ok) return fail(parsed.error, 400);
  if (parsed.patch.logoMediaId) {
    if (!isUuid(parsed.patch.logoMediaId)) return fail("Choose a logo from your media.", 400);
  }
  const limited = await enforceLimit(`brand:${admin.userId}`, 60, 30, "Too many changes. Wait a minute.");
  if (limited) return limited;
  if (parsed.patch.logoMediaId) {
    const bad = await checkArtMedia(admin.accountId, parsed.patch.logoMediaId, "logo");
    if (bad) return fail(bad.error, bad.status);
  }
  const saved = await putBrand(admin.accountId, body);
  if (!saved.ok) return fail(saved.error, saved.status);
  return json(saved.brand);
});
