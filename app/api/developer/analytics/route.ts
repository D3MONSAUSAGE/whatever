import { allow, fail, json } from "@/lib/server/http";
import { withLocalizedErrors } from "@/lib/server/locale";
import { db } from "@/lib/server/supabase";
import { developerFromRequest } from "@/lib/server/dev-analytics/authz";
import { internalDomains } from "@/lib/server/dev-analytics/exclusions";
import { computeDashboard, type Snapshot } from "@/lib/server/dev-analytics/metrics";
import { parseRange } from "@/lib/server/dev-analytics/range";
import { loadBilling } from "@/lib/server/dev-analytics/stripe-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY = 86_400_000;
/** Dormant-30 and 30-day active windows need a little more than 30 days behind "now". */
const LOOKBACK_DAYS = 37;

const notFound = () => fail("Not found.", 404);

/**
 * DA-1: private developer analytics. Aggregates only; no names, emails, content or per-account rows except
 * the internal-looking review list (opaque account ids). Anyone who is not an allowlisted developer,
 * signed out included, gets the same plain 404. The database function re-checks the caller.
 */
export const GET = withLocalizedErrors(async function GET(req: Request) {
  const userId = await developerFromRequest(req);
  if (!userId) return notFound();
  if (!(await allow(`dev-analytics:${userId}`, 60, 30).catch(() => false))) return fail("Too many attempts. Wait a few minutes, then try again.", 429);

  const url = new URL(req.url);
  const now = new Date();
  const range = parseRange(url.searchParams, now);
  if (!range) return fail("Choose a valid date range (up to 366 days, not in the future).", 400, "bad_range");
  const includeInternal = url.searchParams.get("include") === "internal";
  const since = new Date(Math.min(range.from.getTime(), now.getTime() - LOOKBACK_DAYS * DAY));

  const [snap, billing] = await Promise.all([
    db().rpc("dev_analytics_snapshot", { p_actor: userId, p_since: since.toISOString() }),
    loadBilling(now.getTime()),
  ]);
  if (snap.error) {
    if (snap.error.code === "42501" || /not_authorized/.test(snap.error.message || "")) return notFound();
    return fail("Couldn't load analytics.", 500);
  }
  const body = computeDashboard({
    snapshot: snap.data as Snapshot,
    billing,
    range,
    now,
    includeInternal,
    domains: internalDomains(),
  });
  return json(body, 200, { "X-Robots-Tag": "noindex, nofollow" });
});
