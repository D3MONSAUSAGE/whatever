import { enforceLimit, fail, json } from "@/lib/server/http";
import { withLocalizedErrors } from "@/lib/server/locale";
import { db } from "@/lib/server/supabase";
import { developerFromRequest } from "@/lib/server/dev-analytics/authz";
import { internalDomains } from "@/lib/server/dev-analytics/exclusions";
import { loadBilling } from "@/lib/server/dev-analytics/stripe-source";
import { buildAccounts, parseAccountsQuery, type AccountsList } from "@/lib/server/dev-accounts/build";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Same plain 404 as /api/developer/analytics, built outside withLocalizedErrors so a refused caller never
 * reaches requireAdmin/ensure_account (no account row is ever created by asking).
 */
const notFound = () => json({ error: "Not found.", code: "not_found" }, 404);
const RATE_WINDOW_S = 60;
const RATE_MAX = 30;

/**
 * DA-2 (t348u): developer-only Customer Accounts list. One row per registered person with the fields
 * Francisco asked for and nothing else (see lib/dev-accounts.ts). Read live on every request (no copies), so
 * deleted accounts vanish. DEV_ANALYTICS_DISABLED=1 or DEV_ACCOUNTS_DISABLED=1 turns it off for everyone.
 *
 * The page uses POST with a JSON body so an email search never sits in a URL (browser history, Vercel request
 * logs). GET still works for filters, sort and paging, but ignores any ?q= so a search can't be sent that way.
 * Both methods are gated identically, and the body is only read after the caller is confirmed a developer.
 */
export const GET = async (req: Request): Promise<Response> => {
  if (process.env.DEV_ACCOUNTS_DISABLED === "1") return notFound();
  const userId = await developerFromRequest(req);
  if (!userId) return notFound();
  return forDeveloper(req, userId, "GET");
};

export const POST = async (req: Request): Promise<Response> => {
  if (process.env.DEV_ACCOUNTS_DISABLED === "1") return notFound();
  const userId = await developerFromRequest(req);
  if (!userId) return notFound();
  return forDeveloper(req, userId, "POST");
};

/** Largest accepted POST body. The real one is a few small fields. */
const MAX_BODY_BYTES = 2048;
const BODY_FIELDS = ["population", "q", "sort", "dir", "page", "pageSize"] as const;

/** Allowlisted body fields as search params, so GET and POST share one parser. null = malformed. */
async function bodyParams(req: Request): Promise<URLSearchParams | null> {
  const text = await req.text().catch(() => null);
  if (text === null || text.length > MAX_BODY_BYTES) return null;
  let body: unknown;
  try { body = text ? JSON.parse(text) : {}; } catch { return null; }
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const out = new URLSearchParams();
  for (const k of BODY_FIELDS) {
    const v = (body as Record<string, unknown>)[k];
    if (typeof v === "string" || typeof v === "number") out.set(k, String(v));
  }
  return out;
}

const forDeveloper = withLocalizedErrors(async function forDeveloper(req: Request, userId: string, method: "GET" | "POST") {
  const limited = await enforceLimit(`dev-accounts:${userId}`, RATE_WINDOW_S, RATE_MAX, "Too many requests. Wait a minute, then try again.")
    .catch(() => fail("Too many requests. Wait a minute, then try again.", 429));
  if (limited) return limited;

  let params: URLSearchParams;
  if (method === "POST") {
    const parsed = await bodyParams(req);
    if (!parsed) return fail("Send a valid request.", 400, "bad_request");
    params = parsed;
  } else {
    params = new URL(req.url).searchParams;
    params.delete("q");
  }
  const query = parseAccountsQuery(params);
  const [list, billing] = await Promise.all([
    db().rpc("dev_accounts_list", { p_actor: userId }),
    loadBilling(Date.now()),
  ]);
  if (list.error) {
    if (list.error.code === "42501" || /not_authorized/.test(list.error.message || "")) return notFound();
    return fail("Couldn't load accounts.", 500);
  }
  const body = buildAccounts({ list: list.data as AccountsList, billing, query, domains: internalDomains() });
  // Access note without identifiers, emails or query text.
  console.info(`[dev-accounts] list population=${body.population} rows=${body.rows.length}`);
  return json(body, 200, { "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" });
});
