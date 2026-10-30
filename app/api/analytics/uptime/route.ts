import { requireAdmin } from "@/lib/server/auth";
import { fail, json } from "@/lib/server/http";
import { DAY, buildUptime, coverageStart, isErr, loadDisplays, locationZones, uptimeDaily } from "@/lib/server/analytics";
import { analyticsFail } from "@/lib/server/analytics-routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const days = Number(new URL(req.url).searchParams.get("days") || "7");
  if (days !== 7 && days !== 30) return fail("days must be 7 or 30.", 400);
  const now = Date.now();
  const displays = await loadDisplays(admin.accountId);
  if (isErr(displays)) return analyticsFail(displays);
  const [coverage, zones, rows] = await Promise.all([coverageStart(), locationZones(admin.accountId), uptimeDaily(admin.accountId, new Date(now - (days + 1) * DAY))]);
  if (isErr(coverage)) return analyticsFail(coverage);
  if (isErr(zones)) return analyticsFail(zones);
  if (isErr(rows)) return analyticsFail(rows);
  const result = buildUptime(displays, rows, days, coverage, zones, now);
  return json({ days, coverageFrom: coverage, screens: result.screens, overall: { uptimePct: result.overall } });
}
