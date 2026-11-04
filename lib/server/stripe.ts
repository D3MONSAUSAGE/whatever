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
const GRACE_DAYS = 7;

/** Applies one verified event. Returns false if it was already processed (idempotent replay). */
export async function applyEvent(ev: Stripe.Event): Promise<boolean> {
  const ins = await db().from("stripe_events").insert({ id: ev.id, type: ev.type });
  if (ins.error) {
    if (ins.error.code === "23505") {
      const prev = await db().from("stripe_events").select("processed_at").eq("id", ev.id).maybeSingle();
      if (prev.data?.processed_at) return false; // replay of a finished event
    } else throw new Error(ins.error.message);
  }
  if (ev.type === "checkout.session.completed") {
    const s = ev.data.object as Stripe.Checkout.Session;
    const accountId = s.client_reference_id;
    if (accountId && s.mode === "subscription") {
      await must(db().from("accounts").update({
        stripe_customer_id: typeof s.customer === "string" ? s.customer : s.customer?.id ?? null,
        stripe_subscription_id: typeof s.subscription === "string" ? s.subscription : s.subscription?.id ?? null,
      }).eq("id", accountId));
    }
  } else if (ev.type.startsWith("customer.subscription.")) {
    const sub = ev.data.object as Stripe.Subscription;
    const plan = planForPrice(sub.items.data[0]?.price?.id);
    const accountId = sub.metadata?.account_id;
    const status = ev.type === "customer.subscription.deleted" ? "canceled" : sub.status;
    const patch: Record<string, unknown> = {
      stripe_subscription_id: sub.id,
      stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
      subscription_status: status,
      current_period_end: ts((sub as unknown as { current_period_end?: number }).current_period_end ?? (sub.items.data[0] as unknown as { current_period_end?: number } | undefined)?.current_period_end),
      cancel_at_period_end: sub.cancel_at_period_end,
      grace_ends_at: status === "past_due" ? new Date(Date.now() + GRACE_DAYS * 86_400_000).toISOString() : null,
    };
    if (plan) patch.plan = plan;
    const q = db().from("accounts").update(patch);
    await must(accountId ? q.eq("id", accountId) : q.eq("stripe_subscription_id", sub.id));
  }
  await must(db().from("stripe_events").update({ processed_at: new Date().toISOString() }).eq("id", ev.id));
  return true;
}
async function must(p: PromiseLike<{ error: { message: string } | null }>) {
  const r = await p;
  if (r.error) throw new Error(r.error.message);
}
