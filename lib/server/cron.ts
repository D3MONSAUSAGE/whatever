import { timingSafeEqual } from "node:crypto";
import { fail } from "@/lib/server/http";

/** Same gate as /api/cron/orphan-uploads: `Authorization: Bearer <CRON_SECRET>`. */
export function cronGate(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return fail("Cron isn't configured.", 503);
  const a = Buffer.from(req.headers.get("authorization") ?? "");
  const b = Buffer.from(`Bearer ${secret}`);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return fail("Unauthorized.", 401);
  return null;
}

export function dryRunRequested(req: Request) {
  const v = new URL(req.url).searchParams.get("dryRun");
  return v === "1" || v === "true";
}
