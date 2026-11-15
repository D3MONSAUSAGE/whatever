import { db } from "@/lib/server/supabase";
import { requireAdmin } from "@/lib/server/auth";
import { hashCode, isUuid } from "@/lib/server/crypto";
import { PAIR_CLAIM_MAX_PER_IP, PAIR_CLAIM_MAX_PER_USER, PAIR_CLAIM_WINDOW_SECONDS } from "@/lib/server/limits";
import { normalizePairingCode } from "@/lib/server/validate";
import { allow, clientIp, fail, json, readJson } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/**
 * B2-06: connect the TV showing this pairing code to an existing screen, keeping the screen's
 * content, schedules and groups. The old TV for this screen is disconnected. Same code checks
 * and rate limits as adding a screen (POST /api/displays/pair); no screen is added.
 */
export async function POST(req: Request, { params }: Ctx) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const { id } = await params;
  if (!isUuid(id)) return fail("That screen is not in this account.", 404);

  const body = await readJson(req);
  const code = normalizePairingCode(body.code);
  if (!code) return fail("Enter the 6-digit code shown on the TV.", 400);

  const okUser = await allow(`pair-claim:user:${admin.userId}`, PAIR_CLAIM_WINDOW_SECONDS, PAIR_CLAIM_MAX_PER_USER);
  const okIp = await allow(`pair-claim:ip:${clientIp(req)}`, PAIR_CLAIM_WINDOW_SECONDS, PAIR_CLAIM_MAX_PER_IP);
  if (!okUser || !okIp) return fail("Too many attempts. Wait 15 minutes, then try again.", 429);

  const { data: displayId, error } = await db().rpc("reconnect_display", {
    p_code_hash: hashCode(code),
    p_account_id: admin.accountId,
    p_display_id: id,
  });
  if (error && /display_not_found/.test(error.message || "")) return fail("That screen is not in this account.", 404);
  if (error) return fail("Couldn't connect the TV. Try again.", 500);
  if (!displayId) return fail("That code doesn't match a TV. Check the screen — codes expire after 10 minutes.", 404);
  return json({ id: displayId });
}
