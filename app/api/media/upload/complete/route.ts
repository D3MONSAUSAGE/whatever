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
import { fail, json, readJson } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Confirms a direct-to-Storage upload: codec, duration, dimensions, then the library row.
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

  const path = `${admin.accountId}/${mediaId}.mp4`;
  const thumbPath = `${admin.accountId}/${mediaId}-thumb.jpg`;
  const existing = await db().from("media").select("id").eq("id", mediaId).eq("account_id", admin.accountId).maybeSingle();
  if (existing.error) return fail("Couldn't save that video. Try again.", 500);
  if (existing.data) return json({ id: mediaId });

  const bytes = await readStoredObject(path);
  if (!bytes) return fail("Upload didn't arrive. Try again.", 400);
  if (bytes.length > MAX_VIDEO_BYTES) {
    await removeStored([path]);
    return fail(mp4ErrorMessage("size"), 413);
  }

  const inspected = await inspectMp4(memorySource(bytes));
  if (!inspected.ok) {
    await removeStored([path]);
    return fail(mp4ErrorMessage(inspected.reason), 415);
  }
  const limited = enforceVideoLimits(inspected, bytes.length);
  if (limited) {
    await removeStored([path]);
    return fail(mp4ErrorMessage(limited), limited === "size" ? 413 : 415);
  }

  const thumb = decodeThumb(body.thumbnailBase64);
  if (!thumb) {
    await removeStored([path]);
    return fail("Couldn't save the preview image for that video. Try again.", 415);
  }
  const uploaded = await db().storage.from(BUCKET).upload(thumbPath, thumb, {
    contentType: "image/jpeg",
    cacheControl: "86400",
    upsert: false,
  });
  if (uploaded.error) {
    await removeStored([path, thumbPath]);
    return fail("Couldn't save that video. Try again.", 500);
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
    await removeStored([path, thumbPath]);
    if (isMissingSchema(inserted.error)) return fail(VIDEO_UNAVAILABLE, 503);
    return fail("Couldn't save that video. Try again.", 500);
  }
  return json({ id: mediaId }, 201);
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
