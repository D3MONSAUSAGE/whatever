import { json } from "@/lib/server/http";
import { withLocalizedErrors } from "@/lib/server/locale";
import { developerFromRequest } from "@/lib/server/dev-analytics/authz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Is the signed-in user an allowlisted developer (public.developer_users, role developer or admin)?
 * Used only to decide whether the app shows the "Developer Dashboard" link. It is not a security boundary:
 * every developer data API checks the caller again on each request.
 *
 * Same gate and same plain 404 as /api/developer/analytics: signed out, bad token, regular customer, or
 * DEV_ANALYTICS_DISABLED=1 all look identical, and no account is ever created by asking.
 */
export const GET = async (req: Request): Promise<Response> => {
  const userId = await developerFromRequest(req);
  // Built outside withLocalizedErrors (like the other developer routes): that path resolves the session
  // locale via requireAdmin, which would create an account for a signed-in non-developer.
  if (!userId) return json({ error: "Not found.", code: "not_found" }, 404);
  return confirmed(req);
};

// Only confirmed developers reach this, so any error text is localized like every other customer route.
const confirmed = withLocalizedErrors(async function confirmed(_req: Request) {
  return json({ developer: true }, 200, { "X-Robots-Tag": "noindex, nofollow" });
});
