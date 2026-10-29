import { db } from "@/lib/server/supabase";
import { requireAdmin } from "@/lib/server/auth";
import { isUuid } from "@/lib/server/crypto";
import { isMissingSchema } from "@/lib/server/schema";
import { fail, json, readJson } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

// Rename ({ name }), move or clear a location ({ locationId }, null clears),
// or publish ({ mediaId }, null clears the screen). A body with mediaId ignores the rest.
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

  const hasName = typeof body.name === "string";
  const hasLocation = "locationId" in body;
  if (!hasName && !hasLocation) return fail("Nothing to update.", 400);

  if (hasLocation) {
    if (body.locationId === null) {
      const cleared = await updateLocation(admin.accountId, id, null);
      if (cleared) return cleared;
    } else if (typeof body.locationId !== "string" || !isUuid(body.locationId)) {
      return fail("Location not found.", 404);
    } else {
      const location = await db()
        .from("locations")
        .select("id")
        .eq("id", body.locationId)
        .eq("account_id", admin.accountId)
        .maybeSingle();
      if (location.error) return fail("Couldn't move the screen. Try again.", 500);
      if (!location.data) return fail("Location not found.", 404);
      const moved = await updateLocation(admin.accountId, id, body.locationId);
      if (moved) return moved;
    }
  }

  if (hasName && typeof body.name === "string") {
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
  }

  return json({ ok: true });
}

async function updateLocation(accountId: string, displayId: string, locationId: string | null) {
  const moved = await db()
    .from("displays")
    .update({ location_id: locationId })
    .eq("id", displayId)
    .eq("account_id", accountId)
    .eq("status", "active")
    .select("id")
    .maybeSingle();
  if (moved.error) return fail("Couldn't move the screen. Try again.", 500);
  if (!moved.data) return fail("Display not found.", 404);
  return null;
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
