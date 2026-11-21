import type Stripe from "stripe";
import { db } from "./supabase";
import { isMissingSchema } from "./schema";
import type { PaymentMethodSummary } from "./billing-copy";

export const PAYMENT_METHOD_TTL_MS = 30 * 60 * 1000;

export const BILLING_STATUS_COLUMNS =
  "payment_method_brand, payment_method_last4, payment_method_synced_at, checkout_session_id, checkout_session_price, checkout_session_expires_at";

export const ACCOUNT_BILLING_COLUMNS =
  `id, owner_user_id, stripe_customer_id, stripe_subscription_id, subscription_status, ${BILLING_STATUS_COLUMNS}`;

export type AccountBillingCache = {
  payment_method_brand?: string | null;
  payment_method_last4?: string | null;
  payment_method_synced_at?: string | null;
  checkout_session_id?: string | null;
  checkout_session_price?: string | null;
  checkout_session_expires_at?: string | null;
  stripe_customer_id?: string | null;
};

export function paymentMethodFromStripe(pm: Stripe.PaymentMethod | string | null | undefined): PaymentMethodSummary | null {
  if (!pm || typeof pm === "string") return null;
  const last4 = pm.card?.last4?.trim();
  if (!last4) return null;
  return { brand: (pm.card?.brand || "card").trim().toLowerCase(), last4 };
}

export function paymentMethodFromSubscription(sub: Stripe.Subscription | null | undefined): PaymentMethodSummary | null {
  if (!sub) return null;
  return paymentMethodFromStripe(sub.default_payment_method as Stripe.PaymentMethod | string | null | undefined);
}

export function cachedPaymentMethod(row: AccountBillingCache | null | undefined, now = Date.now()): {
  pm: PaymentMethodSummary | null;
  fresh: boolean;
  exists: boolean;
} {
  if (!row) return { pm: null, fresh: false, exists: false };
  const synced = row.payment_method_synced_at ? Date.parse(String(row.payment_method_synced_at)) : NaN;
  const exists = Number.isFinite(synced);
  const fresh = exists && now - synced < PAYMENT_METHOD_TTL_MS;
  const last4 = String(row.payment_method_last4 || "").trim();
  const brand = String(row.payment_method_brand || "").trim();
  const pm = last4 ? { brand: brand || "card", last4 } : null;
  return { pm, fresh, exists };
}

/** Open Checkout only when the stored session has not expired. An open unpaid session is never a payment method. */
export function checkoutPendingFromRow(row: AccountBillingCache | null | undefined, now = Date.now()): {
  session_id: string;
  price: string;
  expires_at: string;
} | null {
  if (!row) return null;
  const id = String(row.checkout_session_id || "").trim();
  const price = String(row.checkout_session_price || "").trim();
  const raw = row.checkout_session_expires_at;
  if (!id || !price || !raw) return null;
  const exp = Date.parse(String(raw));
  if (!Number.isFinite(exp) || exp <= now) return null;
  return { session_id: id, price, expires_at: new Date(exp).toISOString() };
}

export function paymentMethodPatch(pm: PaymentMethodSummary | null, now = Date.now()): Record<string, unknown> {
  return {
    payment_method_brand: pm?.brand ?? null,
    payment_method_last4: pm?.last4 ?? null,
    payment_method_synced_at: new Date(now).toISOString(),
  };
}

export const CHECKOUT_CLEAR_PATCH = {
  checkout_session_id: null,
  checkout_session_price: null,
  checkout_session_expires_at: null,
} as const;

export function checkoutSessionPatch(session: { id: string; expires_at?: number | null }, price: string): Record<string, unknown> {
  const expires = typeof session.expires_at === "number"
    ? new Date(session.expires_at * 1000).toISOString()
    : null;
  return {
    checkout_session_id: session.id,
    checkout_session_price: price,
    checkout_session_expires_at: expires,
  };
}

export async function writeAccountBillingPatch(accountId: string, patch: Record<string, unknown>): Promise<"ok" | "skipped"> {
  const r = await db().from("accounts").update(patch).eq("id", accountId);
  if (r.error) {
    if (isMissingSchema(r.error)) return "skipped";
    throw new Error(r.error.message);
  }
  return "ok";
}

export type StripePaymentMethodReader = (customerId: string) => Promise<PaymentMethodSummary | null | "error">;

/**
 * Cached card brand/last4 for the entitlements response. Refreshes from Stripe when the
 * cache is older than 30 minutes. An open unpaid Checkout session is never treated as a card on file.
 * If Stripe is down, the last cached value is returned.
 */
export async function resolvePaymentMethod(
  accountId: string,
  row: AccountBillingCache,
  read: StripePaymentMethodReader,
  now = Date.now(),
): Promise<PaymentMethodSummary | null> {
  const cached = cachedPaymentMethod(row, now);
  if (cached.fresh) return cached.pm;
  const customerId = String(row.stripe_customer_id || "").trim();
  if (!customerId || !accountId) return cached.pm;
  const fresh = await read(customerId);
  if (fresh === "error") return cached.pm;
  await writeAccountBillingPatch(accountId, paymentMethodPatch(fresh, now)).catch(() => "skipped");
  return fresh;
}

/** Expire a stored Checkout session only when it belongs to this org (client_reference_id). */
export async function expireOwnCheckoutSession(
  client: Stripe,
  accountId: string,
  sessionId: string,
): Promise<void> {
  const session = await client.checkout.sessions.retrieve(sessionId);
  if (session.client_reference_id && session.client_reference_id !== accountId) {
    throw new Error("checkout_session_mismatch");
  }
  if (session.status === "open") {
    await client.checkout.sessions.expire(sessionId);
  }
}

export async function resumeOpenCheckoutUrl(
  client: Stripe,
  sessionId: string,
): Promise<string | null> {
  const session = await client.checkout.sessions.retrieve(sessionId);
  if (session.status === "open" && session.url) return session.url;
  return null;
}

export type AccountBillingRow = AccountBillingCache & {
  id: string;
  owner_user_id?: string | null;
  stripe_customer_id?: string | null;
};

/** Loads cached billing columns. If migration 0034 is not applied, owner and customer ids still load. */
export async function loadAccountBilling(accountId: string): Promise<AccountBillingRow | null> {
  const full = await db().from("accounts").select(ACCOUNT_BILLING_COLUMNS).eq("id", accountId).maybeSingle();
  if (full.error && isMissingSchema(full.error)) {
    const basic = await db().from("accounts").select("id, owner_user_id, stripe_customer_id").eq("id", accountId).maybeSingle();
    if (basic.error || !basic.data) return null;
    return basic.data as AccountBillingRow;
  }
  if (full.error || !full.data) return null;
  return full.data as AccountBillingRow;
}
