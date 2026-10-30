import { db } from "@/lib/server/supabase";
import { requireAdmin } from "@/lib/server/auth";
import { fail, json, readJson } from "@/lib/server/http";
import { isMissingSchema } from "@/lib/server/schema";
import { onboardingState } from "@/lib/server/onboarding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Shared setup progress for the website and the mobile app. Derived from real data.
export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const state = await onboardingState(admin.accountId, admin.email);
  if (state === "error") return fail("Couldn't load your setup progress.", 500);
  return json(state);
}

// { dismissed: boolean } hides or shows the tracker; { confirmBusiness: true } completes the business step.
export async function POST(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const body = await readJson(req);
  const patch: { onboarding_dismissed_at?: string | null; business_confirmed_at?: string } = {};
  if ("dismissed" in body) {
    if (typeof body.dismissed !== "boolean") return fail("dismissed must be true or false.", 400);
    patch.onboarding_dismissed_at = body.dismissed ? new Date().toISOString() : null;
  }
  if ("confirmBusiness" in body) {
    if (body.confirmBusiness !== true) return fail("confirmBusiness must be true.", 400);
    patch.business_confirmed_at = new Date().toISOString();
  }
  if (!Object.keys(patch).length) return fail("Nothing to update.", 400);
  const r = await db().from("accounts").update(patch).eq("id", admin.accountId);
  if (r.error) return fail(isMissingSchema(r.error) ? "Setup progress isn't available yet." : "Couldn't save. Try again.", isMissingSchema(r.error) ? 503 : 500);
  const state = await onboardingState(admin.accountId, admin.email);
  if (state === "error") return fail("Couldn't load your setup progress.", 500);
  return json(state);
}
