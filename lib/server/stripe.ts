import Stripe from "stripe";
import { publicAppOrigin } from "@/lib/public-url";
import { db } from "./supabase";

/** Stripe billing. Live charges stay off unless STRIPE_LIVE_ENABLED is exactly "1". */
export type PaidPlan = "starter" | "business" | "multi";
export const PAID_PLANS: readonly PaidPlan[] = ["starter", "business", "multi"];
const PRICE_ENV = { starter: "STRIPE_PRICE_STARTER", business: "STRIPE_PRICE_BUSINESS", multi: "STRIPE_PRICE_MULTI" } as const;
const LIVE_PRICE_ENV = { starter: "STRIPE_LIVE_PRICE_STARTER", business: "STRIPE_LIVE_PRICE_BUSINESS", multi: "STRIPE_LIVE_PRICE_MULTI" } as const;

/** Names the checkout and webhook gates read. Listed literally so the runtime receives them. */
export const BILLING_ENV_NAMES = [
  "STRIPE_TEST_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRICE_STARTER",
  "STRIPE_PRICE_BUSINESS",
  "STRIPE_PRICE_MULTI",
] as const;
export const LIVE_BILLING_ENV_NAMES = [
  "STRIPE_LIVE_SECRET_KEY",
  "STRIPE_LIVE_WEBHOOK_SECRET",
  "STRIPE_LIVE_PRICE_STARTER",
  "STRIPE_LIVE_PRICE_BUSINESS",
  "STRIPE_LIVE_PRICE_MULTI",
] as const;

