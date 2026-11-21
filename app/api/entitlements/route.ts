import { requireAdmin } from "@/lib/server/auth";
import { json } from "@/lib/server/http";
import { withLocalizedErrors } from "@/lib/server/locale";
import { buildEntitlementsResponse, loadEffectiveEntitlement, readTransitionStart, transitionEndsAt } from "@/lib/server/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Canonical plan/trial/screen entitlement for the signed-in account (web + mobile). */
export const GET = withLocalizedErrors(async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const e = await loadEffectiveEntitlement(admin.accountId);
  if (e === "error" || !e) return json({ error: "Couldn't load your plan. Try again.", code: "unavailable" }, 503, { "Retry-After": "5" });
  // Read only. The reminder dispatcher stamps this after the notice email succeeds.
  const started = e.plan === "grandfathered" ? await readTransitionStart(admin.accountId) : null;
  return json(await buildEntitlementsResponse(req, admin.accountId, admin.userId, e, {
    transitionEndsAt: transitionEndsAt(started),
  }));
});
