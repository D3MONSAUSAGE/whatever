import { db } from "@/lib/server/supabase";
import { requireAdmin } from "@/lib/server/auth";
import { enforceLimit, fail, json, readJson } from "@/lib/server/http";
import { isMissingSchema } from "@/lib/server/schema";
import { CHECKOUT_CLEAR_PATCH, checkoutPendingFromRow, checkoutSessionPatch, expireOwnCheckoutSession, writeAccountBillingPatch } from "@/lib/server/billing-status";
import { checkoutSubmitMessage } from "@/lib/server/billing-copy";
import { entitlementsLocale } from "@/lib/server/locale";
import { PLANS } from "@/lib/plans";
import { cappedTrialEndsAt } from "@/lib/server/entitlements";
import { billingDiagnostics, billingMode, billingReturnOrigin, checkoutAction, checkoutAvailable, checkoutBlocked, checkoutSessionMatchesCharge, checkoutSessionRequest, checkoutTrialEnd, PAID_PLANS, planChangePaymentFailed, priceFor, stripe, stripeKey, subscriptionPriceChange, type PaidPlan } from "@/lib/server/stripe";

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
  const COLS = "id, owner_user_id, stripe_customer_id, stripe_subscription_id, subscription_status, trial_started_at, trial_ends_at, checkout_session_id, checkout_session_price, checkout_session_expires_at";
  let a = await db().from("accounts").select(COLS).eq("id", admin.accountId).maybeSingle();
  if (a.error && isMissingSchema(a.error)) {
    a = await db().from("accounts").select("id, owner_user_id, stripe_customer_id, stripe_subscription_id, subscription_status").eq("id", admin.accountId).maybeSingle();
  }
  if (a.error || !a.data) return fail("Couldn't load your account.", 500);
  if (a.data.owner_user_id !== admin.userId) return json({ error: "Only the account owner can change the plan.", code: "not_owner" }, 403);
  if (checkoutBlocked(a.data.subscription_status)) {
    if (
      a.data.subscription_status === "past_due"
      || a.data.subscription_status === "paused"
      || a.data.subscription_status === "incomplete"
      || !a.data.stripe_subscription_id
    ) {
      return json({ error: "Use Manage billing to change this plan.", code: "subscription_exists", action: "portal" }, 409);
    }
    const current = await s.subscriptions.retrieve(String(a.data.stripe_subscription_id));
    if (typeof current.livemode === "boolean" && current.livemode !== (billingMode() === "live")) {
      return json({ error: "Checkout isn't available yet.", code: "billing_unavailable" }, 503);
    }
    const item = current.items.data[0];
    const action = checkoutAction({
      status: current.status || a.data.subscription_status,
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
  const row = a.data as { trial_started_at?: string | null; trial_ends_at?: string | null };
  const trialEnd = checkoutTrialEnd(cappedTrialEndsAt(row.trial_started_at, row.trial_ends_at));
  const replace = body.replace === true;
  const stored = checkoutPendingFromRow({
    checkout_session_id: (a.data as { checkout_session_id?: string | null }).checkout_session_id,
    checkout_session_price: (a.data as { checkout_session_price?: string | null }).checkout_session_price,
    checkout_session_expires_at: (a.data as { checkout_session_expires_at?: string | null }).checkout_session_expires_at,
  });
  if (stored && stored.price === price && !replace) {
    try {
      const existing = await s.checkout.sessions.retrieve(stored.session_id);
      const existingLive = (existing as { livemode?: boolean }).livemode;
      if (typeof existingLive === "boolean" && existingLive !== (billingMode() === "live")) {
        return json({ error: "Couldn't update checkout. Try again.", code: "checkout_conflict" }, 409);
      }
      if (checkoutSessionMatchesCharge(existing, trialEnd !== null) && existing.url) {
        return json({ url: existing.url, resumed: true });
      }
    } catch {
      /* session is gone or unreadable; create a new one */
    }
    // Tracked session only: expire an incompatible one we stored, never an untracked session.
    try {
      await expireOwnCheckoutSession(s, admin.accountId, stored.session_id);
    } catch (err) {
      if ((err as Error).message === "checkout_session_mismatch") {
        return json({ error: "Couldn't update checkout. Try again.", code: "checkout_conflict" }, 409);
      }
    }
    await writeAccountBillingPatch(admin.accountId, { ...CHECKOUT_CLEAR_PATCH });
  }
  if (stored && (replace || stored.price !== price)) {
    try {
      await expireOwnCheckoutSession(s, admin.accountId, stored.session_id);
    } catch (err) {
      if ((err as Error).message === "checkout_session_mismatch") {
        return json({ error: "Couldn't update checkout. Try again.", code: "checkout_conflict" }, 409);
      }
    }
    await writeAccountBillingPatch(admin.accountId, { ...CHECKOUT_CLEAR_PATCH });
  }
  const origin = billingReturnOrigin(new URL(req.url).origin);
  const locale = await entitlementsLocale(admin.accountId, req);
  const planPrice = PLANS.find((item) => item.id === plan)?.price ?? 0;
  const chargeDate = trialEnd
    ? new Date(trialEnd * 1000).toLocaleDateString(locale === "es" ? "es-US" : "en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) + " (UTC)"
    : "";
  const built = checkoutSessionRequest({
    price,
    accountId: admin.accountId,
    email: admin.email,
    customerId: a.data.stripe_customer_id,
    origin,
    managedPayments: process.env.STRIPE_MANAGED_PAYMENTS,
    secretKey: stripeKey() ?? "",
    mode: billingMode(),
    trialEnd,
    submitMessage: checkoutSubmitMessage({ deferred: trialEnd !== null, price: planPrice, chargeDate, locale }),
  });
  if (!built.ok) return json({ error: built.error, code: built.code }, 503);
  const session = await s.checkout.sessions.create(built.params, built.options);
  await writeAccountBillingPatch(admin.accountId, checkoutSessionPatch(session, price));
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
    blockedReason: report.blockedReason,
    databaseIsolated: report.databaseIsolated,
    missing: report.missing,
    rejected: report.rejected,
    shapes: report.shapes,
    sources: report.sources,
  });
}
