import { executeBillingReminders } from "@/lib/server/billing-dispatch";
import { cronGate, dryRunRequested } from "@/lib/server/cron";
import { fail, json } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Unattended billing reminders. Bearer CRON_SECRET.
 * Does nothing unless BILLING_REMINDERS=1. ?dryRun=1 plans only: no email, no stamp.
 */
export async function GET(req: Request) {
  const gate = cronGate(req);
  if (gate) return gate;
  const dryRun = dryRunRequested(req);
  try {
    const result = await executeBillingReminders(dryRun);
    return json({ ok: true, ...result });
  } catch {
    console.info("billing-reminders failed code=unknown");
    return fail("Couldn't run billing reminders.", 500);
  }
}
