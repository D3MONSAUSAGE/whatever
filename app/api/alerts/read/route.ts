import { db } from "@/lib/server/supabase";
import { requireAdmin } from "@/lib/server/auth";
import { fail, json, readJson } from "@/lib/server/http";
import { isMissingSchema } from "@/lib/server/schema";
import { isUuid } from "@/lib/server/crypto";
import { ALERTS_UNAVAILABLE } from "@/lib/server/alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// { ids: [uuid, ...] } (max 100) or { all: true }. Marks this account's alerts read.
export async function POST(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const body = await readJson(req);
  let q = db().from("alerts").update({ read_at: new Date().toISOString() }).eq("account_id", admin.accountId).is("read_at", null);
  if (body.all === true) {
    // every unread alert
  } else if (Array.isArray(body.ids) && body.ids.length > 0 && body.ids.length <= 100 && body.ids.every((x) => typeof x === "string" && isUuid(x))) {
    q = q.in("id", body.ids as string[]);
  } else {
    return fail("Send { ids: [...] } (up to 100) or { all: true }.", 400);
  }
  const r = await q.select("id");
  if (r.error) {
    const missing = isMissingSchema(r.error);
    return fail(missing ? ALERTS_UNAVAILABLE : "Couldn't update alerts.", missing ? 503 : 500);
  }
  return json({ ok: true, marked: (r.data ?? []).length });
}
