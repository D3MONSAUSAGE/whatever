import { db } from "@/lib/server/supabase";
import { requireAdmin } from "@/lib/server/auth";
import { isUuid } from "@/lib/server/crypto";
import { isMissingSchema, PLAYLISTS_UNAVAILABLE, SCHEDULES_UNAVAILABLE } from "@/lib/server/schema";
import { PUBLISH_MAX_PER_USER, PUBLISH_RATE_MESSAGE, PUBLISH_WINDOW_SECONDS } from "@/lib/server/limits";
import { enforceLimit, fail, json } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

// Copy the draft into the published slides. Does not assign or clear screens.
// Displays already using this playlist as their everyday assignment reload
// because content_version increments. A schedule reads this snapshot.
export async function POST(req: Request, { params }: Ctx) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const { id } = await params;
  if (!isUuid(id)) return fail("Playlist not found.", 404);
  const limited = await enforceLimit(`snapshot:${admin.userId}`, PUBLISH_WINDOW_SECONDS, PUBLISH_MAX_PER_USER, PUBLISH_RATE_MESSAGE);
  if (limited) return limited;

  const { data, error } = await db().rpc("snapshot_playlist", {
    p_account_id: admin.accountId,
    p_playlist_id: id,
  });
  if (error) {
    if (isMissingSchema(error)) {
      const missingSnapshot = /snapshot_playlist/i.test(error.message || "") || error.code === "PGRST202" || error.code === "42883";
      return fail(missingSnapshot ? SCHEDULES_UNAVAILABLE : PLAYLISTS_UNAVAILABLE, 503);
    }
    return fail("Couldn't publish the slides.", 500);
  }
  if (!data) return fail("Add at least one slide, then publish the slides.", 400);
  return json({ ok: true });
}
