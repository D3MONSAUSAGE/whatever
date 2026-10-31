import { fail, json } from "@/lib/server/http";
import { cronGate, dryRunRequested } from "@/lib/server/cron";
import { deliverAlertPushes } from "@/lib/server/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Sends pending alert pushes over FCM and purges stale device tokens. Bearer CRON_SECRET.
// ?dryRun=1 changes nothing. Push stays off (alerts marked skipped) until FCM_SERVICE_ACCOUNT is set.
export async function GET(req: Request) {
  const gate = cronGate(req);
  if (gate) return gate;
  const result = await deliverAlertPushes({ dryRun: dryRunRequested(req) });
  if (result.error) return fail("Couldn't deliver alert pushes.", 500);
  return json({ ok: true, ...result });
}
