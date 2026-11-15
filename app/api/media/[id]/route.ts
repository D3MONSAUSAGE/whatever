import { BUCKET, db } from "@/lib/server/supabase";
import { requireAdmin } from "@/lib/server/auth";
import { isUuid } from "@/lib/server/crypto";
import { isMissingSchema } from "@/lib/server/schema";
import { playlistDeleteMessage, playlistsUsingMedia } from "@/lib/server/media-usage";
import { fail, json, readJson } from "@/lib/server/http";
import { mediaRename } from "@/lib/media-rename";
import { withLocalizedErrors } from "@/lib/server/locale";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/**
 * U2-05: rename a file in Media. Display name only (file_name); the storage path,
 * playlists and screens are unchanged. Scoped to the signed-in admin's account.
 * Presentations keep their own rename at /api/media/presentation/[id].
 */
export const PATCH = withLocalizedErrors(async function PATCH(req: Request, { params }: Ctx) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const { id } = await params;
  if (!isUuid(id)) return fail("File not found.", 404);
  const row = await db()
    .from("media")
    .select("id, kind, file_name")
    .eq("id", id)
    .eq("account_id", admin.accountId)
    .maybeSingle();
  if (row.error) return fail("Couldn't rename that file. Try again.", 500);
  if (!row.data) return fail("File not found.", 404);
  if (row.data.kind === "presentation") return fail("Rename presentations with their own Rename button.", 400);
  const body = await readJson(req);
  const next = mediaRename(String(row.data.file_name ?? ""), body.name);
  if (!next.ok) return fail(next.error, 400);
  const saved = await db()
    .from("media")
    .update({ file_name: next.name })
    .eq("id", id)
    .eq("account_id", admin.accountId)
    .select("id, file_name")
    .maybeSingle();
  if (saved.error) return fail("Couldn't rename that file. Try again.", 500);
  if (!saved.data) return fail("File not found.", 404);
  return json({ id, fileName: String(saved.data.file_name) });
});

// Clears the image from any TV showing it. Refuses while a playlist still uses it.
export const DELETE = withLocalizedErrors(async function DELETE(req: Request, { params }: Ctx) {
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
});
