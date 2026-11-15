import { db } from "@/lib/server/supabase";
import { sha256 } from "@/lib/server/crypto";
import { fail, json } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * E5: "Unpair this TV" from the TV itself. The TV's own token is the only credential: it is
 * cleared, so this TV stops playing and shows a pairing code. The screen stays in the account
 * with its content, schedules and groups (shown as Waiting), ready to be reconnected (B2-06)
 * or removed by the owner. Nothing else is changed.
 */
export async function POST(req: Request) {
  // Same credential as GET /api/player/state: the TV's own display token.
  const token = req.headers.get("x-display-token") || "";
  if (token.length < 20 || token.length > 200) return fail("Not paired.", 401);
  const { data, error } = await db()
    .from("displays")
    .update({ token_hash: null })
    .eq("token_hash", sha256(token))
    .eq("status", "active")
    .select("id")
    .maybeSingle();
  if (error) return fail("Couldn't unpair this TV. Try again.", 500);
  if (!data) return fail("Not paired.", 401);
  return json({ ok: true });
}
