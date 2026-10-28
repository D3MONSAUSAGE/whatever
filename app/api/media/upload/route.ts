import { BUCKET, db } from "@/lib/server/supabase";
import { requireAdmin } from "@/lib/server/auth";
import { VIDEO_UNAVAILABLE } from "@/lib/server/schema";
import { videoSchemaReady } from "@/lib/server/video";
import { MAX_VIDEO_BYTES, mp4ErrorMessage } from "@/lib/mp4";
import { fail, json, readJson } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Hands the browser a signed upload URL. The video bytes go straight to
// Storage and never through this function (Vercel caps request bodies at 4.5 MB).
export async function POST(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  if (!(await videoSchemaReady())) return fail(VIDEO_UNAVAILABLE, 503);

  const body = await readJson(req);
  const size = body.sizeBytes;
  if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) return fail(mp4ErrorMessage("type"), 400);
  if (size > MAX_VIDEO_BYTES) return fail(mp4ErrorMessage("size"), 413);

  const mediaId = crypto.randomUUID();
  const path = `${admin.accountId}/${mediaId}.mp4`;
  const signed = await db().storage.from(BUCKET).createSignedUploadUrl(path);
  if (signed.error || !signed.data?.signedUrl || !signed.data.token) {
    return fail("Couldn't start the upload. Try again.", 500);
  }
  return json({
    mediaId,
    path,
    token: signed.data.token,
    signedUrl: signed.data.signedUrl,
  }, 201);
}
