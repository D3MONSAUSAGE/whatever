import Stripe from "stripe";
import { db } from "./supabase";

/** M17.3 Stripe, TEST MODE ONLY. Any key that is not sk_test_ is refused. */
export type PaidPlan = "starter" | "business" | "multi";
export const PAID_PLANS: readonly PaidPlan[] = ["starter", "business", "multi"];
const PRICE_ENV: Record<PaidPlan, string> = { starter: "STRIPE_PRICE_STARTER", business: "STRIPE_PRICE_BUSINESS", multi: "STRIPE_PRICE_MULTI" };

export function stripeKey(env: Record<string, string | undefined> = process.env): string | null {
  const k = env.STRIPE_TEST_SECRET_KEY;
  if (!k || !k.startsWith("sk_test_")) return null; // live or missing keys never load
  return k;
}
let cached: Stripe | null = null;
export function stripe(): Stripe | null {
  const k = stripeKey();
  if (!k) return null;
  return (cached ??= new Stripe(k));
}
export const priceFor = (plan: PaidPlan, env: Record<string, string | undefined> = process.env) => env[PRICE_ENV[plan]] || null;
export function planForPrice(priceId: string | null | undefined, env: Record<string, string | undefined> = process.env): PaidPlan | null {
  if (!priceId) return null;
  return PAID_PLANS.find((p) => env[PRICE_ENV[p]] === priceId) ?? null;
}

const ts = (s: number | null | undefined) => (s ? new Date(s * 1000).toISOString() : null);
export const GRACE_DAYS = 7;
const GRACE_MS = GRACE_DAYS * 86_400_000;

export type FetchSubscription = (id: string) => Promise<Stripe.Subscription>;

async function defaultFetchSubscription(id: string): Promise<Stripe.Subscription> {
  const client = stripe();
  if (!client) throw new Error("stripe disabled");
  return client.subscriptions.retrieve(id);
}

function subscriptionIdOf(ev: Stripe.Event): string | null {
  if (ev.type.startsWith("customer.subscription.")) return (ev.data.object as Stripe.Subscription).id;
  if (ev.type === "invoice.paid" || ev.type === "invoice.payment_failed") {
    const invoice = ev.data.object as Stripe.Invoice;
    return typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id ?? null;
  }
  if (ev.type === "checkout.session.completed") {
    const session = ev.data.object as Stripe.Checkout.Session;
    return typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null;
  }
  return null;
}

function periodEndSeconds(sub: Stripe.Subscription): number | null {
  if (sub.status === "trialing" && sub.trial_end) return sub.trial_end;
  return sub.current_period_end ?? sub.trial_end ?? null;
}

/**
 * Status written from the subscription Stripe returns now, not from a stale payload.
 * A scheduled cancel stays active until period end. A payment failure is past_due,
 * unless the trial has not reached trial_end yet.
 */
export function statusFor(ev: Stripe.Event, sub: Stripe.Subscription, nowMs: number): string {
  if (ev.type === "customer.subscription.deleted") return "canceled";
  if (ev.type === "invoice.payment_failed") {
    if (sub.status === "canceled" || sub.status === "incomplete_expired") return sub.status;
    if (sub.status === "trialing" && sub.trial_end && sub.trial_end * 1000 > nowMs) return "trialing";
    return "past_due";
  }
  if (ev.type === "invoice.paid") return sub.status === "past_due" ? "active" : sub.status;
  if (sub.cancel_at_period_end && (sub.status === "active" || sub.status === "trialing")) return sub.status;
  return sub.status;
}

/** Applies one verified event. Returns false if it was already processed (idempotent replay). */
export async function applyEvent(ev: Stripe.Event, opts: { now?: number; fetchSubscription?: FetchSubscription } = {}): Promise<boolean> {
  const ins = await db().from("stripe_events").insert({ id: ev.id, type: ev.type });
  if (ins.error) {
    if (ins.error.code === "23505") {
      const prev = await db().from("stripe_events").select("processed_at").eq("id", ev.id).maybeSingle();
      if (prev.data?.processed_at) return false; // replay of a finished event
    } else throw new Error(ins.error.message);
  }

  const now = opts.now ?? Date.now();
  const fetchSubscription = opts.fetchSubscription ?? defaultFetchSubscription;
  const handled = ev.type === "checkout.session.completed"
    || ev.type.startsWith("customer.subscription.")
    || ev.type === "invoice.paid"
    || ev.type === "invoice.payment_failed";

  if (handled) {
    const subId = subscriptionIdOf(ev);
    if (subId) {
      let sub: Stripe.Subscription;
      try {
        sub = await fetchSubscription(subId);
      } catch (err) {
        if (ev.type !== "customer.subscription.deleted") throw err;
        sub = ev.data.object as Stripe.Subscription;
      }
      const accountFromSession = ev.type === "checkout.session.completed"
        ? (ev.data.object as Stripe.Checkout.Session).client_reference_id
        : null;
      const accountId = accountFromSession || sub.metadata?.account_id || null;
      const status = statusFor(ev, sub, now);
      const grace = await graceEndsAt(accountId, sub.id, status, now);
      const patch: Record<string, unknown> = {
        stripe_subscription_id: sub.id,
        stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
        subscription_status: status,
        current_period_end: ts(periodEndSeconds(sub)),
        cancel_at_period_end: sub.cancel_at_period_end,
        grace_ends_at: grace,
        billing_event_created: ev.created ?? 0,
      };
      const plan = planForPrice(sub.items.data[0]?.price?.id);
      if (plan) patch.plan = plan;
      let q = db().from("accounts").update(patch);
      q = accountId ? q.eq("id", accountId) : q.eq("stripe_subscription_id", sub.id);
      // Only a newer event may overwrite. An older replay matches zero rows and leaves the row alone.
      await must(q.or(`billing_event_created.is.null,billing_event_created.lt.${ev.created ?? 0}`));
    }
  }

  await must(db().from("stripe_events").update({ processed_at: new Date(now).toISOString() }).eq("id", ev.id));
  return true;
}

/** First transition into past_due starts a 7-day grace. Later past_due events keep that instant. */
async function graceEndsAt(accountId: string | null, subscriptionId: string, status: string, now: number): Promise<string | null> {
  if (status !== "past_due") return null;
  const q = db().from("accounts").select("subscription_status, grace_ends_at");
  const row = accountId
    ? await q.eq("id", accountId).maybeSingle()
    : await q.eq("stripe_subscription_id", subscriptionId).maybeSingle();
  if (row.error) throw new Error(row.error.message);
  if (row.data?.subscription_status === "past_due" && row.data.grace_ends_at) return String(row.data.grace_ends_at);
  return new Date(now + GRACE_MS).toISOString();
}

async function must(p: PromiseLike<{ error: { message: string } | null }>) {
  const r = await p;
  if (r.error) throw new Error(r.error.message);
}

/** True only when a test key and all three price ids are configured. */
export function checkoutAvailable(env: Record<string, string | undefined> = process.env) {
  return !!stripeKey(env) && PAID_PLANS.every((p) => !!priceFor(p, env));
}
