import { db } from "@/lib/server/supabase";
import { requireAdmin } from "@/lib/server/auth";
import { isUuid } from "@/lib/server/crypto";
import { normalizePlaybackMode } from "@/lib/server/validate";
import { fail, json, readJson } from "@/lib/server/http";
import { isMissingSchema } from "@/lib/server/schema";
import { displayAccess, loadRemoteScreen } from "@/lib/server/remote";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/**
 * Switch the screen's assigned playlist between Automatic and Manual.
 * Returns the updated screen state. Updates that playlist's published mode
 * (every screen on the same playlist picks up the change).
 */
export async function POST(req: Request, { params }: Ctx) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const { id } = await params;
  if (!isUuid(id)) return fail("Screen not found.", 404);

  const access = await displayAccess(admin.accountId, id);
  if (access === "foreign") return fail("You don't have access to that screen.", 403);
  if (access === "missing") return fail("Screen not found.", 404);
  if (access === "error") return fail("Couldn't change playback mode.", 500);

  const body = await readJson(req);
  const mode = normalizePlaybackMode(body.playbackMode);
  if (!mode) return fail("Choose Automatic or Manual slideshow.", 400);

  const { data, error } = await db().rpc("set_display_playlist_mode", {
    p_account_id: admin.accountId,
    p_display_id: id,
    p_user_id: admin.userId,
    p_mode: mode,
  });
  if (error) {
    if (isMissingSchema(error)) return fail("Remote control is not available yet.", 503);
    return fail("Couldn't change playback mode.", 500);
  }
  if (!data) {
    return fail("Screen has no published playlist assigned.", 404);
  }

  const loaded = await loadRemoteScreen(admin.accountId, id);
  if (!loaded.ok) return fail("Couldn't load screen state.", 500);
  return json({ ok: true, playbackMode: mode, screen: loaded.screen });
}
