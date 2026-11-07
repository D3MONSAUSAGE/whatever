import { BUCKET, db } from "@/lib/server/supabase";
import { requireAdmin } from "@/lib/server/auth";
import { isUuid } from "@/lib/server/crypto";
import { isMissingSchema } from "@/lib/server/schema";
import { playlistDeleteMessage, playlistsUsingMedia } from "@/lib/server/media-usage";
import { fail, json } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

// Clears the image from any TV showing it. Refuses while a playlist still uses it.
export async function DELETE(req: Request, { params }: Ctx) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const { id } = await params;
  if (!isUuid(id)) return fail("File not found.", 404);

  let thumbnail: string | null = null;
  const prior = await db()
    .from("media")
    .select("thumbnail_path")
    .eq("id", id)
    .eq("account_id", admin.accountId)
    .maybeSingle();
  if (prior.error && !isMissingSchema(prior.error)) return fail("Couldn't delete. Try again.", 500);
  if (!prior.error && typeof prior.data?.thumbnail_path === "string") thumbnail = prior.data.thumbnail_path;

  const detach = new URL(req.url).searchParams.get("detach") === "1";
  const kindRow = await db().from("media").select("kind").eq("id", id).eq("account_id", admin.accountId).maybeSingle();
  if (kindRow.error && !isMissingSchema(kindRow.error)) return fail("Couldn't delete. Try again.", 500);
  if (kindRow.data?.kind === "presentation") {
    if (!detach) {
      const children = await db().from("media").select("id").eq("account_id", admin.accountId).eq("source_media_id", id);
      if (children.error && !isMissingSchema(children.error)) return fail("Couldn't delete. Try again.", 500);
      const ids = [id, ...(children.data ?? []).map((row) => String(row.id))];
      const names: string[] = [];
      for (const mediaId of ids) {
        const lists = await playlistsUsingMedia(admin.accountId, mediaId);
        if (lists === null) return fail("Couldn't delete. Try again.", 500);
        names.push(...lists.map((playlist) => playlist.name));
      }
      if (names.length) return fail(playlistDeleteMessage(names), 409);
    }
    const removed = await db().rpc("delete_presentation_group", {
      p_account_id: admin.accountId,
      p_media_id: id,
    });
    if (!removed.error) {
      if (!removed.data) return fail("File not found.", 404);
      const paths = (removed.data as string[]).filter((path) => typeof path === "string" && path.startsWith(`${admin.accountId}/`));
      if (paths.length) await db().storage.from(BUCKET).remove(paths);
      return json({ ok: true });
    }
    if (!isMissingSchema(removed.error)) return fail("Couldn't delete. Try again.", 500);
  }

  const used = await playlistsUsingMedia(admin.accountId, id);
  if (used === null) return fail("Couldn't delete. Try again.", 500);
  if (used.length > 0) return fail(playlistDeleteMessage(used.map((playlist) => playlist.name)), 409);

  const { data: path, error } = await db().rpc("delete_media", {
    p_account_id: admin.accountId,
    p_media_id: id,
  });
  if (error) {
    if (String(error.message || "").includes("media_in_playlist")) return fail(playlistDeleteMessage([]), 409);
    return fail("Couldn't delete. Try again.", 500);
  }
  if (!path) return fail("File not found.", 404);

  const paths = [path as string];
  if (thumbnail && thumbnail.startsWith(`${admin.accountId}/`) && thumbnail !== path) paths.push(thumbnail);
  await db().storage.from(BUCKET).remove(paths);
  return json({ ok: true });
}
