import { BUCKET, db } from "@/lib/server/supabase";
import { requireAdmin } from "@/lib/server/auth";
import { checkImage } from "@/lib/server/images";
import { MAX_UPLOAD_BYTES, UPLOAD_MAX_PER_USER, UPLOAD_RATE_MESSAGE, UPLOAD_WINDOW_SECONDS } from "@/lib/server/limits";
import { isMissingSchema } from "@/lib/server/schema";
import { usageByMedia } from "@/lib/server/media-usage";
import { normalizeFileName, uploadSizeError } from "@/lib/server/validate";
import { enforceLimit, fail, json } from "@/lib/server/http";

const MEDIA_COLUMNS = "id, file_name, storage_path, size_bytes, created_at";
const MEDIA_COLUMNS_VIDEO = `${MEDIA_COLUMNS}, kind, duration_ms, width, height, thumbnail_path`;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asBlob(value: FormDataEntryValue | null): Blob | null {
  if (!value || typeof value === "string") return null;
  if (typeof value.arrayBuffer !== "function" || typeof value.size !== "number") return null;
  return value;
}

export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;

  const rich = await db()
    .from("media")
    .select(MEDIA_COLUMNS_VIDEO)
    .eq("account_id", admin.accountId)
    .order("created_at", { ascending: false });
  let rows = rich.data as MediaRow[] | null;
  let error = rich.error;
  if (error && isMissingSchema(error)) {
    const plain = await db()
      .from("media")
      .select(MEDIA_COLUMNS)
      .eq("account_id", admin.accountId)
      .order("created_at", { ascending: false });
    rows = plain.data as MediaRow[] | null;
    error = plain.error;
  }
  if (error) return fail("Couldn't load images.", 500);

  const usage = await usageByMedia(admin.accountId);
  const urls = new Map<string, string>();
  const paths = [...new Set((rows ?? []).flatMap((row) => [row.storage_path, row.thumbnail_path].filter(Boolean)))] as string[];
  if (paths.length) {
    const { data } = await db().storage.from(BUCKET).createSignedUrls(paths, 3600);
    data?.forEach((s) => s.path && s.signedUrl && urls.set(s.path, s.signedUrl));
  }
  return json(
    (rows ?? []).map((r) => ({
      id: r.id,
      fileName: r.file_name,
      sizeBytes: r.size_bytes,
      createdAt: r.created_at,
      url: urls.get(r.storage_path) ?? null,
      kind: r.kind === "video" ? "video" : "image",
      durationMs: r.duration_ms ?? null,
      width: r.width ?? null,
      height: r.height ?? null,
      thumbnailUrl: r.thumbnail_path ? urls.get(r.thumbnail_path) ?? null : null,
      usedIn: usage?.get(r.id) ?? [],
    })),
  );
}

type MediaRow = {
  id: string;
  file_name: string;
  storage_path: string;
  size_bytes: number;
  created_at: string;
  kind?: string | null;
  duration_ms?: number | null;
  width?: number | null;
  height?: number | null;
  thumbnail_path?: string | null;
};

export async function POST(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("Upload a JPG, PNG, or WebP image.", 400);
  }
  const file = asBlob(form.get("file"));
  if (!file) return fail("Upload a JPG, PNG, or WebP image.", 400);
  const sizeError = uploadSizeError(file.size);
  if (sizeError) return fail(sizeError, file.size > MAX_UPLOAD_BYTES ? 413 : 400);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = checkImage(bytes);
  if (!type.ok) {
    return fail(
      type.reason === "dimensions"
        ? "That image is too large. Use 7680×4320 or smaller."
        : "That file isn't a JPG, PNG, or WebP image.",
      415,
    );
  }

  const limited = await enforceLimit(`upload-image:${admin.userId}`, UPLOAD_WINDOW_SECONDS, UPLOAD_MAX_PER_USER, UPLOAD_RATE_MESSAGE);
  if (limited) return limited;

  const fileName = normalizeFileName(form.get("name"));
  const id = crypto.randomUUID();
  const path = `${admin.accountId}/${id}.${type.ext}`;

  const { error: upErr } = await db()
    .storage.from(BUCKET)
    .upload(path, bytes, { contentType: type.mime, cacheControl: "3600", upsert: false });
  if (upErr) return fail("Upload failed. Try again.", 500);

  const { error: rowErr } = await db().from("media").insert({
    id,
    account_id: admin.accountId,
    file_name: fileName,
    storage_path: path,
    mime_type: type.mime,
    size_bytes: bytes.length,
  });
  if (rowErr) {
    await db().storage.from(BUCKET).remove([path]);
    return fail("Upload failed. Try again.", 500);
  }
  return json({ id }, 201);
}
