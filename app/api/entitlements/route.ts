import { requireAdmin } from "@/lib/server/auth";
import { fail, json } from "@/lib/server/http";
import { loadEffectiveEntitlement, readTransitionStart, toResponse, transitionEndsAt } from "@/lib/server/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Canonical plan/trial/screen entitlement for the signed-in account (web + mobile). */
export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const e = await loadEffectiveEntitlement(admin.accountId);
  if (e === "error" || !e) return fail("Couldn't load your plan. Try again.", 503);
  // Read only. The reminder dispatcher stamps this after the notice email succeeds.
  const started = e.plan === "grandfathered" ? await readTransitionStart(admin.accountId) : null;
  return json(toResponse(admin.accountId, e, process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin, {
    transitionEndsAt: transitionEndsAt(started),
  }));
}
