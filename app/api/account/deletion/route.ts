import { db } from "@/lib/server/supabase";
import { requireAdmin } from "@/lib/server/auth";
import { enforceLimit, fail, json, readJson } from "@/lib/server/http";
import { currentRequest, deletionEnabled, DELETION_DELAY_DAYS, passwordMatches } from "@/lib/server/account-deletion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OFF = () => json({ error: "Self-service deletion isn't switched on yet. Contact support to delete your account.", code: "disabled" }, 503);

async function owner(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  // Only the account owner can request deletion of that account.
  const a = await db().from("accounts").select("id, owner_user_id").eq("id", admin.accountId).maybeSingle();
  if (a.error || !a.data) return fail("Couldn't load your account. Try again.", 500);
  if (a.data.owner_user_id !== admin.userId) return json({ error: "Only the account owner can delete this account.", code: "not_owner" }, 403);
  return admin;
}

export async function GET(req: Request) {
  const admin = await owner(req);
  if (admin instanceof Response) return admin;
  const r = await currentRequest(admin.accountId);
  if (r === "error") return fail("Couldn't load deletion status.", 500);
  return json({ enabled: deletionEnabled(), delayDays: DELETION_DELAY_DAYS, request: r });
}

// { confirm: "DELETE", password } schedules deletion in 7 days. The owner can cancel until then.
export async function POST(req: Request) {
  if (!deletionEnabled()) return OFF();
  const admin = await owner(req);
  if (admin instanceof Response) return admin;
  const limited = await enforceLimit(`delete:${admin.userId}`, 3600, 5, "Too many attempts. Try again later.");
  if (limited) return limited;
  const body = await readJson(req);
  if (body.confirm !== "DELETE") return json({ error: "Type DELETE to confirm.", code: "confirm" }, 400);
  if (typeof body.password !== "string" || !(await passwordMatches(admin.email, body.password))) {
    return json({ error: "That password isn't right.", code: "password" }, 403);
  }
  const r = await db().rpc("request_account_deletion", { p_account: admin.accountId, p_user: admin.userId });
  if (r.error) return /not_owner/.test(r.error.message)
    ? json({ error: "Only the account owner can delete this account.", code: "not_owner" }, 403)
    : fail("Couldn't schedule deletion. Try again.", 500);
  return json({ enabled: true, delayDays: DELETION_DELAY_DAYS, request: await currentRequest(admin.accountId) }, 202);
}

// Cancel a pending request.
export async function DELETE(req: Request) {
  const admin = await owner(req);
  if (admin instanceof Response) return admin;
  const r = await db().from("account_deletion_requests").update({ status: "canceled" })
    .eq("account_id", admin.accountId).eq("user_id", admin.userId).eq("status", "pending");
  if (r.error) return fail("Couldn't cancel. Try again.", 500);
  return json({ enabled: deletionEnabled(), delayDays: DELETION_DELAY_DAYS, request: null });
}
