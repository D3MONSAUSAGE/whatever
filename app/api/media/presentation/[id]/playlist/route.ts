import { db } from "@/lib/server/supabase";
import { requireAdmin } from "@/lib/server/auth";
import { isUuid } from "@/lib/server/crypto";
import { PRESENTATION_UNAVAILABLE, presentationSchemaReady } from "@/lib/server/pptx";
import { normalizePlaybackMode, normalizePlaylistName } from "@/lib/server/validate";
import { fail, json, readJson } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Create a playlist from an already-converted presentation's slides. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  if (!(await presentationSchemaReady())) return fail(PRESENTATION_UNAVAILABLE, 503);

  const { id } = await ctx.params;
  if (!isUuid(id)) return fail("Presentation not found.", 404);

  const source = await db()
    .from("media")
    .select("id, file_name, kind")
    .eq("id", id)
    .eq("account_id", admin.accountId)
    .maybeSingle();
  if (source.error) return fail("Couldn't create the playlist.", 500);
  if (!source.data || source.data.kind !== "presentation") return fail("Presentation not found.", 404);

  const body = await readJson(req);
  const playbackMode = normalizePlaybackMode(body.playbackMode) ?? "manual";
  const name = normalizePlaylistName(body.name)
    ?? (String(source.data.file_name || "Presentation").replace(/\.pptx$/i, "").slice(0, 80) || "Presentation");

  const created = await db().rpc("presentation_create_playlist", {
    p_account_id: admin.accountId,
    p_source_media_id: id,
    p_name: name,
    p_playback_mode: playbackMode,
  });
  if (created.error || !created.data) {
    return fail("Couldn't create a playlist from that presentation. Check it still has slides.", 400);
  }
  return json({ id: String(created.data), playbackMode }, 201);
}
