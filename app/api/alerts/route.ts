import { db } from "@/lib/server/supabase";
import { requireAdmin } from "@/lib/server/auth";
import { fail, json } from "@/lib/server/http";
import { isMissingSchema } from "@/lib/server/schema";
import { ALERTS_UNAVAILABLE, toAlert, type AlertRow } from "@/lib/server/alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Alerts feed, newest first. ?limit=1..100 (default 20) &before=ISO &unread=1
export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const params = new URL(req.url).searchParams;
  const limit = Math.min(100, Math.max(1, Number(params.get("limit") || "20") || 20));
  const before = params.get("before");
  if (before && Number.isNaN(Date.parse(before))) return fail("before must be an ISO date.", 400);
  const unreadOnly = params.get("unread") === "1" || params.get("unread") === "true";
  let q = db().from("alerts").select("id, display_id, display_name, kind, at, offline_since, offline_seconds, read_at, email_status")
    .eq("account_id", admin.accountId).order("at", { ascending: false }).limit(limit + 1);
  if (before) q = q.lt("at", new Date(before).toISOString());
  if (unreadOnly) q = q.is("read_at", null);
  const [r, unread] = await Promise.all([
    q,
    db().from("alerts").select("id", { count: "exact", head: true }).eq("account_id", admin.accountId).is("read_at", null),
  ]);
  if (r.error || unread.error) {
    const missing = isMissingSchema((r.error ?? unread.error)!);
    return fail(missing ? ALERTS_UNAVAILABLE : "Couldn't load alerts.", missing ? 503 : 500);
  }
  const rows = (r.data ?? []) as AlertRow[];
  const page = rows.slice(0, limit);
  return json({
    alerts: page.map(toAlert),
    unread: unread.count ?? 0,
    nextBefore: rows.length > limit ? page[page.length - 1].at : null,
  });
}
