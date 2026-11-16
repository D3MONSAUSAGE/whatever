import type Stripe from "stripe";
import { billingMode, stripe } from "@/lib/server/stripe";

/** One Stripe subscription reduced to what the dashboard needs. No customer, email or card data. */
export type BillingSub = {
  accountId: string | null;
  status: string;
  createdAt: string;
  canceledAt: string | null;
  cancelAtPeriodEnd: boolean;
  /** Monthly-normalized list price in minor units (before discounts and tax). */
  monthlyAmount: number;
  currency: string;
  livemode: boolean;
};

export type BillingSnapshot = { available: boolean; livemode: boolean | null; subs: BillingSub[] };

const MAX_SUBSCRIPTIONS = 2000;
const CACHE_MS = 5 * 60_000;

const iso = (s: number | null | undefined) => (typeof s === "number" ? new Date(s * 1000).toISOString() : null);

function monthly(item: Stripe.SubscriptionItem): number {
  const price = item.price;
  const unit = price?.unit_amount ?? 0;
  const qty = item.quantity ?? 1;
  const r = price?.recurring;
  if (!r) return 0;
  const count = r.interval_count || 1;
  const perMonth = r.interval === "month" ? 1 / count
    : r.interval === "year" ? 1 / (12 * count)
    : r.interval === "week" ? 52 / 12 / count
    : r.interval === "day" ? 365 / 12 / count
    : 0;
  return Math.round(unit * qty * perMonth);
}

export function toBillingSub(s: Stripe.Subscription): BillingSub {
  const items = s.items?.data ?? [];
  const accountId = typeof s.metadata?.account_id === "string" && s.metadata.account_id ? s.metadata.account_id : null;
  return {
    accountId,
    status: s.status,
    createdAt: iso(s.created) ?? new Date(0).toISOString(),
    canceledAt: iso(s.canceled_at),
    cancelAtPeriodEnd: !!s.cancel_at_period_end,
    monthlyAmount: items.reduce((sum, item) => sum + monthly(item), 0),
    currency: (items[0]?.price?.currency || s.currency || "usd").toLowerCase(),
    livemode: !!s.livemode,
  };
}

type Loader = () => Promise<BillingSnapshot>;
let testLoader: Loader | null = null;
let cache: { at: number; value: BillingSnapshot } | null = null;

/** Tests only: replace the Stripe read (null restores the real one) and clear the cache. */
export function setTestBillingLoader(next: Loader | null) {
  testLoader = next;
  cache = null;
}

/**
 * Stripe is the source of truth for paying customers, cancellations and MRR. Read-only list call with the
 * server's existing key; cached 5 minutes. Unavailable (no key or an API error) is reported, never guessed.
 */
export async function loadBilling(now = Date.now()): Promise<BillingSnapshot> {
  if (testLoader) return testLoader();
  if (cache && now - cache.at < CACHE_MS) return cache.value;
  const client = stripe();
  if (!client) return { available: false, livemode: null, subs: [] };
  try {
    const list = await client.subscriptions.list({ status: "all", limit: 100 }).autoPagingToArray({ limit: MAX_SUBSCRIPTIONS });
    const subs = list.map(toBillingSub);
    const value: BillingSnapshot = { available: true, livemode: subs.length ? subs.every((s) => s.livemode) : billingMode() === "live", subs };
    cache = { at: now, value };
    return value;
  } catch {
    return { available: false, livemode: null, subs: [] };
  }
}
