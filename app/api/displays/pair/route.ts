import { db } from "@/lib/server/supabase";
import { requireAdmin } from "@/lib/server/auth";
import { hashCode } from "@/lib/server/crypto";
import {
  PAIR_CLAIM_MAX_PER_IP,
  PAIR_CLAIM_MAX_PER_USER,
  PAIR_CLAIM_WINDOW_SECONDS,
} from "@/lib/server/limits";
import { normalizeDisplayName, normalizePairingCode } from "@/lib/server/validate";
import { allow, clientIp, fail, json, readJson } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin enters the code shown on the TV.
export async function POST(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;

  const body = await readJson(req);
  const code = normalizePairingCode(body.code);
  const name = normalizeDisplayName(body.name);
  if (!code) return fail("Enter the 6-digit code shown on the TV.", 400);
  if (!name) return fail("Give this TV a name, like “Front counter”.", 400);

  // Count only real code attempts, so a blank form doesn't burn the budget.
  const okUser = await allow(`pair-claim:user:${admin.userId}`, PAIR_CLAIM_WINDOW_SECONDS, PAIR_CLAIM_MAX_PER_USER);
  const okIp = await allow(`pair-claim:ip:${clientIp(req)}`, PAIR_CLAIM_WINDOW_SECONDS, PAIR_CLAIM_MAX_PER_IP);
  if (!okUser || !okIp) return fail("Too many attempts. Wait 15 minutes, then try again.", 429);

  const { data: displayId, error } = await db().rpc("claim_pairing", {
    p_code_hash: hashCode(code),
    p_account_id: admin.accountId,
    p_name: name,
  });
  if (error) return fail("Couldn't connect the TV. Try again.", 500);
  if (!displayId) {
    return fail("That code doesn't match a TV. Check the screen — codes expire after 10 minutes.", 404);
  }
  return json({ id: displayId });
}
