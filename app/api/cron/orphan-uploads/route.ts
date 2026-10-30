import { timingSafeEqual } from "node:crypto";
import { fail, json } from "@/lib/server/http";
import { cleanupOrphanUploads } from "@/lib/server/orphan-uploads";
import { db } from "@/lib/server/supabase";
import { isMissingSchema } from "@/lib/server/schema";
import { deliverAlertEmails } from "@/lib/server/alerts";

const ANALYTICS_RETENTION_DAYS = 90;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when that env var is set.
// Hobby allows one run a day; vercel.json schedules this route.
export async function GET(req: Request) {
  const gate = cronGate(req);
  if (gate) return gate;
  const dryRun = dryRunRequested(req);
  const result = await cleanupOrphanUploads({ dryRun });
  if (!result.ok) return fail("Couldn't clean up uploads.", 500);
  // M8 retention: analytics older than 90 days. Dry run only counts.
  const purge = await db().rpc("analytics_purge", { p_days: ANALYTICS_RETENTION_DAYS, p_dry_run: dryRun });
  const analytics = purge.error ? (isMissingSchema(purge.error) ? null : { error: true }) : purge.data;
  // M9: alerts kept 90 days; also a once-a-day safety net for the minute-by-minute pg_cron check and email.
  const alertPurge = await db().rpc("alerts_purge", { p_days: ANALYTICS_RETENTION_DAYS, p_dry_run: dryRun });
  let alerts: unknown = alertPurge.error ? (isMissingSchema(alertPurge.error) ? null : { error: true }) : alertPurge.data;
  if (!alertPurge.error) {
    let check: unknown = null;
    if (!dryRun) {
      const c = await db().rpc("check_offline_alerts");
      check = c.error ? { error: true } : c.data;
    }
    const email = await deliverAlertEmails({ dryRun }).catch(() => ({ error: true }));
    alerts = { ...(alertPurge.data as object), check, email };
  }
  return json({ ...result, analytics, alerts });
}

function cronGate(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return fail("Cleanup isn't configured.", 503);
  const header = req.headers.get("authorization") ?? "";
  if (!safeEqual(header, `Bearer ${secret}`)) return fail("Unauthorized.", 401);
  return null;
}

function dryRunRequested(req: Request) {
  const value = new URL(req.url).searchParams.get("dryRun");
  return value === "1" || value === "true";
}

function safeEqual(provided: string, expected: string) {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
