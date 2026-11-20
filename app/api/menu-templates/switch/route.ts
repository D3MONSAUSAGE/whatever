import { fail, json, readJson } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/auth";
import { withLocalizedErrors } from "@/lib/server/locale";
import { layoutStudioEnabled, parseLayout } from "@/lib/layout-studio";
import { designById, switchDesign } from "@/lib/menu-designs";
import { ORIGINAL_LAYOUTS, switchToLayout } from "@/lib/menu-designer";
import { boardFit } from "@/lib/board-fit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Change a board's design while keeping its content, photos and colours: the same switchDesign / switchToLayout the
 * web editor runs. Body: { document, to: <catalog template or layout id>, variant?: <template variant id> }.
 * Returns { document, fit }. Saves nothing; send the document to POST /api/layout-studio to keep it.
 */
export const POST = withLocalizedErrors(async function POST(req: Request) {
  if (!layoutStudioEnabled()) return fail("Not found", 404);
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const body = await readJson(req);
  const parsed = parseLayout(body.document);
  if (!parsed.ok) return fail(parsed.error, 400);
  const to = typeof body.to === "string" ? body.to : "";
  const design = designById(to);
  const layout = ORIGINAL_LAYOUTS.find((l) => l.id === to);
  if (!design && !layout) return fail("Choose a template or layout from the catalog.", 400);
  let document = design ? switchDesign(parsed.value, design) : switchToLayout(parsed.value, layout!.template);
  if (body.variant !== undefined && body.variant !== null) {
    if (!design || !design.variants.some((v) => v.id === body.variant)) return fail("Choose one of this template's colour styles.", 400);
    document = { ...document, variant: String(body.variant) };
  }
  return json({ document, fit: boardFit(document) }, 200, { "Cache-Control": "no-store" });
});
