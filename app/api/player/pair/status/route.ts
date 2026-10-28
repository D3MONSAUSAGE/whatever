import { db } from "@/lib/server/supabase";
import { isUuid, randomToken, sha256 } from "@/lib/server/crypto";
import { json, readJson } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// TV polls with its session secret. Once the admin has claimed the code,
// the TV receives its display token exactly once.
export async function POST(req: Request) {
  const { sessionId, secret } = await readJson(req);
  if (!isUuid(sessionId) || typeof secret !== "string" || secret.length < 20) {
    return json({ status: "expired" });
  }
  const secretHash = sha256(secret);

  const { data: session } = await db()
    .from("pairing_sessions")
    .select("status, expires_at")
    .eq("id", sessionId)
    .eq("session_secret_hash", secretHash)
    .maybeSingle();

  if (!session) return json({ status: "expired" });
  if (session.status === "pending") {
    return json({ status: new Date(session.expires_at) > new Date() ? "pending" : "expired" });
  }
  if (session.status !== "claimed") return json({ status: "expired" });

  // Atomic hand-off: only one request can flip claimed -> completed.
  const { data: done } = await db()
    .from("pairing_sessions")
    .update({ status: "completed" })
    .eq("id", sessionId)
    .eq("session_secret_hash", secretHash)
    .eq("status", "claimed")
    .select("display_id")
    .maybeSingle();
  if (!done?.display_id) return json({ status: "expired" });

  const token = randomToken(32);
  const { data: display } = await db()
    .from("displays")
    .update({ token_hash: sha256(token) })
    .eq("id", done.display_id)
    .eq("status", "active")
    .select("id")
    .maybeSingle();
  if (!display) return json({ status: "expired" }); // disconnected before the TV collected

  return json({ status: "paired", token });
}
