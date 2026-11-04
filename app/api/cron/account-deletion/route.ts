import { fail, json } from "@/lib/server/http";
import { cronGate, dryRunRequested } from "@/lib/server/cron";
import { deletionEnabled, runDueDeletions } from "@/lib/server/account-deletion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Deletes accounts whose 7-day deletion window has passed. Bearer CRON_SECRET; ?dryRun=1 only counts.
// Does nothing unless ACCOUNT_DELETION=1.
export async function GET(req: Request) {
  const gate = cronGate(req);
  if (gate) return gate;
  if (!deletionEnabled()) return json({ ok: true, enabled: false });
  const r = await runDueDeletions({ dryRun: dryRunRequested(req) });
  if ("error" in r) return fail("Couldn't run account deletions.", 500);
  return json({ ok: true, enabled: true, ...r });
}
