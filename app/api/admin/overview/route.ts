import { db } from "@/lib/server/supabase";
import { requireAdmin } from "@/lib/server/auth";
import { fail, json } from "@/lib/server/http";
import { isStaff } from "@/lib/server/staff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Staff-only aggregate commercial metrics. Non-staff get a plain 404.
export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  if (!isStaff(admin.email)) return fail("Not found.", 404);
  const days = Math.min(365, Math.max(1, Number(new URL(req.url).searchParams.get("days") || "30") || 30));
  const r = await db().rpc("commercial_overview", { p_days: days });
  if (r.error) return fail("Couldn't load the overview.", 500);
  return json(r.data);
}
