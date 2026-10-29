import { BUCKET, db } from "@/lib/server/supabase";
import { requireAdmin } from "@/lib/server/auth";
import { isUuid } from "@/lib/server/crypto";
import { VIDEO_UNAVAILABLE, isMissingSchema } from "@/lib/server/schema";
import { readStoredObject, removeStored, videoSchemaReady } from "@/lib/server/video";
import { normalizeFileName } from "@/lib/server/validate";
import {
  MAX_THUMB_BYTES,
  MAX_VIDEO_BYTES,
  MAX_VIDEO_DURATION_MS,
  MAX_VIDEO_EDGE,
  enforceVideoLimits,
  inspectMp4,
  memorySource,
  mp4ErrorMessage,
} from "@/lib/mp4";
import { UPLOAD_MAX_PER_USER, UPLOAD_RATE_MESSAGE, UPLOAD_WINDOW_SECONDS } from "@/lib/server/limits";
import { enforceLimit, fail, json, readJson } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Hobby Fluid Compute caps a function at 300s, which is also the platform default.
// Re-downloading and checking a 50 MB object needs that ceiling, so a lower project default cannot shrink this route.
export const maxDuration = 300;

// Confirms a direct-to-Storage upload: codec, duration, dimensions, then the library row.
// A retry after the row or the thumbnail was stored returns that same id and does not delete the objects.
export async function POST(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  if (!(await videoSchemaReady())) return fail(VIDEO_UNAVAILABLE, 503);

  const body = await readJson(req);
  const mediaId = body.mediaId;
  if (!isUuid(mediaId)) return fail("Upload didn't arrive. Try again.", 400);
  if (!positiveInt(body.durationMs) || !positiveInt(body.width) || !positiveInt(body.height)) {
    return fail("This browser couldn't read that video. Export it as H.264 MP4.", 415);
  }
  if (body.durationMs > MAX_VIDEO_DURATION_MS) return fail(mp4ErrorMessage("duration"), 415);
  if (body.width > MAX_VIDEO_EDGE || body.height > MAX_VIDEO_EDGE) return fail(mp4ErrorMessage("dimensions"), 415);
  const rateLimited = await enforceLimit(`upload-complete:${admin.userId}`, UPLOAD_WINDOW_SECONDS, UPLOAD_MAX_PER_USER, UPLOAD_RATE_MESSAGE);
  if (rateLimited) return rateLimited;

  const path = `${admin.accountId}/${mediaId}.mp4`;
  const thumbPath = `${admin.accountId}/${mediaId}-thumb.jpg`;
  const already = await ownMedia(admin.accountId, mediaId);
  if (already instanceof Response) return already;
  if (already) return json({ id: mediaId });

  const bytes = await readStoredObject(path);
  if (!bytes) {
    const won = await ownMedia(admin.accountId, mediaId);
    if (won instanceof Response) return won;
    if (won) return json({ id: mediaId });
    return fail("Upload didn't arrive. Try again.", 400);
  }
  if (bytes.length > MAX_VIDEO_BYTES) {
    return discard(admin.accountId, mediaId, [path, thumbPath], mp4ErrorMessage("size"), 413);
  }

  const inspected = await inspectMp4(memorySource(bytes));
  if (!inspected.ok) {
    return discard(admin.accountId, mediaId, [path, thumbPath], mp4ErrorMessage(inspected.reason), 415);
  }
  const limited = enforceVideoLimits(inspected, bytes.length);
  if (limited) {
    return discard(admin.accountId, mediaId, [path, thumbPath], mp4ErrorMessage(limited), limited === "size" ? 413 : 415);
  }

  const thumb = decodeThumb(body.thumbnailBase64);
  if (!thumb) {
    return discard(admin.accountId, mediaId, [path, thumbPath], "Couldn't save the preview image for that video. Try again.", 415);
  }
  const uploaded = await db().storage.from(BUCKET).upload(thumbPath, thumb, {
    contentType: "image/jpeg",
    cacheControl: "86400",
    upsert: false,
  });
  // upsert stays false. "Already exists" means a previous attempt stored the preview and then stopped before the insert.
  if (uploaded.error && !storageAlreadyExists(uploaded.error)) {
    return discard(admin.accountId, mediaId, [path, thumbPath], "Couldn't save that video. Try again.", 500);
  }

  const inserted = await db().from("media").insert({
    id: mediaId,
    account_id: admin.accountId,
    file_name: normalizeFileName(body.fileName),
    storage_path: path,
    mime_type: "video/mp4",
    size_bytes: bytes.length,
    kind: "video",
    duration_ms: inspected.durationMs,
    width: inspected.width,
    height: inspected.height,
    thumbnail_path: thumbPath,
  });
  if (inserted.error) {
    // The other complete won the primary key. Its objects must stay.
    if (isUniqueViolation(inserted.error)) {
      const won = await ownMedia(admin.accountId, mediaId);
      if (won instanceof Response) return won;
      if (won) return json({ id: mediaId });
    }
    const missing = isMissingSchema(inserted.error);
    return discard(
      admin.accountId,
      mediaId,
      [path, thumbPath],
      missing ? VIDEO_UNAVAILABLE : "Couldn't save that video. Try again.",
      missing ? 503 : 500,
    );
  }
  return json({ id: mediaId }, 201);
}

/** True when this account already has the row. A lookup failure is a 500 response. */
async function ownMedia(accountId: string, mediaId: string): Promise<true | Response | null> {
  const existing = await db().from("media").select("id").eq("id", mediaId).eq("account_id", accountId).maybeSingle();
  if (existing.error) return fail("Couldn't save that video. Try again.", 500);
  return existing.data ? true : null;
}

/** Remove a rejected upload unless a concurrent complete already saved this account's row. */
async function discard(accountId: string, mediaId: string, paths: string[], message: string, status: number) {
  const won = await ownMedia(accountId, mediaId);
  if (won instanceof Response) return won;
  if (won) return json({ id: mediaId });
  await removeStored(paths);
  return fail(message, status);
}

function isUniqueViolation(error: { code?: string; message?: string }) {
  if (error.code === "23505") return true;
  return /duplicate key/i.test(error.message ?? "");
}

// Storage returns this on the error object, not as a thrown exception.
// HTTP status is often 400 while statusCode is "409". Newer responses use code ResourceAlreadyExists.
function storageAlreadyExists(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const record = error as { message?: unknown; statusCode?: unknown; code?: unknown };
  const code = String(record.statusCode ?? record.code ?? "");
  if (code === "409" || code === "Duplicate" || code === "ResourceAlreadyExists") return true;
  return typeof record.message === "string" && /already exists/i.test(record.message);
}

function positiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function decodeThumb(input: unknown): Uint8Array | null {
  if (typeof input !== "string" || input.length < 16 || input.length > MAX_THUMB_BYTES * 2) return null;
  const cleaned = input.replace(/^data:image\/jpeg;base64,/i, "").replace(/\s/g, "");
  const bytes = Buffer.from(cleaned, "base64");
  if (bytes.length < 4 || bytes.length > MAX_THUMB_BYTES) return null;
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return null;
  return bytes;
}
