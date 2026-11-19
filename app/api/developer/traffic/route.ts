import { enforceLimit, fail, json } from "@/lib/server/http";
import { withLocalizedErrors } from "@/lib/server/locale";
import { db } from "@/lib/server/supabase";
import { isMissingSchema } from "@/lib/server/schema";
import { developerFromRequest } from "@/lib/server/dev-analytics/authz";
import { internalDomains } from "@/lib/server/dev-analytics/exclusions";
import { computeDashboard, type Snapshot } from "@/lib/server/dev-analytics/metrics";
import { parseRange } from "@/lib/server/dev-analytics/range";
import { buildTrafficReport, type FunnelSnapshot, type TrafficSnapshot } from "@/lib/server/traffic-report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY = 86_400_000;
const RATE_WINDOW_S = 60;
const RATE_MAX = 30;
/** Same plain 404 as the other developer routes, built outside withLocalizedErrors (no account is created). */
const notFound = () => json({ error: "Not found.", code: "not_found" }, 404);

/**
 * Developer console "Website traffic" tab. Aggregates only (no visitor-level data exists). Anyone who is not
 * an allowlisted developer gets the plain 404; the database functions re-check the caller. Registrations use
 * the existing customer classification (internal, QA, demo and reviewer accounts excluded), never "include
 * internal", so they can't inflate conversion.
 */
export const GET = async (req: Request): Promise<Response> => {
  const userId = await developerFromRequest(req);
  if (!userId) return notFound();
  return forDeveloper(req, userId);
};

const forDeveloper = withLocalizedErrors(async function forDeveloper(req: Request, userId: string) {
  const limited = await enforceLimit(`dev-traffic:${userId}`, RATE_WINDOW_S, RATE_MAX, "Too many requests. Wait a minute, then try again.")
    .catch(() => fail("Too many requests. Wait a minute, then try again.", 429));
  if (limited) return limited;

  const now = new Date();
  const range = parseRange(new URL(req.url).searchParams, now);
  if (!range) return fail("Choose a valid date range (up to 366 days, not in the future).", 400, "bad_range");
  const since = new Date(Math.min(range.from.getTime(), now.getTime() - 37 * DAY));

  const [traffic, snap, funnel] = await Promise.all([
    db().rpc("dev_traffic_snapshot", { p_actor: userId, p_from: range.fromDay, p_to: range.toDay }),
    db().rpc("dev_analytics_snapshot", { p_actor: userId, p_since: since.toISOString() }),
    db().rpc("dev_funnel_snapshot", { p_actor: userId, p_from: range.fromDay, p_to: range.toDay }),
  ]);
  for (const r of [traffic, snap, funnel]) {
    if (r.error && (r.error.code === "42501" || /not_authorized/.test(r.error.message || ""))) return notFound();
  }
  if (snap.error) return fail("Couldn't load analytics.", 500);
  if (traffic.error && !isMissingSchema(traffic.error)) return fail("Couldn't load analytics.", 500);
  // The funnel panel is optional: until 0032 is applied it reports "not collecting" instead of failing the tab.
  const funnelData = funnel.error ? null : (funnel.data as FunnelSnapshot);

  // Billing isn't part of this tab, so Stripe isn't called; only customer registrations are used.
  const customers = computeDashboard({
    snapshot: snap.data as Snapshot,
    billing: { available: false, livemode: null, subs: [] },
    range, now, includeInternal: false, domains: internalDomains(),
  });
  const body = buildTrafficReport({ traffic: traffic.error ? null : (traffic.data as TrafficSnapshot), funnel: funnelData, customers, range, now });
  return json(body, 200, { "X-Robots-Tag": "noindex, nofollow" });
});
