import { requireAdmin } from "@/lib/server/auth";
import { fail, json } from "@/lib/server/http";
import { billingEnforced, loadEntitlement, readOrStartTransition, toResponse, transitionEndsAt } from "@/lib/server/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Canonical plan/trial/screen entitlement for the signed-in account (web + mobile). */
export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const e = await loadEntitlement(admin.accountId);
  if (e === "error" || !e) return fail("Couldn't load your plan. Try again.", 503);
  // Enforcement off returns before any transition read, so the clock cannot start.
  const started = billingEnforced() && e.plan === "grandfathered" ? await readOrStartTransition(admin.accountId) : null;
  return json(toResponse(admin.accountId, e, process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin, {
    transitionEndsAt: transitionEndsAt(started),
  }));
}
