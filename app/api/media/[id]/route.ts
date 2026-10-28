import { BUCKET, db } from "@/lib/server/supabase";
import { requireAdmin } from "@/lib/server/auth";
import { isUuid } from "@/lib/server/crypto";
import { fail, json } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

// Clears the image from any TV showing it (they switch to "No content assigned").
export async function DELETE(req: Request, { params }: Ctx) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const { id } = await params;
  if (!isUuid(id)) return fail("Image not found.", 404);

  const { data: path, error } = await db().rpc("delete_media", {
    p_account_id: admin.accountId,
    p_media_id: id,
  });
  if (error) return fail("Couldn't delete. Try again.", 500);
  if (!path) return fail("Image not found.", 404);

  await db().storage.from(BUCKET).remove([path as string]);
  return json({ ok: true });
}
