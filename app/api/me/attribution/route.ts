import { requireAdmin } from "@/lib/server/auth";
import { fail, json, readJson } from "@/lib/server/http";
import { stampSignupAttribution } from "@/lib/server/signup-attribution";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Persist first-touch UTMs on a new account. No-op if already set or the account is older. */
export async function POST(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const body = await readJson(req);
  const status = await stampSignupAttribution(admin.accountId, body);
  if (status === "empty") return fail("No attribution to save.", 400);
  return json({ ok: true, status });
}