function clean(value: string | undefined): string {
  if (!value) return "";
  return value.trim().replace(/^['"]|['"]$/g, "");
}

/**
 * Direct `process.env.NAME` reads. `env[name]` is invisible to the host's env
 * allowlist, so the vars can be set on the project and still be empty in the function.
 */
const DYNAMIC_NAME = {
  STRIPE_LIVE_ENABLED: ["STRIPE", "LIVE", "ENABLED"].join("_"),
  STRIPE_TEST_SECRET_KEY: ["STRIPE", "TEST", "SECRET", "KEY"].join("_"),
  STRIPE_WEBHOOK_SECRET: ["STRIPE", "WEBHOOK", "SECRET"].join("_"),
  STRIPE_PRICE_STARTER: ["STRIPE", "PRICE", "STARTER"].join("_"),
  STRIPE_PRICE_BUSINESS: ["STRIPE", "PRICE", "BUSINESS"].join("_"),
  STRIPE_PRICE_MULTI: ["STRIPE", "PRICE", "MULTI"].join("_"),
  STRIPE_LIVE_SECRET_KEY: ["STRIPE", "LIVE", "SECRET", "KEY"].join("_"),
  STRIPE_LIVE_WEBHOOK_SECRET: ["STRIPE", "LIVE", "WEBHOOK", "SECRET"].join("_"),
  STRIPE_LIVE_PRICE_STARTER: ["STRIPE", "LIVE", "PRICE", "STARTER"].join("_"),
  STRIPE_LIVE_PRICE_BUSINESS: ["STRIPE", "LIVE", "PRICE", "BUSINESS"].join("_"),
  STRIPE_LIVE_PRICE_MULTI: ["STRIPE", "LIVE", "PRICE", "MULTI"].join("_"),
} as const;

function readRuntime(name: keyof typeof DYNAMIC_NAME, literal: string | undefined): string {
  const cleaned = clean(literal);
  if (cleaned && cleaned !== "[REDACTED]") return cleaned;
  const dynamic = clean(process.env[DYNAMIC_NAME[name]]);
  if (dynamic && dynamic !== "[REDACTED]") return dynamic;
  return cleaned;
}

export function billingEnv(override?: Record<string, string | undefined>) {
  if (override) {
    return {
      STRIPE_LIVE_ENABLED: clean(override.STRIPE_LIVE_ENABLED),
      STRIPE_TEST_SECRET_KEY: clean(override.STRIPE_TEST_SECRET_KEY),
      STRIPE_WEBHOOK_SECRET: clean(override.STRIPE_WEBHOOK_SECRET),
      STRIPE_PRICE_STARTER: clean(override.STRIPE_PRICE_STARTER),
      STRIPE_PRICE_BUSINESS: clean(override.STRIPE_PRICE_BUSINESS),
      STRIPE_PRICE_MULTI: clean(override.STRIPE_PRICE_MULTI),
      STRIPE_LIVE_SECRET_KEY: clean(override.STRIPE_LIVE_SECRET_KEY),
      STRIPE_LIVE_WEBHOOK_SECRET: clean(override.STRIPE_LIVE_WEBHOOK_SECRET),
      STRIPE_LIVE_PRICE_STARTER: clean(override.STRIPE_LIVE_PRICE_STARTER),
      STRIPE_LIVE_PRICE_BUSINESS: clean(override.STRIPE_LIVE_PRICE_BUSINESS),
      STRIPE_LIVE_PRICE_MULTI: clean(override.STRIPE_LIVE_PRICE_MULTI),
    };
  }
  return {
    STRIPE_LIVE_ENABLED: readRuntime("STRIPE_LIVE_ENABLED", process.env.STRIPE_LIVE_ENABLED),
    STRIPE_TEST_SECRET_KEY: readRuntime("STRIPE_TEST_SECRET_KEY", process.env.STRIPE_TEST_SECRET_KEY),
    STRIPE_WEBHOOK_SECRET: readRuntime("STRIPE_WEBHOOK_SECRET", process.env.STRIPE_WEBHOOK_SECRET),
    STRIPE_PRICE_STARTER: readRuntime("STRIPE_PRICE_STARTER", process.env.STRIPE_PRICE_STARTER),
    STRIPE_PRICE_BUSINESS: readRuntime("STRIPE_PRICE_BUSINESS", process.env.STRIPE_PRICE_BUSINESS),
    STRIPE_PRICE_MULTI: readRuntime("STRIPE_PRICE_MULTI", process.env.STRIPE_PRICE_MULTI),
    STRIPE_LIVE_SECRET_KEY: readRuntime("STRIPE_LIVE_SECRET_KEY", process.env.STRIPE_LIVE_SECRET_KEY),
    STRIPE_LIVE_WEBHOOK_SECRET: readRuntime("STRIPE_LIVE_WEBHOOK_SECRET", process.env.STRIPE_LIVE_WEBHOOK_SECRET),
    STRIPE_LIVE_PRICE_STARTER: readRuntime("STRIPE_LIVE_PRICE_STARTER", process.env.STRIPE_LIVE_PRICE_STARTER),
    STRIPE_LIVE_PRICE_BUSINESS: readRuntime("STRIPE_LIVE_PRICE_BUSINESS", process.env.STRIPE_LIVE_PRICE_BUSINESS),
    STRIPE_LIVE_PRICE_MULTI: readRuntime("STRIPE_LIVE_PRICE_MULTI", process.env.STRIPE_LIVE_PRICE_MULTI),
  };
}

/** Live mode only when the flag is exactly "1". Anything else, including "true", stays in test. */
export function billingMode(env?: Record<string, string | undefined>): "test" | "live" {
  const flag = env ? env.STRIPE_LIVE_ENABLED : process.env.STRIPE_LIVE_ENABLED;
  return clean(flag) === "1" ? "live" : "test";
}

/**
 * The secret for the active mode. Test never reads STRIPE_LIVE_*, and live never
 * reads STRIPE_TEST_*. A live key is refused unless the flag is exactly "1".
 */
export function stripeKey(env?: Record<string, string | undefined>): string | null {
  const values = billingEnv(env);
  if (billingMode(env) === "live") {
    const live = values.STRIPE_LIVE_SECRET_KEY;
    return live.startsWith("sk_live_") ? live : null;
  }
  const test = values.STRIPE_TEST_SECRET_KEY;
  return test.startsWith("sk_test_") ? test : null;
}

export function webhookSecret(env?: Record<string, string | undefined>): string {
  const values = billingEnv(env);
  return billingMode(env) === "live" ? values.STRIPE_LIVE_WEBHOOK_SECRET : values.STRIPE_WEBHOOK_SECRET;
}

/** Live mode accepts only livemode events. Test mode refuses them. */
export function webhookEventAllowed(livemode: boolean, env?: Record<string, string | undefined>): boolean {
  return billingMode(env) === "live" ? livemode : !livemode;
}

/** Webhook payloads and subscription re-fetches stay on the SDK default. */
export const WEBHOOK_API_VERSION = "2025-02-24.acacia";
/**
 * Checkout only. Acacia rejects `managed_payments` outright, and a sandbox with
 * Managed Payments on will not create a session until this request names the flag.
 */
export const CHECKOUT_API_VERSION = "2025-03-31.basil";

/** Test mode turns Managed Payments on only when the env is exactly "1". */
export function managedPaymentsEnabled(value: string | undefined): boolean {
  return clean(value) === "1";
}

const LIVE_MANAGED_PAYMENTS_ERROR = "Set STRIPE_MANAGED_PAYMENTS to 0 before live Checkout. Standard Stripe Billing sends managed_payments[enabled]=false so Pekko stays the seller. An unset value is refused and the account default is not used.";

export function checkoutSessionRequest(input: {
  price: string;
  accountId: string;
  email: string;
  customerId: string | null;
  origin: string;
  managedPayments: string | undefined;
  secretKey: string | undefined;
}):
  | { ok: true; params: Stripe.Checkout.SessionCreateParams & { managed_payments?: { enabled: boolean } }; options: Stripe.RequestOptions }
  | { ok: false; code: "managed_payments_config"; error: string } {
  const params: Stripe.Checkout.SessionCreateParams & { managed_payments?: { enabled: boolean } } = {
    mode: "subscription",
    line_items: [{ price: input.price, quantity: 1 }],
    client_reference_id: input.accountId,
    ...(input.customerId ? { customer: input.customerId } : { customer_email: input.email }),
    subscription_data: { metadata: { account_id: input.accountId } },
    success_url: `${input.origin}/dashboard/billing?checkout=success`,
    cancel_url: `${input.origin}/dashboard/billing?checkout=canceled`,
  };
  const options: Stripe.RequestOptions = { apiVersion: CHECKOUT_API_VERSION };
  const key = clean(input.secretKey);
  const flag = clean(input.managedPayments);
  if (key.startsWith("sk_test_")) {
    params.managed_payments = { enabled: flag === "1" };
    return { ok: true, params, options };
  }
  if (key.startsWith("sk_live_")) {
    // Live opt-out only when the flag is exactly "0". Anything else, including unset, is a config error.
    if (flag === "0") {
      params.managed_payments = { enabled: false };
      return { ok: true, params, options };
    }
    return { ok: false, code: "managed_payments_config", error: LIVE_MANAGED_PAYMENTS_ERROR };
  }
  return { ok: true, params, options };
}

let cached: { key: string; client: Stripe } | null = null;
export function stripe(): Stripe | null {
  const k = stripeKey();
  if (!k) return null;
  // No apiVersion here: the client, webhook parser, and subscription re-fetch stay on acacia.
  if (cached?.key !== k) cached = { key: k, client: new Stripe(k) };
  return cached.client;
}
export function priceFor(plan: PaidPlan, env?: Record<string, string | undefined>): string | null {
  const values = billingEnv(env);
  const name = (billingMode(env) === "live" ? LIVE_PRICE_ENV : PRICE_ENV)[plan];
  return values[name] || null;
}
export function planForPrice(priceId: string | null | undefined, env?: Record<string, string | undefined>): PaidPlan | null {
  if (!priceId) return null;
  const values = billingEnv(env);
  const names = billingMode(env) === "live" ? LIVE_PRICE_ENV : PRICE_ENV;
  return PAID_PLANS.find((p) => values[names[p]] === priceId) ?? null;
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

function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

function subscriptionIdOf(ev: Stripe.Event): string | null {
  if (ev.type.startsWith("customer.subscription.")) return (ev.data.object as Stripe.Subscription).id;
  if (ev.type === "invoice.paid" || ev.type === "invoice.payment_failed") {
    const invoice = ev.data.object as Stripe.Invoice & {
      parent?: { subscription_details?: { subscription?: string | { id: string } | null } | null } | null;
    };
    // Acacia puts the id on invoice.subscription. Basil moved it under parent.subscription_details.
    return idOf(invoice.subscription) ?? idOf(invoice.parent?.subscription_details?.subscription);
  }
  if (ev.type === "checkout.session.completed") {
    const session = ev.data.object as Stripe.Checkout.Session;
    return idOf(session.subscription);
  }
  return null;
}

/**
 * Acacia stores the period on the subscription. Basil stores it on each item.
 * The subscription value wins when both are present. Several items use the earliest end.
 */
export function periodEndSeconds(sub: Stripe.Subscription): number | null {
  if (sub.status === "trialing" && sub.trial_end) return sub.trial_end;
  if (typeof sub.current_period_end === "number") return sub.current_period_end;
  const ends = (sub.items?.data ?? [])
    .map((item) => (item as { current_period_end?: number | null }).current_period_end)
    .filter((value): value is number => typeof value === "number");
  if (ends.length) return Math.min(...ends);
  return typeof sub.trial_end === "number" ? sub.trial_end : null;
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
      // A newer event overwrites. The same second also overwrites, because the handler
      // re-fetches the subscription. A canceled row stays canceled at that second:
      // trial_will_end and subscription.deleted often share event.created.
      const created = ev.created ?? 0;
      const sameSecond = `and(billing_event_created.eq.${created},subscription_status.not.in.(canceled,incomplete_expired))`;
      await must(q.or(`billing_event_created.is.null,billing_event_created.lt.${created},${sameSecond}`));
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

/** Checkout must not open a second subscription while one of these is on the account. */
export const BLOCKING_SUBSCRIPTION_STATUSES = ["active", "trialing", "past_due"] as const;

export function checkoutBlocked(status: string | null | undefined): boolean {
  return BLOCKING_SUBSCRIPTION_STATUSES.includes(status as typeof BLOCKING_SUBSCRIPTION_STATUSES[number]);
}

/** What Checkout does for an org that already may have a subscription. "checkout" is the only path that creates one. */
export function checkoutAction(input: {
  status: string | null | undefined;
  subscriptionId: string | null | undefined;
  currentPriceId: string | null;
  nextPriceId: string;
}): "checkout" | "portal" | "same" | "update" {
  if (!checkoutBlocked(input.status)) return "checkout";
  if (input.status === "past_due" || !input.subscriptionId || !input.currentPriceId) return "portal";
  if (input.currentPriceId === input.nextPriceId) return "same";
  return "update";
}

/**
 * Same proration as the live Customer Portal: always_invoice, so the difference is
 * invoiced and charged right away. error_if_incomplete means a declined or 3DS-blocked
 * payment returns a 402 and the plan does not change. trial_end is sent only while
 * Stripe's trial is still in the future, so a trial is neither ended nor extended.
 */
export const PLAN_CHANGE_PRORATION = "always_invoice" as const;

export function subscriptionPriceChange(input: {
  subscriptionItemId: string;
  price: string;
  trialEnd: number | null;
  nowSeconds?: number;
}): Stripe.SubscriptionUpdateParams {
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const params: Stripe.SubscriptionUpdateParams = {
    items: [{ id: input.subscriptionItemId, price: input.price }],
    proration_behavior: PLAN_CHANGE_PRORATION,
    payment_behavior: "error_if_incomplete",
  };
  if (typeof input.trialEnd === "number" && input.trialEnd > now) params.trial_end = input.trialEnd;
  return params;
}

/** A plan change whose immediate invoice could not be paid. The subscription is unchanged. */
export function planChangePaymentFailed(err: unknown): boolean {
  const e = err as { type?: string; statusCode?: number; code?: string } | null;
  if (!e) return false;
  return e.type === "StripeCardError" || e.statusCode === 402;
}

/** Customer origins billing may send people back to. Previews are honored only outside production. */
const BILLING_ORIGIN_HOSTS = new Set(["pekkotv.com", "www.pekkotv.com"]);
const BILLING_NONPROD_HOSTS = new Set(["pantalla-chi.vercel.app"]);
const BILLING_PREVIEW_HOST = /^pantalla-[a-z0-9-]+-teamtegrate\.vercel\.app$/;

/**
 * Origin for Stripe return, success and cancel URLs, taken from the request's own origin
 * when it is allowlisted: pekkotv.com, and (not in production) pantalla-chi and this
 * project's *-teamtegrate.vercel.app previews. Anything else falls back to the site URL,
 * so production customers always land on pekkotv.com.
 */
export function billingReturnOrigin(requestOrigin: string, env: NodeJS.ProcessEnv = process.env): string {
  try {
    const url = new URL(requestOrigin);
    const host = url.hostname.toLowerCase();
    if ((host === "localhost" || host === "127.0.0.1") && env.VERCEL_ENV !== "production") return url.origin;
    if (url.protocol === "https:" && !url.port) {
      if (BILLING_ORIGIN_HOSTS.has(host)) return url.origin;
      if (env.VERCEL_ENV !== "production" && (BILLING_NONPROD_HOSTS.has(host) || BILLING_PREVIEW_HOST.test(host))) return url.origin;
    }
  } catch {
    /* fall through to the public origin */
  }
  return publicAppOrigin(env);
}

export function portalReturnUrl(requestOrigin: string, env: NodeJS.ProcessEnv = process.env): string {
  return `${billingReturnOrigin(requestOrigin, env)}/dashboard/account`;
}

/** Owner-only. No customer means show the plan picker. A customer id from the request is not accepted. */
export function portalAccess(input: { userId: string; ownerUserId: string; customerId: string | null }):
  | { ok: true; customerId: string }
  | { ok: false; status: 403 | 200; code: "not_owner" | "plans" } {
  if (input.userId !== input.ownerUserId) return { ok: false, status: 403, code: "not_owner" };
  if (!input.customerId) return { ok: false, status: 200, code: "plans" };
  return { ok: true, customerId: input.customerId };
}

/** Portal sessions use the customer stored for this org. The request body never names a customer. */
export function portalSessionParams(customerId: string, returnUrl: string): Stripe.BillingPortal.SessionCreateParams {
  return { customer: customerId, return_url: returnUrl };
}

/** True only when a test key and all three price ids are configured. Webhook secret is separate. */
export function checkoutAvailable(env?: Record<string, string | undefined>) {
  return !!stripeKey(env) && PAID_PLANS.every((p) => !!priceFor(p, env));
}

const PUBLIC_PREFIXES = ["sk_test_", "sk_live_", "rk_test_", "rk_live_", "pk_test_", "pk_live_", "whsec_", "price_"] as const;

/** Character classes of the start of a value. Never the characters themselves. */
function classPattern(value: string): string {
  return [...value.slice(0, 12)].map((ch) => {
    const code = ch.charCodeAt(0);
    if (code >= 97 && code <= 122) return "a";
    if (code >= 65 && code <= 90) return "A";
    if (code >= 48 && code <= 57) return "9";
    if (ch === "_") return "_";
    if (code < 128) return "+";
    return "?";
  }).join("");
}

function valueShape(value: string) {
  const lowered = value.toLowerCase();
  const prefix = PUBLIC_PREFIXES.find((item) => value.startsWith(item))
    ?? PUBLIC_PREFIXES.find((item) => lowered.startsWith(item))
    ?? null;
  return {
    length: value.length,
    prefix,
    case: prefix && !value.startsWith(prefix) ? "upper" : "as-is",
    pattern: classPattern(value),
    interiorWhitespace: /\s/.test(value),
    nonAscii: [...value].some((ch) => ch.charCodeAt(0) > 127),
    redacted: value === "[REDACTED]",
  };
}

/** Names only. Never returns values. `rejected` means the var is set but has the wrong prefix for the active mode. */
export function billingDiagnostics(env?: Record<string, string | undefined>) {
  const values = billingEnv(env);
  const live = billingMode(env) === "live";
  const missing: string[] = [];
  const rejected: string[] = [];
  const shapes: Record<string, ReturnType<typeof valueShape>> = {};
  const names = live ? LIVE_BILLING_ENV_NAMES : BILLING_ENV_NAMES;
  const expectPrefix: Record<string, string> = live
    ? {
      STRIPE_LIVE_SECRET_KEY: "sk_live_",
      STRIPE_LIVE_WEBHOOK_SECRET: "whsec_",
      STRIPE_LIVE_PRICE_STARTER: "price_",
      STRIPE_LIVE_PRICE_BUSINESS: "price_",
      STRIPE_LIVE_PRICE_MULTI: "price_",
    }
    : {
      STRIPE_TEST_SECRET_KEY: "sk_test_",
      STRIPE_WEBHOOK_SECRET: "whsec_",
      STRIPE_PRICE_STARTER: "price_",
      STRIPE_PRICE_BUSINESS: "price_",
      STRIPE_PRICE_MULTI: "price_",
    };
  for (const name of names) {
    const value = values[name];
    if (!value) {
      missing.push(name);
      continue;
    }
    if (!value.startsWith(expectPrefix[name])) {
      rejected.push(name);
      shapes[name] = valueShape(value);
    }
  }
  const sources = env ? undefined : live
    ? {
      STRIPE_LIVE_SECRET_KEY: {
        literal: valueShape(clean(process.env.STRIPE_LIVE_SECRET_KEY)),
        dynamic: valueShape(clean(process.env[DYNAMIC_NAME.STRIPE_LIVE_SECRET_KEY])),
      },
    }
    : {
      STRIPE_TEST_SECRET_KEY: {
        literal: valueShape(clean(process.env.STRIPE_TEST_SECRET_KEY)),
        dynamic: valueShape(clean(process.env[DYNAMIC_NAME.STRIPE_TEST_SECRET_KEY])),
      },
    };
  return {
    mode: live ? "live" as const : "test" as const,
    available: checkoutAvailable(values),
    webhook: !!stripeKey(values) && webhookSecret(values).startsWith("whsec_"),
    missing,
    rejected,
    shapes,
    sources,
  };
}
