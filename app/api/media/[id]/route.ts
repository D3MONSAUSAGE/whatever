import { BUCKET, db } from "@/lib/server/supabase";
import { requireAdmin } from "@/lib/server/auth";
import { isUuid } from "@/lib/server/crypto";
import { isMissingSchema } from "@/lib/server/schema";
import { fail, json } from "@/lib/server/http";

const IN_PLAYLIST = "This image is in a playlist. Remove it from the playlist and publish again before deleting it.";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

// Clears the image from any TV showing it. Refuses while a playlist still uses it.
export async function DELETE(req: Request, { params }: Ctx) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const { id } = await params;
  if (!isUuid(id)) return fail("Image not found.", 404);

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
  if (!path) return fail("Image not found.", 404);

  await db().storage.from(BUCKET).remove([path as string]);
  return json({ ok: true });
}
