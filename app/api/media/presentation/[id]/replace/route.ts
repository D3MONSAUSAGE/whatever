import { BUCKET, db } from "@/lib/server/supabase";
import { requireAdmin } from "@/lib/server/auth";
import { isUuid } from "@/lib/server/crypto";
import { PPTX_MAX_BYTES } from "@/lib/server/pptx";
import { enforceLimit, fail, json, readJson } from "@/lib/server/http";
import { UPLOAD_MAX_PER_USER, UPLOAD_RATE_MESSAGE, UPLOAD_WINDOW_SECONDS } from "@/lib/server/limits";
import { GROUPS_UNAVAILABLE, deckFormat, groupSourcePath, presentationGroupsReady } from "@/lib/server/presentation-groups";
import { deckErrorMessage } from "@/lib/server/presentation-upload";
import { removeStored } from "@/lib/server/video";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Signed upload for a replacement file. The current slides stay live until commit. */
export async function POST(req: Request, ctx: Ctx) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  if (!(await presentationGroupsReady())) return fail(GROUPS_UNAVAILABLE, 503);
  const { id } = await ctx.params;
  if (!isUuid(id)) return fail("Presentation not found.", 404);

  const body = await readJson(req);
  const fileName = String(body.fileName ?? "");
  const format = deckFormat(fileName);
  if (!format) return fail(deckErrorMessage("type"), 400);
  const size = body.sizeBytes;
  if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) return fail(deckErrorMessage("empty", undefined, format), 400);
  if (size > PPTX_MAX_BYTES) return fail(deckErrorMessage("size", undefined, format), 413);

  const parent = await db()
    .from("media")
    .select("id, kind, group_revision, processing_status, updated_at")
    .eq("id", id)
    .eq("account_id", admin.accountId)
    .maybeSingle();
  if (parent.error) return fail("Couldn't start that replacement.", 500);
  if (!parent.data || parent.data.kind !== "presentation") return fail("Presentation not found.", 404);
  if (parent.data.processing_status === "processing") {
    const age = Date.now() - Date.parse(String(parent.data.updated_at ?? ""));
    if (Number.isFinite(age) && age < 2 * 60 * 1000) {
      return fail("That presentation is still being processed.", 409);
    }
  }

  const limited = await enforceLimit(
    `upload-pptx-init:${admin.userId}`,
    UPLOAD_WINDOW_SECONDS,
    UPLOAD_MAX_PER_USER,
    UPLOAD_RATE_MESSAGE,
  );
  if (limited) return limited;

  const generation = Number(parent.data.group_revision ?? 0) + 1;
  const path = groupSourcePath(admin.accountId, id, format.ext, generation);
  await removeStored([path]);
  const signed = await db().storage.from(BUCKET).createSignedUploadUrl(path);
  if (signed.error || !signed.data?.signedUrl) return fail("Couldn't start that replacement.", 500);
  return json({
    mediaId: id,
    path,
    generation,
    signedUrl: signed.data.signedUrl,
    mimeType: format.mime,
  }, 201);
}
