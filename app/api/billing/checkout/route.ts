import { db } from "@/lib/server/supabase";
import { requireAdmin } from "@/lib/server/auth";
import { enforceLimit, fail, json, readJson } from "@/lib/server/http";
import { billingDiagnostics, checkoutAvailable, checkoutSessionRequest, PAID_PLANS, priceFor, stripe, stripeKey, type PaidPlan } from "@/lib/server/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// { plan } -> { url } for a Stripe Checkout (test mode) subscription. No card is taken by Pekko.
export async function POST(req: Request) {
  const s = stripe();
  if (!s) return json({ error: "Checkout isn't available yet.", code: "billing_unavailable" }, 503);
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const limited = await enforceLimit(`checkout:${admin.userId}`, 600, 10, "Too many attempts. Try again shortly.");
  if (limited) return limited;
  const body = await readJson(req);
  const plan = body.plan as PaidPlan;
  if (!PAID_PLANS.includes(plan)) return json({ error: "Choose a plan.", code: "plan" }, 400);
  const price = priceFor(plan);
  if (!price) return json({ error: "Checkout isn't available yet.", code: "billing_unavailable" }, 503);
  const a = await db().from("accounts").select("id, owner_user_id, stripe_customer_id").eq("id", admin.accountId).maybeSingle();
  if (a.error || !a.data) return fail("Couldn't load your account.", 500);
  if (a.data.owner_user_id !== admin.userId) return json({ error: "Only the account owner can change the plan.", code: "not_owner" }, 403);
  const origin = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || new URL(req.url).origin).replace(/\/+$/, "");
  const { params, options } = checkoutSessionRequest({
    price,
    accountId: admin.accountId,
    email: admin.email,
    customerId: a.data.stripe_customer_id,
    origin,
    managedPayments: process.env.STRIPE_MANAGED_PAYMENTS,
    secretKey: stripeKey() ?? "",
  });
  const session = await s.checkout.sessions.create(params, options);
  return json({ url: session.url });
}

// Public: whether online checkout is switched on (no secrets returned).
// Preview-only ?debug=1 lists missing variable names. Values are never included.
export async function GET(req: Request) {
  const debug = new URL(req.url).searchParams.get("debug") === "1" && process.env.VERCEL_ENV === "preview";
  if (!debug) return json({ available: checkoutAvailable() });
  const report = billingDiagnostics();
  return json({
    available: report.available,
    webhook: report.webhook,
    missing: report.missing,
    rejected: report.rejected,
    shapes: report.shapes,
    sources: report.sources,
  });
}
