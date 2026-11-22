import { enforceLimit, fail, json } from "@/lib/server/http";
import { withLocalizedErrors } from "@/lib/server/locale";
import { db } from "@/lib/server/supabase";
import { developerFromRequest } from "@/lib/server/dev-analytics/authz";
import { internalDomains } from "@/lib/server/dev-analytics/exclusions";
import { computeDashboard, type Snapshot } from "@/lib/server/dev-analytics/metrics";
import { parseRange } from "@/lib/server/dev-analytics/range";
import { loadBilling } from "@/lib/server/dev-analytics/stripe-source";

import type { OnboardingRow } from "@/lib/server/dev-analytics/metrics";

export const runtime = "nodejs";

/** 0036 milestones (step names and times only). Null before the migration, so the section is simply absent. */
async function loadOnboarding(): Promise<OnboardingRow[] | null> {
  try {
    const r = await db().from("accounts").select("id, onboarding_milestones, onboarding_completed_at").limit(20000);
    if (r.error || !Array.isArray(r.data)) return null;
    return r.data as OnboardingRow[];
  } catch {
    return null;
  }
}
export const dynamic = "force-dynamic";

const DAY = 86_400_000;
/** Dormant-30 and 30-day active windows need a little more than 30 days behind "now". */
const LOOKBACK_DAYS = 37;

/**
 * The 404 for everyone who isn't a developer. Built directly, NOT through withLocalizedErrors: that path
 * resolves the session locale via requireAdmin, which runs ensure_account and would create an account for a
 * signed-in non-developer. Same body and status as the catalog 404, English only.
 */
const notFound = () => json({ error: "Not found.", code: "not_found" }, 404);
/** 60 s window, 30 requests. enforceLimit adds Retry-After. */
const RATE_WINDOW_S = 60;
const RATE_MAX = 30;

/**
 * DA-1: private developer analytics. Aggregates only; no names, emails, content or per-account rows except
 * the internal-looking review list (opaque account ids). Anyone who is not an allowlisted developer,
 * signed out included, gets the same plain 404. The database function re-checks the caller.
 */
export const GET = async (req: Request): Promise<Response> => {
  const userId = await developerFromRequest(req);
  if (!userId) return notFound();
  return forDeveloper(req, userId);
};

// Only developers reach this; their error text is localized like every other customer route.
const forDeveloper = withLocalizedErrors(async function forDeveloper(req: Request, userId: string) {
  const limited = await enforceLimit(`dev-analytics:${userId}`, RATE_WINDOW_S, RATE_MAX, "Too many requests. Wait a minute, then try again.")
    .catch(() => fail("Too many requests. Wait a minute, then try again.", 429));
  if (limited) return limited;

  const url = new URL(req.url);
  const now = new Date();
  const range = parseRange(url.searchParams, now);
  if (!range) return fail("Choose a valid date range (up to 366 days, not in the future).", 400, "bad_range");
  const includeInternal = url.searchParams.get("include") === "internal";
  const since = new Date(Math.min(range.from.getTime(), now.getTime() - LOOKBACK_DAYS * DAY));

  const [snap, billing, onboarding] = await Promise.all([
    db().rpc("dev_analytics_snapshot", { p_actor: userId, p_since: since.toISOString() }),
    loadBilling(now.getTime()),
    loadOnboarding(),
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
    onboarding,
  });
  return json(body, 200, { "X-Robots-Tag": "noindex, nofollow" });
});
