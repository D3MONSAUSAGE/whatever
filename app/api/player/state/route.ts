import { BUCKET, db } from "@/lib/server/supabase";
import { sha256 } from "@/lib/server/crypto";
import { fail, json } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const URL_TTL_SECONDS = 3600;

// TV poll (every 10s) and heartbeat. `?v=` is the version the TV is showing;
// a signed URL is only issued when it differs.
export async function GET(req: Request) {
  const token = req.headers.get("x-display-token") || "";
  if (token.length < 20 || token.length > 200) return fail("unauthorized", 401);

  const { data, error } = await db().rpc("player_state", { p_token_hash: sha256(token) });
  if (error) return fail("unavailable", 503);
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return fail("unauthorized", 401);

  const version: number = row.content_version;
  const shown = new URL(req.url).searchParams.get("v");
  if (shown !== null && shown !== "" && Number(shown) === version) {
    return json({ version, unchanged: true });
  }
  if (!row.storage_path) return json({ version, mediaId: null, url: null });

  const { data: signed, error: signErr } = await db()
    .storage.from(BUCKET)
    .createSignedUrl(row.storage_path, URL_TTL_SECONDS);
  // Image missing or storage hiccup: TV keeps its last image and retries.
  if (signErr || !signed) return fail("unavailable", 503);

  return json({ version, mediaId: row.media_id, url: signed.signedUrl });
}
