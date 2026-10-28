import { BUCKET, db } from "@/lib/server/supabase";
import { requireAdmin } from "@/lib/server/auth";
import { isUuid } from "@/lib/server/crypto";
import { isMissingSchema } from "@/lib/server/schema";
import { fail, json } from "@/lib/server/http";

const IN_PLAYLIST = "This file is in a playlist. Remove it from the playlist and publish again before deleting it.";

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

  const used = await db()
    .from("playlist_items")
    .select("id")
    .eq("account_id", admin.accountId)
    .eq("media_id", id);
  if (used.error && !isMissingSchema(used.error)) return fail("Couldn't delete. Try again.", 500);
  if (!used.error && (used.data?.length ?? 0) > 0) return fail(IN_PLAYLIST, 409);

  const { data: path, error } = await db().rpc("delete_media", {
    p_account_id: admin.accountId,
    p_media_id: id,
  });
  if (error) {
    if (String(error.message || "").includes("media_in_playlist")) return fail(IN_PLAYLIST, 409);
    return fail("Couldn't delete. Try again.", 500);
  }
  if (!path) return fail("File not found.", 404);

  const paths = [path as string];
  if (thumbnail && thumbnail.startsWith(`${admin.accountId}/`) && thumbnail !== path) paths.push(thumbnail);
  await db().storage.from(BUCKET).remove(paths);
  return json({ ok: true });
}
