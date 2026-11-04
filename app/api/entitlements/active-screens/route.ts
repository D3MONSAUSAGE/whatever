import { db } from "@/lib/server/supabase";
import { requireAdmin } from "@/lib/server/auth";
import { isUuid } from "@/lib/server/crypto";
import { fail, json, readJson } from "@/lib/server/http";
import { loadEntitlement, toResponse } from "@/lib/server/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Choose which screens stay on: { displayIds: [...] }, at most the plan's screen count.
 * The rest pause (billing_active = false); nothing is deleted. Returns the entitlements body.
 * 400 too many / bad body, 403 an id that isn't one of this account's screens.
 */
export async function POST(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const body = await readJson(req);
  const ids = Array.isArray(body.displayIds) ? body.displayIds : null;
  if (!ids || ids.length > 100 || !ids.every((x: unknown) => typeof x === "string" && isUuid(x))) {
    return json({ error: "Choose the screens to keep on.", code: "invalid" }, 400);
  }
  const { data, error } = await db().rpc("select_billing_screens", { p_account: admin.accountId, p_display_ids: ids });
  if (error) return fail("Couldn't save your choice. Try again.", 500);
  if (data === "too_many") return json({ error: "That's more screens than your plan includes.", code: "too_many" }, 400);
  if (data === "not_found") return json({ error: "One of those screens wasn't found.", code: "not_found" }, 403);
  const e = await loadEntitlement(admin.accountId);
  if (e === "error" || !e) return fail("Saved, but couldn't reload your plan. Refresh to see it.", 503);
  return json(toResponse(admin.accountId, e, process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin));
}
