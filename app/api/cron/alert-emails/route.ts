import { fail, json } from "@/lib/server/http";
import { cronGate, dryRunRequested } from "@/lib/server/cron";
import { deliverAlertEmails } from "@/lib/server/alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Sends pending alert emails. Called by pg_cron/pg_net once email is turned on (docs/ALERTS.md),
// and by the daily Vercel cron as a fallback. Bearer CRON_SECRET. ?dryRun=1 changes nothing.
export async function GET(req: Request) {
  const gate = cronGate(req);
  if (gate) return gate;
  const result = await deliverAlertEmails({ dryRun: dryRunRequested(req) });
  if (result.error) return fail("Couldn't deliver alert emails.", 500);
  return json({ ok: true, ...result });
}
