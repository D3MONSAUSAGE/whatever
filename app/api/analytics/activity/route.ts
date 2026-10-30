import { db } from "@/lib/server/supabase";
import { requireAdmin } from "@/lib/server/auth";
import { fail, json } from "@/lib/server/http";
import { analyticsFail } from "@/lib/server/analytics-routes";
import { isMissingSchema } from "@/lib/server/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const params = new URL(req.url).searchParams;
  const limit = Math.min(100, Math.max(1, Number(params.get("limit") || "50") || 50));
  const before = params.get("before");
  if (before && Number.isNaN(Date.parse(before))) return fail("before must be an ISO date.", 400);
  let q = db().from("activity_events").select("at, kind, subject_id, subject_name, detail")
    .eq("account_id", admin.accountId).order("at", { ascending: false }).limit(limit + 1);
  if (before) q = q.lt("at", new Date(before).toISOString());
  const r = await q;
  if (r.error) return analyticsFail({ missing: isMissingSchema(r.error) });
  const rows = (r.data ?? []) as { at: string; kind: string; subject_id: string | null; subject_name: string | null; detail: unknown }[];
  const page = rows.slice(0, limit);
  return json({
    events: page.map((x) => ({ at: x.at, kind: x.kind, subjectId: x.subject_id, subjectName: x.subject_name, detail: x.detail ?? {} })),
    nextBefore: rows.length > limit ? page[page.length - 1].at : null,
  });
}
