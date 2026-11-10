import { db } from "@/lib/server/supabase";
import { requireAdmin } from "@/lib/server/auth";
import { fail, json } from "@/lib/server/http";
import { portalAccess, portalReturnUrl, portalSessionParams, stripe } from "@/lib/server/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Opens the Stripe Customer Portal for this signed-in org only.
 * The body is ignored. A missing Stripe customer returns the plan picker instead of an error.
 */
export async function POST(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const a = await db().from("accounts").select("id, owner_user_id, stripe_customer_id").eq("id", admin.accountId).maybeSingle();
  if (a.error || !a.data) return fail("Couldn't load your account.", 500);
  const access = portalAccess({
    userId: admin.userId,
    ownerUserId: String(a.data.owner_user_id ?? ""),
    customerId: typeof a.data.stripe_customer_id === "string" ? a.data.stripe_customer_id : null,
  });
  if (!access.ok) {
    if (access.code === "not_owner") return json({ error: "Only the account owner can manage billing.", code: "not_owner" }, 403);
    return json({ action: "plans" });
  }
  const s = stripe();
  if (!s) return json({ error: "Billing isn't available yet.", code: "billing_unavailable" }, 503);
  const session = await s.billingPortal.sessions.create(portalSessionParams(access.customerId, portalReturnUrl(new URL(req.url).origin)));
  return json({ url: session.url });
}
