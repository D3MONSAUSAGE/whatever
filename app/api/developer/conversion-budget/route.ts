import { fail, json } from "@/lib/server/http";
import { withLocalizedErrors } from "@/lib/server/locale";
import { db } from "@/lib/server/supabase";
import { developerFromRequest } from "@/lib/server/dev-analytics/authz";
import { budgetMonthStart, CONVERSION_CAP_MILLIS, hevcConversionEnabled } from "@/lib/server/video-conversion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const notFound = () => json({ error: "Not found.", code: "not_found" }, 404);

/**
 * Developer-only conversion budget and job counts for the current PT calendar month.
 * Anyone who is not an allowlisted developer gets the same 404 as other developer APIs.
 * Built like /api/developer/analytics: the 404 path is unwrapped so we never call ensure_account.
 */
export const GET = async (req: Request): Promise<Response> => {
  const userId = await developerFromRequest(req);
  if (!userId) return notFound();
  return forDeveloper(req, userId);
};

const forDeveloper = withLocalizedErrors(async function forDeveloper(_req: Request, _userId: string) {
  const month = budgetMonthStart();
  const months = await db()
    .from("video_conversion_months")
    .select("month, cap_millis, reserved_millis, spent_millis, job_count, failure_count")
    .eq("month", month)
    .maybeSingle();
  if (months.error && !/schema|does not exist|42P01/i.test(months.error.message || "")) {
    return fail("Couldn't load the conversion budget.", 500);
  }
  const row = months.data;
  const reserved = Number(row?.reserved_millis ?? 0);
  const spent = Number(row?.spent_millis ?? 0);
  const cap = Number(row?.cap_millis ?? CONVERSION_CAP_MILLIS);
  const remaining = Math.max(0, cap - reserved - spent);
  return json({
    enabled: hevcConversionEnabled(),
    month,
    capUsd: cap / 1000,
    reservedUsd: reserved / 1000,
    spentUsd: spent / 1000,
    remainingUsd: remaining / 1000,
    jobCount: Number(row?.job_count ?? 0),
    failureCount: Number(row?.failure_count ?? 0),
    pendingUsd: reserved / 1000,
  }, 200, { "X-Robots-Tag": "noindex, nofollow" });
});
