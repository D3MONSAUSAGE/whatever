import { db } from "@/lib/server/supabase";
import { requireAdmin } from "@/lib/server/auth";
import { enforceLimit, fail, json, readJson } from "@/lib/server/http";
import { billingDiagnostics, billingReturnOrigin, checkoutAction, checkoutAvailable, checkoutBlocked, checkoutSessionRequest, PAID_PLANS, planChangePaymentFailed, priceFor, stripe, stripeKey, subscriptionPriceChange, type PaidPlan } from "@/lib/server/stripe";

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
  const a = await db().from("accounts").select("id, owner_user_id, stripe_customer_id, stripe_subscription_id, subscription_status").eq("id", admin.accountId).maybeSingle();
  if (a.error || !a.data) return fail("Couldn't load your account.", 500);
  if (a.data.owner_user_id !== admin.userId) return json({ error: "Only the account owner can change the plan.", code: "not_owner" }, 403);
  if (checkoutBlocked(a.data.subscription_status)) {
    if (a.data.subscription_status === "past_due" || !a.data.stripe_subscription_id) {
      return json({ error: "Use Manage billing to change this plan.", code: "subscription_exists", action: "portal" }, 409);
    }
    const current = await s.subscriptions.retrieve(String(a.data.stripe_subscription_id));
    const item = current.items.data[0];
    const action = checkoutAction({
      status: a.data.subscription_status,
      subscriptionId: a.data.stripe_subscription_id,
      currentPriceId: item?.price.id ?? null,
      nextPriceId: price,
    });
    if (action === "same") return json({ updated: false, plan });
    if (action !== "update" || !item) {
      return json({ error: "Use Manage billing to change this plan.", code: "subscription_exists", action: "portal" }, 409);
    }
    try {
      await s.subscriptions.update(current.id, subscriptionPriceChange({
        subscriptionItemId: item.id,
        price,
        trialEnd: current.status === "trialing" && typeof current.trial_end === "number" ? current.trial_end : null,
      }));
    } catch (err) {
      if (planChangePaymentFailed(err)) {
        return json({ error: "Your card was declined for this plan change, so your plan didn't change. Update your card in Manage billing, then try again.", code: "payment_failed", action: "portal" }, 402);
      }
      throw err;
    }
    return json({ updated: true, plan });
  }
  const origin = billingReturnOrigin(new URL(req.url).origin);
  const built = checkoutSessionRequest({
    price,
    accountId: admin.accountId,
    email: admin.email,
    customerId: a.data.stripe_customer_id,
    origin,
    managedPayments: process.env.STRIPE_MANAGED_PAYMENTS,
    secretKey: stripeKey() ?? "",
  });
  if (!built.ok) return json({ error: built.error, code: built.code }, 503);
  const session = await s.checkout.sessions.create(built.params, built.options);
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
