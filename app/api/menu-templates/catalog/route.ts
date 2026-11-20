import { requireAdmin } from "@/lib/server/auth";
import { json } from "@/lib/server/http";
import { withLocalizedErrors } from "@/lib/server/locale";
import { getBrand } from "@/lib/server/brand";
import { layoutStudioEnabled } from "@/lib/layout-studio";
import { buildCatalog } from "@/lib/menu-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The menu designer catalog for API clients (Flutter): every professional template, original layout and the classic
 * board, with filters, EN/ES names, variants, thumbnails and the seed to create a board. Built from the same source
 * as the web gallery (lib/menu-catalog.ts). Seeds for layouts and the classic board carry this account's Brand Kit,
 * exactly like the web; nothing else about the account is included. Contract: docs/FLUTTER_MANAGEMENT.md.
 */
export const GET = withLocalizedErrors(async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  // A Brand Kit that can't be read leaves the seeds unbranded (the web gallery does the same with no kit).
  const brand = await getBrand(admin.accountId).catch(() => "error" as const);
  const catalog = buildCatalog(brand === "error" ? null : brand);
  return json({ ...catalog, layoutStudio: layoutStudioEnabled() }, 200, { "Cache-Control": "private, no-cache", Vary: "Authorization, Cookie" });
});
