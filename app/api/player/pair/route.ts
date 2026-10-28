import { db } from "@/lib/server/supabase";
import { hashCode, randomCode, randomToken, sha256 } from "@/lib/server/crypto";
import { PAIRING_TTL_SECONDS, PAIR_CREATE_MAX_PER_IP, PAIR_CREATE_WINDOW_SECONDS } from "@/lib/server/limits";
import { allow, clientIp, fail, json } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// TV asks for a pairing code. Unauthenticated, so rate-limited per IP.
export async function POST(req: Request) {
  if (!(await allow(`pair-create:${clientIp(req)}`, PAIR_CREATE_WINDOW_SECONDS, PAIR_CREATE_MAX_PER_IP))) {
    return fail("Too many pairing requests. Try again later.", 429);
  }
  await db().rpc("cleanup_stale");

  const secret = randomToken(32);
  const expiresAt = new Date(Date.now() + PAIRING_TTL_SECONDS * 1000).toISOString();

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    const { data, error } = await db()
      .from("pairing_sessions")
      .insert({ code_hash: hashCode(code), session_secret_hash: sha256(secret), expires_at: expiresAt })
      .select("id")
      .single();
    if (!error && data) {
      return json({ sessionId: data.id, code, secret, expiresInSeconds: PAIRING_TTL_SECONDS });
    }
    if (error?.code !== "23505") break; // only retry on code collision
  }
  return fail("Couldn't create a pairing code.", 500);
}
