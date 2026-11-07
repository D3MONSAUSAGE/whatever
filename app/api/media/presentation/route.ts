import { BUCKET, db } from "@/lib/server/supabase";
import { requireAdmin } from "@/lib/server/auth";
import {
  PPTX_MAX_BYTES,
  PRESENTATION_UNAVAILABLE,
  presentationSchemaReady,
} from "@/lib/server/pptx";
import { GROUPS_UNAVAILABLE, deckFormat, groupSourcePath, presentationGroupsReady } from "@/lib/server/presentation-groups";
import { deckErrorMessage } from "@/lib/server/presentation-upload";
import { UPLOAD_MAX_PER_USER, UPLOAD_RATE_MESSAGE, UPLOAD_WINDOW_SECONDS } from "@/lib/server/limits";
import { enforceLimit, fail, json, readJson } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Hands the browser a signed upload URL for a .pptx or PDF (body never hits this function). */
export async function POST(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const groups = await presentationGroupsReady();
  if (!groups && !(await presentationSchemaReady())) return fail(PRESENTATION_UNAVAILABLE, 503);

  const body = await readJson(req);
  const fileName = String(body.fileName ?? "presentation.pptx");
  const format = deckFormat(fileName);
  if (!format) return fail(deckErrorMessage("type"), 400);
  if (format.ext === "pdf" && !groups) return fail(GROUPS_UNAVAILABLE, 503);
  const size = body.sizeBytes;
  if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) {
    return fail(deckErrorMessage("empty", undefined, format), 400);
  }
  if (size > PPTX_MAX_BYTES) return fail(deckErrorMessage("size", undefined, format), 413);

  const limited = await enforceLimit(
    `upload-pptx-init:${admin.userId}`,
    UPLOAD_WINDOW_SECONDS,
    UPLOAD_MAX_PER_USER,
    UPLOAD_RATE_MESSAGE,
  );
  if (limited) return limited;

  const mediaId = crypto.randomUUID();
  const path = groupSourcePath(admin.accountId, mediaId, format.ext);
  const signed = await db().storage.from(BUCKET).createSignedUploadUrl(path);
  if (signed.error || !signed.data?.signedUrl || !signed.data.token) {
    return fail("Couldn't start the upload. Try again.", 500);
  }
  return json({
    mediaId,
    path,
    token: signed.data.token,
    signedUrl: signed.data.signedUrl,
    mimeType: format.mime,
  }, 201);
}
