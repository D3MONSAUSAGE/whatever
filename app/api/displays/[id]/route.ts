import { db } from "@/lib/server/supabase";
import { requireAdmin } from "@/lib/server/auth";
import { isUuid } from "@/lib/server/crypto";
import { isMissingSchema } from "@/lib/server/schema";
import { fail, json, readJson } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

// Rename ({ name }) or publish ({ mediaId }, null clears the screen).
export async function PATCH(req: Request, { params }: Ctx) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const { id } = await params;
  if (!isUuid(id)) return fail("Display not found.", 404);
  const body = await readJson(req);

  if ("mediaId" in body) {
    const mediaId = body.mediaId === null ? null : body.mediaId;
    if (mediaId !== null && !isUuid(mediaId)) return fail("Image not found.", 404);
    if (mediaId !== null) {
      const looked = await db().from("media").select("id, kind").eq("id", mediaId).eq("account_id", admin.accountId).maybeSingle();
      if (looked.error && !isMissingSchema(looked.error)) return fail("Couldn't publish. Try again.", 500);
      if (!looked.error && looked.data?.kind === "video") {
        return fail("Publish a video from a playlist. A single screen assignment has to be an image.", 400);
      }
    }
    const { data: ok, error } = await db().rpc("assign_media", {
      p_account_id: admin.accountId,
      p_display_id: id,
      p_media_id: mediaId,
    });
    if (error) return fail("Couldn't publish. Try again.", 500);
    if (!ok) return fail("Display or image not found.", 404);
    return json({ ok: true });
  }

  if (typeof body.name === "string") {
    const name = body.name.trim().slice(0, 60);
    if (!name) return fail("Name can't be empty.", 400);
    const { data, error } = await db()
      .from("displays")
      .update({ name })
      .eq("id", id)
      .eq("account_id", admin.accountId)
      .eq("status", "active")
      .select("id")
      .maybeSingle();
    if (error) return fail("Couldn't rename. Try again.", 500);
    if (!data) return fail("Display not found.", 404);
    return json({ ok: true });
  }

  return fail("Nothing to update.", 400);
}

// Disconnect: revokes the TV's token immediately; the TV returns to its pairing screen.
export async function DELETE(req: Request, { params }: Ctx) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const { id } = await params;
  if (!isUuid(id)) return fail("Display not found.", 404);

  const { data, error } = await db()
    .from("displays")
    .update({ status: "revoked", token_hash: null })
    .eq("id", id)
    .eq("account_id", admin.accountId)
    .select("id")
    .maybeSingle();
  if (error) return fail("Couldn't disconnect. Try again.", 500);
  if (!data) return fail("Display not found.", 404);
  return json({ ok: true });
}
