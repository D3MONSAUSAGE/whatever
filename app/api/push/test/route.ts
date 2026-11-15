import { requireAdmin } from "@/lib/server/auth";
import { readJson } from "@/lib/server/http";
import { sendTestPush } from "@/lib/server/push-test";
import { withLocalizedErrors } from "@/lib/server/locale";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/push/test, body {}. Signed in only; sends a test push to the caller's own devices (5/hour).
// 200 {devices, sent, failed} · 401 no session · 429 rate limited · 503 push not configured.
export const POST = withLocalizedErrors(async function POST(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  return sendTestPush(admin, await readJson(req));
});
