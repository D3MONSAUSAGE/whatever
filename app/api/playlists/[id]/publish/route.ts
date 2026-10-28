import { db } from "@/lib/server/supabase";
import { requireAdmin } from "@/lib/server/auth";
import { isUuid } from "@/lib/server/crypto";
import { isMissingSchema, PLAYLISTS_UNAVAILABLE } from "@/lib/server/schema";
import { fail, json, readJson } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const { id } = await params;
  if (!isUuid(id)) return fail("Playlist not found.", 404);
  const body = await readJson(req);
  const displayIds = Array.isArray(body.displayIds) ? body.displayIds : null;
  if (!displayIds || displayIds.length < 1 || displayIds.length > 50 || displayIds.some((item) => !isUuid(item))) {
    return fail("Choose at least one TV.", 400);
  }

  const { data: ok, error } = await db().rpc("publish_playlist", {
    p_account_id: admin.accountId,
    p_playlist_id: id,
    p_display_ids: displayIds,
  });
  if (error) {
    if (isMissingSchema(error)) return fail(PLAYLISTS_UNAVAILABLE, 503);
    return fail("Couldn't publish the playlist.", 500);
  }
  if (!ok) return fail("Add at least one image, then choose TVs from this account.", 400);
  return json({ ok: true });
}
